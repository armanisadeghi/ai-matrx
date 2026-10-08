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
let mockStoredPasses: Record<string, string> = {};
let mockMeetingBySlugError: object | null = null;

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/meet/lib/meetBaseUrl", () => ({
  meetBaseUrl: () => "https://www.aimatrx.com",
}));
jest.mock("@/features/meet/app-panels/registry", () => ({ MEET_APP_PANELS: {} }));
jest.mock("@ai-matrx/meet/react", () => ({
  createMeetRepository: () => ({
    meetingBySlug: async () => {
      if (mockMeetingBySlugError !== null) throw mockMeetingBySlugError;
      return {
      id: "meeting-1",
      roomName: "room-1",
      slug: "meeting-1",
      title: "Weekly review",
      organizationId: "org-meeting",
      endedAt: "2026-09-12T00:00:00.000Z",
      };
    },
  }),
  MeetProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="guest-provider">{children}</div>
  ),
  MeetingSkinRoot: () => <div data-testid="member-room" />,
  MeetRoot: ({
    children,
    phase,
    reason,
  }: {
    children?: React.ReactNode;
    phase?: string;
    reason?: string | null;
  }) => (
    <div data-meet-phase={phase} data-meet-reason={reason ?? undefined}>
      {children}
    </div>
  ),
  isJoinRefusalReason: (value: unknown) =>
    typeof value === "string" &&
    ["not_found", "cancelled", "ended", "locked", "removed"].includes(value),
  MeetAppPanels: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useMeetHost: () => mockMeetHost,
  useMeetSnapshot: () => null,
  MEETING_PASS_HEADER: "x-meet-pass",
  rememberedMeetingPass: (room: string) => {
    const raw = mockStoredPasses[room];
    if (raw === undefined) return null;
    const parsed = JSON.parse(raw) as { standing?: string; meetingPass?: string };
    return parsed.standing === "guest" ? (parsed.meetingPass ?? null) : null;
  },
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

  it("🚨 a meeting in ANOTHER organization than the active one runs scoped to the MEETING's own organization (active-org law, rule 5)", async () => {
    mockActiveOrganizationId = "org-other";
    mockMeetHost = { identity: { organizationId: "org-other" } };
    mockOrganizations = { "org-meeting": { id: "org-meeting" }, "org-other": { id: "org-other" } };
    const surface = await renderSurface(true, { ...guestAuth, id: "member-1", authReady: true });

    // The ambient host is bound to the active org, so the room is wrapped in a
    // provider scoped to the meeting's org (the mock renders it as a div).
    expect(surface.container.querySelector('[data-testid="guest-provider"]')).not.toBeNull();
    surface.unmount();
  });

  it("a meeting in the ACTIVE organization keeps the ambient host — no second provider", async () => {
    mockActiveOrganizationId = "org-meeting";
    mockMeetHost = { identity: { organizationId: "org-meeting" } };
    mockOrganizations = { "org-meeting": { id: "org-meeting" } };
    const surface = await renderSurface(true, { ...guestAuth, id: "member-1", authReady: true });

    expect(surface.container.querySelector('[data-testid="guest-provider"]')).toBeNull();
    expect(surface.container.querySelector('[data-testid="member-room"]')).not.toBeNull();
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

  it("🚨 a person OUTSIDE the meeting's organization with no active organization is never stopped at the door — the guest lane, no organization prompt (Arman, 2026-10-01)", async () => {
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

    expect(surface.container.querySelector('[data-testid="organization-recovery"]')).toBeNull();
    expect(surface.container.querySelector('[data-testid="guest-provider"]')).not.toBeNull();
    // Already signed in: no "create an account" offer.
    expect(surface.container.textContent).not.toContain("Create free account");
    surface.unmount();
    jest.useRealTimers();
  });

  it("a guest looking at a finished meeting is OFFERED a free account that comes back to claim — the record still renders", async () => {
    const surface = await renderSurface(false, { ...guestAuth, authReady: true });

    const link = surface.container.querySelector('a[href^="/sign-up"]');
    expect(link).not.toBeNull();
    const href = decodeURIComponent(link!.getAttribute("href") ?? "");
    expect(href).toContain("/meet/meeting-1?claim=1");
    expect(surface.container.querySelector('[data-testid="member-room"]')).not.toBeNull();
    surface.unmount();
  });

  it("back from sign-up with ?claim=1, the kept guest pass is presented ONCE with the new session", async () => {
    const request = jest.fn(
      async () => new Response(JSON.stringify({ claimed: true, access: "full" }), { status: 200 }),
    );
    mockActiveOrganizationId = "org-mine";
    mockMeetHost = { identity: { organizationId: "org-mine" }, api: { request } };
    mockStoredPasses = {
      "room-1": JSON.stringify({ token: "livekit.jwt", meetingPass: "a.guest.pass", standing: "guest" }),
    };
    window.history.replaceState(null, "", "/meet/meeting-1?claim=1");
    const surface = await renderSurface(true, { ...guestAuth, id: "member-1", authReady: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledTimes(1);
    const call = (request.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(call.path).toBe("/api/v1/meet/claim");
    expect(call.requireAuth).toBe(true);
    expect(call.headers).toEqual({ "x-meet-pass": "a.guest.pass" });
    expect(call.body).toEqual({ meeting_id: "meeting-1" });
    expect(window.location.search).toBe("");
    surface.unmount();
    mockStoredPasses = {};
  });

  it("without ?claim=1 a kept pass is never claimed by whoever signs in", async () => {
    const request = jest.fn();
    mockActiveOrganizationId = "org-mine";
    mockMeetHost = { identity: { organizationId: "org-mine" }, api: { request } };
    mockStoredPasses = { "room-1": JSON.stringify({ meetingPass: "a.guest.pass", standing: "guest" }) };
    window.history.replaceState(null, "", "/meet/meeting-1");
    const surface = await renderSurface(true, { ...guestAuth, id: "member-1", authReady: true });
    expect(request).not.toHaveBeenCalled();
    surface.unmount();
    mockStoredPasses = {};
  });

  it("a link that names no meeting shows the not-found screen decided by the reason CODE, whatever the words say", async () => {
    mockMeetingBySlugError = Object.assign(new Error("something reworded entirely"), {
      code: "not-found",
      reason: "not_found",
      remedy: "retry in a moment",
    });
    try {
      const surface = await renderSurface(false);
      const root = surface.container.querySelector("[data-meet-phase]");
      expect(root?.getAttribute("data-meet-phase")).toBe("refused:not_found");
      expect(root?.getAttribute("data-meet-reason")).toBe("not_found");
      expect(surface.container.textContent).toContain("No meeting matches that link.");
      expect(surface.container.textContent).not.toContain("retry in a moment");
      surface.unmount();
    } finally {
      mockMeetingBySlugError = null;
    }
  });

  it("the old message-text match no longer decides anything: the words alone are NOT a not-found screen", async () => {
    mockMeetingBySlugError = new Error("meet_meeting_by_slug: no meeting for that link");
    try {
      const surface = await renderSurface(false);
      const root = surface.container.querySelector("[data-meet-phase]");
      expect(root?.getAttribute("data-meet-phase")).toBe("disconnected");
      surface.unmount();
    } finally {
      mockMeetingBySlugError = null;
    }
  });
});
