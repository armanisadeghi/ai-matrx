/**
 * 🚨 F-52 — THE AGENDA'S REFRESH-ON-OPEN MUST NOT FIRE FOR A DETACHED EVENT.
 *
 * `useAgenda`'s refresh-on-open effect spends a Google call only when the
 * window looks stale. Before this lane, staleness was `newestSyncedAt(events)`
 * over EVERY row — including a detached one, whose `synced_at` is frozen the
 * day someone chose "Keep as AI Matrx data" and will never move again. A
 * window whose only event is detached therefore looked permanently stale and
 * would spend a Google call on every open for a fact no call could ever
 * change.
 *
 * Same harness as
 * `the-refresh-runs-through-the-account-that-holds-calendar.test.tsx`: only the
 * provider STATE is stood in for; `useAgenda` itself and the real staleness
 * gate (`agendaIsStaleForOpen`) run unmocked.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EVENT_ID, ORG_ID, calendarEventRow } from "./fixtures";
import type { CalendarEventRow } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDENTITY = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned.readonly";

const CALENDAR_ACCOUNT = {
  id: "11111111-aaaa-bbbb-cccc-000000000001",
  label: "calendar-only@aimatrx.com",
  ownerKind: "person" as const,
  organizationId: null,
  providerSubject: "sub-1",
  grantedScopes: [...IDENTITY, CALENDAR_SCOPE],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-18T07:00:00Z",
  lastRefusalSentence: null,
};

const LIVE_CAPABILITIES = ["calendar"].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [] as string[],
  ineligibleReason: null,
}));

const state = {
  refreshedThrough: [] as string[],
  events: [] as CalendarEventRow[],
};

/**
 * THE FIXTURE LAW (F-107) — the slice builds its own state and the REAL
 * selectors read it. This file used to hand-write
 * `selectShouldPromptForOrganization` in the slice stand-in; the organization
 * gate now reads that rule from a pure leaf nobody mocks
 * (`lib/organizations/shouldPromptForOrganization.ts`), so a hand-written copy
 * is dead code that silently stops being consulted — and an empty state handed
 * to the real leaf reads as "boot has not answered yet", which is how the Tasks
 * import control's suite went red on 2026-09-19. One fixture, no re-implemented
 * rule, nothing to go stale.
 */
const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

const appContext = makeAppContextState({
  organization_id: ORG_ID,
  orgBootstrapResolved: true,
});

jest.mock("@/features/google-workspace/calendar/service", () => ({
  readAgendaEvents: async () => state.events,
  readAttendeePeople: async () => new Map(),
  refreshCalendarWindow: async ({ connectionId }: { connectionId: string }) => {
    state.refreshedThrough.push(connectionId);
    return {
      windowStart: "",
      windowEnd: "",
      events: [],
      attendeesLinked: 0,
      unmatchedAttendeeEmails: [],
    };
  },
  readCalendarEvent: async () => null,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector({ appContext }),
  useAppDispatch: () => () => {},
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "dddddddd-1111-2222-3333-444444444444",
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (
    _org: unknown,
    _user: unknown,
    ref: string | { feature: string; key: string },
  ) => {
    const address = typeof ref === "string" ? ref : `${ref.feature}.${ref.key}`;
    if (address === "google.calendar.agenda_days") return 7;
    if (address === "google.refresh.on_open_min_age_seconds") return 300;
    throw new Error(`the agenda asked for an unexpected knob: ${address}`);
  },
}));

jest.mock("@/features/connectors/google-adapter", () => ({
  GOOGLE_PROVIDER: jest.requireActual("@/features/connectors/provider-config")
    .GOOGLE_CONNECTOR_PROVIDER,
  useGoogleConnectorState: () => ({
    accounts: [CALENDAR_ACCOUNT],
    rollout: LIVE_CAPABILITIES,
    resourceCountByAccount: {},
    isLoading: false,
    rolloutUnavailable: false,
    isError: false,
    errorMessage: null,
    refetch: async () => {},
  }),
}));

import { useAgenda, type AgendaValue } from "../useAgenda";

let seen: AgendaValue | null = null;

function Probe() {
  seen = useAgenda();
  return null;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe />);
  });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

describe("the agenda's refresh-on-open, and a detached event", () => {
  beforeEach(() => {
    state.refreshedThrough = [];
    state.events = [];
    seen = null;
  });

  it("never fires the window refresh when the only event in the window is detached, however old", async () => {
    state.events = [
      calendarEventRow({
        sync_status: "detached",
        // Ancient — an `available` event this stale would have triggered one.
        synced_at: "2020-01-01T00:00:00Z",
      }),
    ];
    const unmount = await mount();
    expect(state.refreshedThrough).toEqual([]);
    expect(seen?.groups.some((group) => group.events.some((e) => e.id === EVENT_ID))).toBe(
      true,
    );
    unmount();
  });

  it("still fires the window refresh when an available event in the window is stale (positive control)", async () => {
    state.events = [calendarEventRow({ sync_status: "available", synced_at: "2020-01-01T00:00:00Z" })];
    const unmount = await mount();
    expect(state.refreshedThrough).toEqual([CALENDAR_ACCOUNT.id]);
    unmount();
  });
});
