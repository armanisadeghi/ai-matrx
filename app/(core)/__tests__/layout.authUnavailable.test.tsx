/**
 * `(core)` is the whole main application, and its shell chrome is decided by a
 * SERVER prop. That makes an unresolved identity uniquely expensive here:
 * `isAuthenticated={false}` is what strips the nav items, the favorites group,
 * the org switcher and the inbox, and swaps the user block for a Sign In
 * button. The client re-resolves identity after hydration and repairs Redux,
 * but it never revisits that prop — so a guest shell painted over a 2.5s
 * network blink SITS THERE, lying, until the next navigation.
 *
 * So: when the identity resolve could not reach a verdict, this layout holds
 * and says so. It does NOT paint a signed-out shell, and it does NOT redirect.
 *
 * The guest case is asserted alongside it on purpose — the fix would be worth
 * nothing if it held for people who are simply not signed in.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import AppLayout from "../layout";
import { headers } from "next/headers";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { getAdminStatus } from "@/utils/supabase/userSessionData";

jest.mock("server-only", () => ({}));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("@/utils/supabase/getServerAuth", () => ({ getServerAuth: jest.fn() }));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
  })),
}));
jest.mock("@/utils/supabase/userSessionData", () => ({ getAdminStatus: jest.fn() }));
jest.mock("@/features/shell/utils/server-cookies", () => ({
  readSidebarExpandedCookie: jest.fn(async () => true),
}));
jest.mock("@/lib/product-analytics/InternalGoogleAnalytics", () => ({
  InternalGoogleAnalytics: () => null,
}));

/** Capture the shell's props — `isAuthenticated` is the whole point. */
const shellProps: { isAuthenticated?: boolean }[] = [];
jest.mock("@/features/shell/components/AppShell", () => ({
  __esModule: true,
  default: ({ children, isAuthenticated }: { children: ReactNode; isAuthenticated: boolean }) => {
    shellProps.push({ isAuthenticated });
    return <div data-testid="shell">{children}</div>;
  },
}));

const mockedHeaders = jest.mocked(headers);
const mockedGetServerAuth = jest.mocked(getServerAuth);
const mockedGetAdminStatus = jest.mocked(getAdminStatus);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(children: ReactNode): Promise<string> {
  const element = await AppLayout({ children });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  const text = container.textContent ?? "";
  act(() => root.unmount());
  container.remove();
  return text;
}

beforeEach(() => {
  shellProps.length = 0;
  jest.clearAllMocks();
  mockedHeaders.mockResolvedValue(new Map([["x-pathname", "/chat"]]) as never);
  mockedGetAdminStatus.mockResolvedValue({ isAdmin: false, level: null });
});

describe("(core) layout — an authority we could not reach is not a logout", () => {
  it("HOLDS when authUnavailable, instead of rendering the page as a guest", async () => {
    mockedGetServerAuth.mockResolvedValue({ user: null, isAuthenticated: false, authUnavailable: true });
    const text = await render(<span>the page</span>);

    expect(text).toContain("You have not been signed out");
    // The page's own content must NOT render under an unresolved identity —
    // holding while still rendering the page would be the lie, not the fix.
    expect(text).not.toContain("the page");
  });

  it("does no data work on a held request", async () => {
    mockedGetServerAuth.mockResolvedValue({ user: null, isAuthenticated: false, authUnavailable: true });
    await render(<span>the page</span>);
    // Nothing to look up for an identity we do not have, and an admin probe on
    // every stalled request is load the auth outage does not need.
    expect(mockedGetAdminStatus).not.toHaveBeenCalled();
  });

  it("still renders the page for a genuine GUEST — the flag is clear", async () => {
    mockedGetServerAuth.mockResolvedValue({ user: null, isAuthenticated: false, authUnavailable: false });
    const text = await render(<span>the page</span>);

    expect(text).toContain("the page");
    expect(text).not.toContain("You have not been signed out");
    expect(shellProps.at(-1)?.isAuthenticated).toBe(false);
  });

  it("renders the signed-in shell normally", async () => {
    mockedGetServerAuth.mockResolvedValue({
      user: { id: "u-1", app_metadata: {}, user_metadata: {} } as never,
      isAuthenticated: true,
      authUnavailable: false,
    });
    const text = await render(<span>the page</span>);

    expect(text).toContain("the page");
    expect(shellProps.at(-1)?.isAuthenticated).toBe(true);
  });
});
