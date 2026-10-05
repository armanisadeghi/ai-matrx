import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";

jest.mock("@/providers/ReactQueryProvider", () => ({
  ReactQueryProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/providers/StoreProvider", () => ({
  __esModule: true,
  default: ({ children, initialState }: { children: ReactNode; initialState: { user: { id: string; email: string } } }) => {
    const store = configureStore({ reducer: () => ({ userAuth: initialState.user }) });
    return <Provider store={store}>{children}</Provider>;
  },
}));
const mockCanonicalProviders = jest.fn();
jest.mock("@/app/Providers", () => ({
  Providers: ({ children, initialReduxState }: { children: ReactNode; initialReduxState: { user: { id: string; email: string } } }) => {
    mockCanonicalProviders(initialReduxState);
    const store = configureStore({ reducer: () => ({ userAuth: initialReduxState.user }) });
    return <Provider store={store}>{children}</Provider>;
  },
}));
const mockGetServerAuth = jest.fn();
const mockCreateClient = jest.fn();
const mockGetAdminStatus = jest.fn();
jest.mock("@/utils/supabase/getServerAuth", () => ({ getServerAuth: (...args: unknown[]) => mockGetServerAuth(...args) }));
jest.mock("@/utils/supabase/server", () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));
jest.mock("@/utils/supabase/userSessionData", () => ({ getAdminStatus: (...args: unknown[]) => mockGetAdminStatus(...args) }));
jest.mock("@/utils/userDataMapper", () => ({
  mapUserData: (user: { id: string; email: string } | null) => user ?? { id: null, email: null },
}));

import OAuthReviewLayout from "./layout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function AccountProbe() {
  const email = useSelector((state: { userAuth: { email: string | null } }) => state.userAuth.email);
  return <span>{email ?? "No account"}</span>;
}

test("standalone OAuth review pages provide the signed-in account to shared Google hooks", async () => {
  mockGetServerAuth.mockResolvedValue({ user: { id: "reviewer", email: "admin@admin.com" }, isAuthenticated: true, authUnavailable: false });
  mockCreateClient.mockResolvedValue({ auth: { getSession: async () => ({ data: { session: { access_token: "test-only" } } }) } });
  mockGetAdminStatus.mockResolvedValue({ isAdmin: true, level: "super_admin" });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    const tree = await OAuthReviewLayout({ children: <AccountProbe /> });
    await act(async () => root.render(tree));
    expect(container.textContent).toBe("admin@admin.com");
    expect(mockCanonicalProviders).toHaveBeenCalledWith({ user: { id: "reviewer", email: "admin@admin.com" } });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
