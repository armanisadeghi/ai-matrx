/**
 * 🚨 N3 (VERIFY-U-W1-U-W2, HIGH) — TWO PEOPLE AT ONE ADDRESS ARE TWO DOORS.
 *
 * One attendee address matched to two Persons here (a shared inbox, a role
 * address, a duplicated contact — all ordinary) rendered ONE door and dropped the
 * other silently, with nothing on screen saying a second Person existed. The
 * cause was copied into both surfaces: `new Map(people.map(p => [p.email, p]))`
 * keeps the last writer, and the leftovers were computed as
 * `!byEmail.has(p.email)` — which can never catch the loser, because the key IS
 * present.
 *
 * Asserted three ways: on the pure resolver, in the agenda's rendered DOM, and in
 * the event Detail's rendered DOM — the two surfaces that held the copy.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHARED = "dup@example.com";

const DUANE = {
  partyId: "p2-duane",
  displayName: "Duane Upshaw",
  email: SHARED,
};
const DANA = {
  partyId: "p3-dana",
  displayName: "Dana Upton",
  email: SHARED,
};

const state = {
  rows: [] as unknown[],
  people: new Map<string, unknown[]>(),
};

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
jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => async () => "window",
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ id, name }: { id: string; name?: string | null }) => (
    <span data-entity-ref={id}>{name}</span>
  ),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  recordToast: { success: jest.fn(), error: jest.fn() },
}));
// The open-item count is its own read; this suite is about the doors, so the
// count stands in as a marker that can be counted.
jest.mock("@/features/crm/deals/service", () => ({
  fetchDealsForParty: async () => [],
}));

import { AgendaPanel } from "../AgendaPanel";
import { CalendarEventAttendeesSection } from "../CalendarEventSections";
import { resolveAttendeePeople } from "../record";
import { calendarEventRow } from "./fixtures";
import { CALENDAR_EVENT_ATTENDEES_KIND } from "../types";

const EVENT = calendarEventRow({
  title: "Consult",
  attendees: {
    __kind: CALENDAR_EVENT_ATTENDEES_KIND,
    attendees: [
      { email: SHARED, display_name: "Shared inbox", rsvp: "accepted", organizer: false },
    ],
  },
});

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
    doorIds: () =>
      [...container.querySelectorAll("[data-entity-ref]")].map((node) =>
        node.getAttribute("data-entity-ref"),
      ),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  state.rows = [EVENT];
  state.people = new Map([[EVENT.id, [DUANE, DANA]]]);
});

describe("the resolver", () => {
  it("returns EVERY Person at an address, not the last one written", () => {
    const index = resolveAttendeePeople(
      [
        {
          email: SHARED,
          displayName: "Shared inbox",
          rsvp: "accepted",
          optional: false,
          organizer: false,
          isSelf: false,
        },
      ],
      [DUANE, DANA],
    );
    expect(index.matches).toHaveLength(1);
    expect(index.matches[0].people.map((p) => p.partyId)).toEqual([DUANE.partyId, DANA.partyId]);
    expect(index.hasSharedAddress).toBe(true);
    // And the leftovers are the persons that did NOT render — never the ones
    // whose key was merely present.
    expect(index.unplaced).toEqual([]);
  });

  it("still lists a linked Person whose address is no longer on the event", () => {
    const index = resolveAttendeePeople(
      [
        {
          email: "someone@else.com",
          displayName: null,
          rsvp: "needsAction",
          optional: false,
          organizer: false,
          isSelf: false,
        },
      ],
      [DUANE, { partyId: "p4", displayName: "No address", email: null }],
    );
    expect(index.matches[0].people).toEqual([]);
    expect(index.unplaced.map((p) => p.partyId)).toEqual([DUANE.partyId, "p4"]);
    expect(index.hasSharedAddress).toBe(false);
  });
});

describe("the agenda", () => {
  it("opens both People and says the address is shared", async () => {
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.text).toContain("Duane Upshaw");
      expect(m.text).toContain("Dana Upton");
      expect(m.doorIds()).toContain(DUANE.partyId);
      expect(m.doorIds()).toContain(DANA.partyId);
      expect(m.text).toContain("share this address");
    } finally {
      m.unmount();
    }
  });
});

describe("the event Detail", () => {
  it("opens both People and says the address is shared", async () => {
    const m = await mount(<CalendarEventAttendeesSection event={EVENT} />);
    try {
      expect(m.text).toContain("Duane Upshaw");
      expect(m.text).toContain("Dana Upton");
      expect(m.doorIds()).toContain(DUANE.partyId);
      expect(m.doorIds()).toContain(DANA.partyId);
      expect(m.text).toContain("share this address");
    } finally {
      m.unmount();
    }
  });
});
