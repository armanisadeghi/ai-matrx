import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import userAuthReducer, {
  setAuthReady,
  setUserAuth,
} from "@/lib/redux/slices/userAuthSlice";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import { MeetingSurface } from "./MeetingSurface";

let mockMeetHost: object | null = { participant: { identity: "member-1" } };
let mockActiveOrganizationId: string | null = null;
let mockOrganizations: Record<string, object> = {};

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/meet/lib/meetBaseUrl", () => ({
  meetBaseUrl: () => "https://www.aimatrx.com",
}));
jest.mock("@ai-matrx/meet/react", () => ({
  createMeetRepository: () => ({
    meetingBySlug: async () => ({
      id: "meeting-1",
      roomName: "room-1",
      slug: "meeting-1",
      title: "Weekly review",
      organizationId: "org-meeting",
      endedAt: "2026-09-12T00:00:00.000Z",
    }),
  }),
  MeetProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="guest-provider">{children}</div>
  ),
  MeetingRoom: () => <div data-testid="member-room" />,
  useMeetHost: () => mockMeetHost,
  useMeetSnapshot: () => null,
}));
jest.mock("@/features/meet/components/board/MeetingBoard", () => ({
  MeetingBoard: () => <div data-testid="meeting-board" />,
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => mockActiveOrganizationId,
}));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizations: () => mockOrganizations,
}));
jest.mock("@/providers/MeetHost", () => ({
  useMeetMemberIdentity: () => ({}),
}));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationRequiredNotice: () => <div data-testid="organization-recovery" />,
}));

const guestAuth: UserAuthState = {
  id: null,
  createdAt: null,
  isAnonymous: false,
  email: null,
  phone: null,
  emailConfirmedAt: null,
  lastSignInAt: null,
  appMetadata: { provider: null, providers: [] },
  identities: [],
  isAdmin: false,
  adminLevel: null,
  accessToken: null,
  tokenExpiresAt: null,
  authReady: false,
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderSurface(serverAuthenticated: boolean, auth = guestAuth) {
  const store = configureStore({
    reducer: { userAuth: userAuthReducer },
    preloadedState: { userAuth: auth },
  });
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <Provider store={store}>
        <MeetingSurface slug="meeting-1" isAuthenticated={serverAuthenticated} />
      </Provider>,
    );
  });
  return {
    container,
    store,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("MeetingSurface authentication hydration", () => {
  beforeEach(() => {
    mockMeetHost = { participant: { identity: "member-1" } };
    mockActiveOrganizationId = null;
    mockOrganizations = {};
  });

  it("🚨 a signed-in member of the meeting's organization with NO active organization walks straight in — scoped to the meeting's organization, never asked to choose", async () => {
    mockMeetHost = null;
    mockOrganizations = { "org-meeting": { id: "org-meeting" } };
    const surface = await renderSurface(true, {
      ...guestAuth,
      id: "member-1",
      authReady: true,
    });

    expect(surface.container.querySelector('[data-testid="organization-recovery"]')).toBeNull();
    // The meeting-scoped provider wraps the room (the mock renders it as a div).
    const scoped = surface.container.querySelector('[data-testid="guest-provider"]');
    expect(scoped).not.toBeNull();
    expect(surface.container.textContent).not.toContain("Preparing your meeting");
    surface.unmount();
  });

  it("keeps the server guest lane while browser authentication is unresolved, then replaces it when Redux resolves a member", async () => {
    const surface = await renderSurface(false);

    expect(surface.container.querySelector('[data-testid="guest-provider"]')).not.toBeNull();

    act(() => {
      surface.store.dispatch(setUserAuth({ id: "member-1" }));
    });

    expect(surface.container.querySelector('[data-testid="member-room"]')).not.toBeNull();
    expect(surface.container.querySelector('[data-testid="guest-provider"]')).toBeNull();
    surface.unmount();
  });

  it("keeps the server member lane until browser authentication has explicitly resolved anonymous", async () => {
    const surface = await renderSurface(true);

    expect(surface.container.querySelector('[data-testid="member-room"]')).not.toBeNull();

    act(() => {
      surface.store.dispatch(setAuthReady(true));
    });

    expect(surface.container.querySelector('[data-testid="guest-provider"]')).not.toBeNull();
    surface.unmount();
  });

  it("a person OUTSIDE the meeting's organization with no active organization still gets the canonical picker (server admission needs one of theirs)", async () => {
    jest.useFakeTimers();
    mockMeetHost = null;
    const surface = await renderSurface(true, {
      ...guestAuth,
      id: "member-1",
      authReady: true,
    });

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(surface.container.querySelector('[data-testid="organization-recovery"]')).not.toBeNull();
    expect(surface.container.textContent).not.toContain("reload this link");
    surface.unmount();
    jest.useRealTimers();
  });
});
