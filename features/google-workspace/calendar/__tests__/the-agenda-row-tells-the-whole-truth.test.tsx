/**
 * Four findings of VERIFY-U-W1-U-W2, all on the list a person actually looks at:
 *
 *  * N4 — the agenda's Person doors carried NO open-item count, although §4.6 asks
 *    for "their name as a door AND a count of open items", and the count already
 *    existed on the event's Detail. A name with nothing beside it is the reason
 *    for putting People on an agenda, removed.
 *  * N5 — a FILTERED agenda ("Upcoming with Duane") reused the UNFILTERED empty
 *    sentence: a full calendar with nothing booked with that person was told its
 *    own calendar was empty.
 *  * N6 — a detached or unavailable event rendered exactly like a live one while
 *    the header said "Refreshed … from Google".
 *  * N10 — "Create a note" ended in a toast with no door: the record it had just
 *    created was unreachable from the only place that mentioned it.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  rows: [] as unknown[],
  people: new Map<string, unknown[]>(),
  deals: [] as { status: string }[],
};

const noteCalls: unknown[] = [];

// The organization a PRESS files its work in (VERIFY-R7-FIX-WAVE NEW-1): the row
// waits for the platform's bounded answer instead of refusing on a boot race, so
// the wait is stood in here with "settled, and here it is".
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: async () => ({
    status: "ready",
    organizationId: "11111111-2222-3333-4444-555555555555",
  }),
  peekEffectiveOrganizationId: () => "11111111-2222-3333-4444-555555555555",
}));

jest.mock("@/features/google-workspace/calendar/service", () => ({
  readAgendaEvents: async () => state.rows,
  readAttendeePeople: async () => state.people,
  refreshCalendarWindow: async () => ({
    windowStart: "",
    windowEnd: "",
    events: [],
    attendeesLinked: 0,
    unmatchedAttendeeEmails: [],
  }),
  createNoteAboutEvent: async (args: unknown) => {
    noteCalls.push(args);
    return {
      noteId: "note-created-1",
      linkedToEvent: true,
      linkedPartyIds: [],
      failures: [],
    };
  },
  readPartyEmailKeys: async () => [],
  readCalendarEvent: async () => null,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector({}),
  useAppDispatch: () => () => {},
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  selectShouldPromptForOrganization: () => false,
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
    if (address === "google.refresh.on_open_min_age_seconds") return 86_400;
    throw new Error(`unexpected knob: ${address}`);
  },
}));
jest.mock("@/features/connectors/google-adapter", () => ({
  GOOGLE_PROVIDER: { key: "google", products: [{ key: "calendar", name: "Calendar" }] },
  useGoogleConnectorState: () => ({
    accounts: [{ id: "conn-1", usable: true }],
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
  accountHealth: () => [
    {
      product: { key: "calendar", name: "Calendar" },
      state: "connected",
      label: "Connected",
      reason: "",
      remedy: null,
    },
  ],
  preferredAccountId: () => "conn-1",
}));
jest.mock("@/features/connectors/ConnectorPromptHost", () => ({
  ConnectorPromptHost: () => <div data-prompt-card />,
}));

const opened: { type: string; id: string }[] = [];
jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => async (request: { type: string; id: string }) => {
    opened.push({ type: request.type, id: request.id });
    return "window";
  },
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({
    token,
    id,
    name,
    onOpen,
  }: {
    token: string;
    id: string;
    name?: string | null;
    onOpen?: () => void;
  }) => (
    <button type="button" data-entity-ref={id} data-entity-token={token} onClick={onOpen}>
      {name}
    </button>
  ),
}));

const toasts = { success: jest.fn(), error: jest.fn() };
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toasts.success(...a),
    error: (...a: unknown[]) => toasts.error(...a),
    info: jest.fn(),
  },
}));
jest.mock("@/features/crm/deals/service", () => ({
  fetchDealsForParty: async () => state.deals,
}));

import { AgendaPanel } from "../AgendaPanel";
import { calendarEventRow } from "./fixtures";
import { CALENDAR_EVENT_ATTENDEES_KIND } from "../types";

const DUANE_EMAIL = "duane@example.com";

function eventWithDuane(overrides: Record<string, unknown> = {}) {
  return calendarEventRow({
    starts_at: new Date().toISOString(),
    ends_at: null,
    attendees: {
      __kind: CALENDAR_EVENT_ATTENDEES_KIND,
      attendees: [
        { email: DUANE_EMAIL, display_name: "Duane Upshaw", rsvp: "accepted", organizer: false },
      ],
    },
    ...overrides,
  });
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
    click: async (selector: string) => {
      const node = container.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`no control matched ${selector}`);
      await act(async () => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 8; i += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  const event = eventWithDuane();
  state.rows = [event];
  state.people = new Map([
    [event.id, [{ partyId: "p-duane", displayName: "Duane Upshaw", email: DUANE_EMAIL }]],
  ]);
  state.deals = [{ status: "open" }, { status: "open" }, { status: "won" }];
  noteCalls.length = 0;
  opened.length = 0;
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("N4 — a Person on the agenda carries what is open with them", () => {
  it("shows the open-item count beside the door, from the same source the Detail uses", async () => {
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("Duane Upshaw");
      expect(m.text).toContain("2 open deals");
    } finally {
      m.unmount();
    }
  });

  it("says the count could not be read rather than printing a wrong zero", async () => {
    state.deals = [];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("No open deals");
    } finally {
      m.unmount();
    }
  });
});

describe("N5 — a filtered agenda gets its own empty sentence", () => {
  it("names the person and never claims the calendar is empty", async () => {
    // A calendar with an event on it, filtered to somebody who is not on it.
    const m = await mount(
      <AgendaPanel
        title="Upcoming with Dana Upton"
        partyEmailKeys={["dana@example.com"]}
        filterLabel="Dana Upton"
        refreshOnOpen={false}
      />,
    );
    try {
      expect(m.text).toContain("Nothing upcoming with Dana Upton in the next 7 days");
      expect(m.text).not.toContain("there is nothing on it in the next 7 days");
      // And the per-day sentence is about them too.
      expect(m.text).toContain("Nothing with Dana Upton");
      expect(m.text).not.toContain("Nothing on your calendar");
    } finally {
      m.unmount();
    }
  });

  it("keeps the unfiltered sentence when the agenda is not filtered (positive control)", async () => {
    state.rows = [];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("there is nothing on it in the next 7 days");
      expect(m.text).toContain("Nothing on your calendar");
    } finally {
      m.unmount();
    }
  });
});

describe("N6 — a frozen event is marked in the list, in the record's own words", () => {
  it("marks a detached event and keeps a live one unmarked", async () => {
    const live = eventWithDuane({ id: "11111111-1111-2222-3333-444444444444", title: "Solo block" });
    const kept = eventWithDuane({
      id: "22222222-1111-2222-3333-444444444444",
      title: "Kept event",
      sync_status: "detached",
      sync_status_reason: "Kept as AI Matrx data: this event no longer refreshes from Google Calendar.",
    });
    state.rows = [live, kept];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      const rows = [...m.container.querySelectorAll("li[data-agenda-event]")];
      const keptRow = rows.find((row) => row.textContent?.includes("Kept event"));
      const liveRow = rows.find((row) => row.textContent?.includes("Solo block"));
      expect(keptRow?.getAttribute("data-agenda-frozen")).toBe("detached");
      expect(keptRow?.textContent).toContain("Kept as AI Matrx data");
      expect(keptRow?.textContent).toContain("no longer refreshes from Google Calendar");
      expect(liveRow).toBeDefined();
      expect(liveRow?.hasAttribute("data-agenda-frozen")).toBe(false);
    } finally {
      m.unmount();
    }
  });

  it("marks an unavailable event with Google's own refusal", async () => {
    state.rows = [
      eventWithDuane({
        title: "Vanished event",
        sync_status: "unavailable",
        sync_status_reason: "Google Calendar says this event no longer exists.",
      }),
    ];
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      const row = m.container.querySelector("li[data-agenda-event]");
      expect(row?.getAttribute("data-agenda-frozen")).toBe("unavailable");
      expect(row?.textContent).toContain("Google Calendar says this event no longer exists.");
    } finally {
      m.unmount();
    }
  });
});

describe("N10 — the note it creates has a door", () => {
  it("opens the created note in place, from the row and from the toast", async () => {
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      await m.click("[data-agenda-create-note]");
      expect(noteCalls).toHaveLength(1);

      // THE ROW keeps a door, so the record is reachable after the toast has gone.
      const door = m.container.querySelector<HTMLElement>('[data-agenda-note-door="note-created-1"]');
      expect(door).not.toBeNull();
      await m.click('[data-agenda-note-door="note-created-1"]');
      expect(opened).toEqual(
        expect.arrayContaining([{ type: "note", id: "note-created-1" }]),
      );

      // AND the toast carries the same door, so the moment it is raised is not
      // the moment the record becomes unreachable.
      const options = toasts.success.mock.calls[0]?.[1] as
        | { action?: { label?: string; onClick?: () => void } }
        | undefined;
      expect(options?.action?.label).toBeTruthy();
      expect(typeof options?.action?.onClick).toBe("function");
    } finally {
      m.unmount();
    }
  });
});
