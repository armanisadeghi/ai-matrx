/**
 * 🚨 THE AGENDA IS ABSENT OR HONEST — NEVER BLANK, NEVER A DEAD CONTROL (law 4).
 *
 * Four states a calendar surface gets wrong, each asserted on the REAL component:
 *
 *  1. NO GOOGLE ACCOUNT — the ONE connector prompt card, never a second card of
 *     our own, and no Refresh control (there is nothing it could refresh).
 *  2. CONNECTED AND EMPTY — it says the calendar is connected and empty, which is
 *     a different claim from "we do not know", and Today/Tomorrow still appear.
 *  3. UNREADABLE — it says what failed. An unreadable agenda that rendered as an
 *     empty day would be the screen inventing good news.
 *  4. STALE vs FRESH — refresh on open fires ONCE for stale rows and NEVER for
 *     fresh ones. A surface that refreshed on every open spends a Google call per
 *     visit; one that never refreshed would show yesterday forever.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  rows: [] as unknown[],
  readError: null as string | null,
  refreshCalls: 0,
  accounts: [] as Record<string, unknown>[],
  knobDays: 7 as unknown,
  knobMinAge: 300 as unknown,
};

jest.mock("@/features/google-workspace/calendar/service", () => ({
  readAgendaEvents: async () => {
    if (state.readError) throw new Error(state.readError);
    return state.rows;
  },
  readAttendeePeople: async () => new Map(),
  refreshCalendarWindow: async () => {
    state.refreshCalls += 1;
    return { windowStart: "", windowEnd: "", events: [], attendeesLinked: 0, unmatchedAttendeeEmails: [] };
  },
  createNoteAboutEvent: async () => ({
    noteId: "note-1",
    linkedToEvent: true,
    linkedPartyIds: [],
    failures: [],
  }),
  readPartyEmailKeys: async () => [],
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

/**
 * A knob is addressed by the register's own (feature, key) PAIR, and this mock
 * matches on the pair for exactly that reason: a mock that matched a dotted
 * string would keep passing while the surface asked for a different address.
 */
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (
    _org: unknown,
    _user: unknown,
    ref: string | { feature: string; key: string },
  ) => {
    const address = typeof ref === "string" ? ref : `${ref.feature}.${ref.key}`;
    if (address === "google.calendar.agenda_days") return state.knobDays;
    if (address === "google.refresh.on_open_min_age_seconds") return state.knobMinAge;
    throw new Error(`the agenda asked for an unexpected knob: ${address}`);
  },
}));

jest.mock("@/features/connectors/google-adapter", () => ({
  GOOGLE_PROVIDER: { key: "google", products: [{ key: "calendar", name: "Calendar" }] },
  useGoogleConnectorState: () => ({
    accounts: state.accounts,
    rollout: [],
    resourceCountByAccount: {},
    isLoading: false,
    rolloutUnavailable: false,
    isError: false,
    errorMessage: null,
    refetch: async () => {},
  }),
}));

jest.mock("@/features/connectors/health", () => ({
  accountHealth: () =>
    state.accounts.length > 0
      ? [
          {
            product: { key: "calendar", name: "Calendar" },
            state: "connected",
            label: "Connected",
            reason: "",
            remedy: null,
          },
        ]
      : [],
  preferredAccountId: () => (state.accounts[0]?.id as string | undefined) ?? null,
}));

// The prompt card is the ONE connector offer; this stands in for it so the test
// can prove the agenda renders THAT and not a card of its own.
jest.mock("@/features/connectors/ConnectorPromptHost", () => ({
  ConnectorPromptHost: () => <div data-prompt-card="the one connector card" />,
}));

jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => async () => "window",
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string | null }) => <span data-entity-ref>{name}</span>,
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AgendaPanel } from "../AgendaPanel";
import { CALENDAR_EVENT_ATTENDEES_KIND } from "../types";

function row(overrides: Record<string, unknown>) {
  return {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    provider: "google",
    external_id: "g1",
    calendar_id: "primary",
    title: "Consult",
    starts_at: new Date().toISOString(),
    ends_at: null,
    all_day: false,
    location: null,
    meeting_url: null,
    attendees: { __kind: CALENDAR_EVENT_ATTENDEES_KIND, attendees: [] },
    organizer_email: null,
    external_updated_at: null,
    synced_at: new Date().toISOString(),
    synced_via_connection_id: null,
    sync_status: "available",
    sync_status_reason: null,
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    created_by: "dddddddd-1111-2222-3333-444444444444",
    updated_by: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    visibility: "personal",
    ...overrides,
  };
}

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    get text() {
      return container.textContent ?? "";
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  state.rows = [];
  state.readError = null;
  state.refreshCalls = 0;
  state.accounts = [];
  state.knobDays = 7;
  state.knobMinAge = 300;
});

describe("with no Google account", () => {
  it("shows the ONE connector prompt card and offers no Refresh", async () => {
    const m = await mount(<AgendaPanel />);
    try {
      expect(m.container.querySelector("[data-prompt-card]")).not.toBeNull();
      expect(m.text).not.toContain("Refresh");
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });
});

describe("connected and empty", () => {
  it("says so, and still names Today and Tomorrow", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("Today");
      expect(m.text).toContain("Tomorrow");
      expect(m.text).toContain("Nothing on your calendar");
      expect(m.text).toContain("there is nothing on it in the next 7 days");
      // "we do not know" is a different claim, and this is not it.
      expect(m.container.querySelector("[data-prompt-card]")).toBeNull();
    } finally {
      m.unmount();
    }
  });
});

describe("when the agenda cannot be read", () => {
  it("says what failed instead of rendering an empty day", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.readError = "permission denied for table calendar_event";
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("Your calendar could not be read");
      expect(m.text).toContain("permission denied");
      expect(m.text).not.toContain("there is nothing on it");
    } finally {
      m.unmount();
    }
  });
});

describe("refresh on open", () => {
  it("does NOT call Google when the rows are fresher than the knob", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.rows = [row({ synced_at: new Date(Date.now() - 30_000).toISOString() })];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.refreshCalls).toBe(0);
      expect(m.text).toContain("Consult");
    } finally {
      m.unmount();
    }
  });

  it("calls Google ONCE when they are older than the knob", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.rows = [row({ synced_at: new Date(Date.now() - 3_600_000).toISOString() })];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.refreshCalls).toBe(1);
    } finally {
      m.unmount();
    }
  });

  it("calls Google when nothing has ever been refreshed", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.rows = [row({ synced_at: null })];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.refreshCalls).toBe(1);
      expect(m.text).toContain("Never refreshed from Google");
    } finally {
      m.unmount();
    }
  });

  it("honours a knob that says never refresh on open", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.knobMinAge = 86_400;
    state.rows = [row({ synced_at: new Date(Date.now() - 3_600_000).toISOString() })];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });
});

describe("a row", () => {
  it("names the event as a door, and offers the meeting link and a note", async () => {
    state.accounts = [{ id: "conn-1", usable: true }];
    state.rows = [
      row({
        title: "Consult — Dr Chen",
        meeting_url: "https://meet.google.com/abc",
        location: "Suite 300",
      }),
    ];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.container.querySelector("[data-entity-ref]")?.textContent).toBe(
        "Consult — Dr Chen",
      );
      expect(m.text).toContain("Join the meeting");
      expect(m.text).toContain("Open in Google Calendar");
      expect(m.text).toContain("Create a note");
      expect(m.text).toContain("Suite 300");
      // The marker never reaches a person's screen as content.
      expect(m.text).not.toContain("__kind");
    } finally {
      m.unmount();
    }
  });
});
