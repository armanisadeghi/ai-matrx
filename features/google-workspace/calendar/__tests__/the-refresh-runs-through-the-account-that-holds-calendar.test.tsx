/**
 * 🚨 THE AGENDA REFRESHES THROUGH THE ACCOUNT THAT HOLDS CALENDAR — NOT THROUGH
 * THE ACCOUNT THAT HOLDS THE MOST OF EVERYTHING ELSE.
 *
 * THE DEFECT THIS PINS (lane F-51, escalated from U-W2). `preferredAccountId`
 * ranked connected accounts by the NUMBER of live products, and this hook asked
 * it for an account with no idea which product it was about to serve. A person
 * with Calendar granted on one Google account and five other products granted on
 * another got the second one: the panel then read Calendar's health on an account
 * that does not hold Calendar, said the calendar was not connected, and the
 * doomed-call gate correctly refused to refresh — so the surface told the person
 * their calendar was not connected while the account beside it could have served
 * it, with no way to find that out.
 *
 * The real `features/connectors/health.ts` derivation runs here: nothing in this
 * file decides which account is healthy, so the test cannot pass by agreeing with
 * a mock about the answer.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDENTITY = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const CONTACTS = "https://www.googleapis.com/auth/contacts.readonly";
const TASKS = "https://www.googleapis.com/auth/tasks.readonly";
const TAG_MANAGER = "https://www.googleapis.com/auth/tagmanager.readonly";

/** The account that holds Calendar and nothing else. One live product. */
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

/** The bigger collection — four live products, and no Calendar at all. */
const EVERYTHING_ELSE_ACCOUNT = {
  ...CALENDAR_ACCOUNT,
  id: "22222222-aaaa-bbbb-cccc-000000000002",
  label: "everything-else@aimatrx.com",
  providerSubject: "sub-2",
  grantedScopes: [
    ...IDENTITY,
    DRIVE_FILE,
    GMAIL_SEND,
    CONTACTS,
    TASKS,
    TAG_MANAGER,
  ],
};

const LIVE_CAPABILITIES = [
  "drive_files",
  "docs",
  "sheets",
  "slides",
  "gmail_send",
  "calendar",
  "contacts",
  "tasks",
  "tag_manager",
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [] as string[],
  ineligibleReason: null,
}));

const state = {
  refreshedThrough: [] as string[],
};

jest.mock("@/features/google-workspace/calendar/service", () => ({
  // No events at all: the window is stale by definition, which is exactly when a
  // refresh-on-open must run — and when the wrong account silently costs a person
  // their whole agenda.
  readAgendaEvents: async () => [],
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
  useAppSelector: (selector: (s: unknown) => unknown) => selector({}),
  useAppDispatch: () => () => {},
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
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

/**
 * Only the provider STATE is stood in for — the provider CONFIG and the whole
 * health derivation are the real ones, because they are what is under test.
 */
jest.mock("@/features/connectors/google-adapter", () => ({
  GOOGLE_PROVIDER: jest.requireActual("@/features/connectors/provider-config")
    .GOOGLE_CONNECTOR_PROVIDER,
  useGoogleConnectorState: () => ({
    // Inventory order puts the bigger account FIRST, so a tie-break by order
    // cannot be what makes this pass.
    accounts: [EVERYTHING_ELSE_ACCOUNT, CALENDAR_ACCOUNT],
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

describe("two Google accounts, and only the smaller one holds Calendar", () => {
  beforeEach(() => {
    state.refreshedThrough = [];
    seen = null;
  });

  it("reads Calendar's health on the account that holds Calendar", async () => {
    const unmount = await mount();
    expect(seen?.connectionId).toBe(CALENDAR_ACCOUNT.id);
    expect(seen?.productHealth?.state).toBe("connected");
    unmount();
  });

  it("never tells the person Calendar is not connected while an account holds it", async () => {
    const unmount = await mount();
    expect(seen?.productHealth?.state).not.toBe("not_connected");
    expect(seen?.noAccount).toBe(false);
    unmount();
  });

  it("refreshes through that account, and the doomed-call gate still lets it run", async () => {
    const unmount = await mount();
    expect(state.refreshedThrough).toEqual([CALENDAR_ACCOUNT.id]);
    unmount();
  });
});
