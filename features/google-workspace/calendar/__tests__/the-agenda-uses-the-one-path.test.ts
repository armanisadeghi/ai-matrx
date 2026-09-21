/**
 * THE FOUR DOORS ARE THE CANONICAL ONES — this suite fails if any of them is
 * re-routed, because each one has exactly one right path and three wrong ones
 * that all "work":
 *
 *  1. the agenda READ goes React → Supabase with the list's OWN scope (`mine`),
 *     through `readAllRows` (a bare `.select()` truncates at 1000 in silence);
 *  2. the REFRESH goes through `postGoogleBackend`, never `fetch`, and SENDS the
 *     organization (the router answers 422 without it);
 *  3. attendee → Person comes from the SERVER's edges, not from a second email
 *     matcher in the browser;
 *  4. create-note writes BOTH edges through the ONE association chokepoint, and a
 *     failed link never reads as a failed note.
 */

const state = {
  supabaseCalls: [] as { schema: string; table: string; filters: Record<string, unknown> }[],
  rows: [] as unknown[],
  rowsByTable: {} as Record<string, unknown[]>,
  postCalls: [] as { path: string; body: Record<string, unknown> }[],
  postResponse: {} as Record<string, unknown>,
  addCalls: [] as Record<string, unknown>[],
  addResults: [] as { ok: boolean; message?: string }[],
  listForSources: { ok: true, data: { edges: [] as Record<string, unknown>[] } } as {
    ok: boolean;
    data?: { edges: Record<string, unknown>[] };
    error?: { message: string };
  },
  createdNotes: [] as Record<string, unknown>[],
  readAllRowsLabels: [] as string[],
};

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async (
    query: (range: { from: number; to: number }) => PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
      count?: number | null;
    }>,
    opts: { label: string },
  ) => {
    state.readAllRowsLabels.push(opts.label);
    const page = await query({ from: 0, to: 999 });
    if (page.error) throw new Error(page.error.message);
    return page.data ?? [];
  },
}));

function builder(table: string, schema: string) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  const record = (name: string) =>
    (...args: unknown[]) => {
      // args[1] verbatim, including `null` — `.is("deleted_at", null)` is the
      // soft-delete filter and a harness that coerced it to `true` would let a
      // read that forgot it pass.
      filters[`${name}:${String(args[0])}`] = args.length > 1 ? args[1] : true;
      return chain;
    };
  for (const method of ["select", "eq", "is", "gte", "lte", "order", "range", "in", "abortSignal"]) {
    chain[method] = record(method);
  }
  chain.returns = () => {
    state.supabaseCalls.push({ schema, table, filters });
    return Promise.resolve({ data: state.rows, error: null, count: state.rows.length });
  };
  chain.maybeSingle = () => {
    state.supabaseCalls.push({ schema, table, filters });
    return Promise.resolve({ data: state.rows[0] ?? null, error: null });
  };
  chain.then = (resolve: (value: unknown) => unknown) => {
    state.supabaseCalls.push({ schema, table, filters });
    const rows = state.rowsByTable[table] ?? state.rows;
    return Promise.resolve({ data: rows, error: null }).then(resolve);
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (schema: string) => ({ from: (table: string) => builder(table, schema) }),
    from: (table: string) => builder(table, "public"),
  },
}));

const fetchSpy = jest.fn();
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: async (path: string, body: Record<string, unknown>) => {
    state.postCalls.push({ path, body });
    return { json: async () => state.postResponse } as Response;
  },
}));

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: async (args: Record<string, unknown>) => {
      state.addCalls.push(args);
      const next = state.addResults.shift() ?? { ok: true };
      return next.ok
        ? { ok: true, data: { id: "edge-1" } }
        : { ok: false, error: { message: next.message ?? "refused" } };
    },
    listForSources: async () => state.listForSources,
  },
}));

jest.mock("@/features/notes/service/notesService", () => ({
  createNote: async (input: Record<string, unknown>) => {
    state.createdNotes.push(input);
    return { id: "note-1", label: input.label };
  },
}));

jest.mock("@/features/crm/service", () => ({
  partyContactPointsQuery: () =>
    Promise.resolve({
      data: [
        { medium: { channel: "email", value_key: "Dr.Chen@Clinic.com".toLowerCase() } },
        { medium: { channel: "phone", value_key: "+15551234567" } },
        { medium: null },
      ],
      error: null,
    }),
}));

import {
  createNoteAboutEvent,
  readAgendaEvents,
  readAttendeePeople,
  readPartyEmailKeys,
  refreshCalendarWindow,
} from "../service";
import { CALENDAR_EVENT_ATTENDEES_KIND, type CalendarEventRow } from "../types";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const USER = "1f2e3d4c-5b6a-4978-8877-665544332211";

function event(overrides: Partial<CalendarEventRow> & { id: string }): CalendarEventRow {
  return {
    all_day: false,
    attendees: { __kind: CALENDAR_EVENT_ATTENDEES_KIND, attendees: [] },
    calendar_id: "primary",
    created_at: "2026-09-18T00:00:00Z",
    created_by: USER,
    deleted_at: null,
    ends_at: null,
    external_id: `google-${overrides.id}`,
    external_updated_at: null,
    location: null,
    meeting_url: null,
    metadata: {},
    organization_id: ORG,
    organizer_email: null,
    provider: "google",
    starts_at: "2026-09-18T13:00:00Z",
    sync_status: "available",
    sync_status_reason: null,
    synced_at: "2026-09-18T12:00:00Z",
    synced_via_connection_id: null,
    title: "Consult",
    updated_at: "2026-09-18T12:00:00Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
    custom_fields: overrides.custom_fields ?? {},
  };
}

beforeEach(() => {
  state.supabaseCalls = [];
  state.rows = [];
  state.rowsByTable = {};
  state.postCalls = [];
  state.postResponse = {};
  state.addCalls = [];
  state.addResults = [];
  state.listForSources = { ok: true, data: { edges: [] } };
  state.createdNotes = [];
  state.readAllRowsLabels = [];
  fetchSpy.mockReset();
});

describe("readAgendaEvents", () => {
  it("reads the right table, through readAllRows, scoped to MINE", async () => {
    state.rows = [event({ id: "e1" })];
    const rows = await readAgendaEvents({
      organizationId: ORG,
      userId: USER,
      days: 7,
      now: new Date("2026-09-18T09:00:00Z"),
    });
    expect(rows).toHaveLength(1);
    expect(state.readAllRowsLabels).toEqual([
      "communication.calendar_event agenda window",
    ]);
    const call = state.supabaseCalls[0];
    expect(call.schema).toBe("communication");
    expect(call.table).toBe("calendar_event");
    // THE VIEW LAW — the list declares its own scope, it does not lean on RLS.
    expect(call.filters["eq:created_by"]).toBe(USER);
    expect(call.filters["eq:organization_id"]).toBe(ORG);
    expect(call.filters["is:deleted_at"]).toBe(null);
    // `{ count: "exact" }` is what makes a truncated page provable.
    expect(call.filters["select:*"]).toEqual({ count: "exact" });
    // A stable total order, or paging can repeat and skip.
    expect(call.filters["order:starts_at"]).toBeDefined();
    expect(call.filters["order:id"]).toBeDefined();
  });

  it("refuses to read with no organization rather than guessing one", async () => {
    await expect(
      readAgendaEvents({
        organizationId: "",
        userId: USER,
        days: 7,
        now: new Date(),
      }),
    ).rejects.toThrow();
    expect(state.supabaseCalls).toHaveLength(0);
  });
});

describe("refreshCalendarWindow", () => {
  it("goes through the authenticated transport and SENDS the organization", async () => {
    state.postResponse = {
      window_start: "2026-09-18T00:00:00Z",
      window_end: "2026-09-25T00:00:00Z",
      events: [
        {
          id: "e1",
          external_id: "g1",
          calendar_id: "primary",
          title: "Consult",
          starts_at: "2026-09-18T13:00:00Z",
          ends_at: null,
          all_day: false,
          meeting_url: "https://meet.google.com/abc",
          organizer_email: "me@clinic.com",
          attendee_emails: ["dr.chen@clinic.com"],
          linked_party_ids: ["party-1"],
        },
      ],
      attendees_linked: 1,
      unmatched_attendee_emails: ["stranger@example.com"],
    };
    const result = await refreshCalendarWindow({
      connectionId: "conn-1",
      organizationId: ORG,
      days: 90, // clamped to what the server accepts
    });
    expect(state.postCalls).toEqual([
      {
        path: "/google-sync/calendar/refresh",
        body: {
          organization_id: ORG,
          connection_id: "conn-1",
          calendar_id: "primary",
          days: 31,
        },
      },
    ]);
    expect(result.events[0].meetingUrl).toBe("https://meet.google.com/abc");
    expect(result.attendeesLinked).toBe(1);
    expect(result.unmatchedAttendeeEmails).toEqual(["stranger@example.com"]);
    // No hand-rolled fetch anywhere on this path.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an answer it cannot read instead of rendering an empty agenda", async () => {
    state.postResponse = { nope: true };
    await expect(
      refreshCalendarWindow({ connectionId: "c", organizationId: ORG, days: 7 }),
    ).rejects.toThrow(/cannot read/i);
  });
});

describe("readAttendeePeople", () => {
  it("uses the SERVER's attendee edges and names the Person from crm.party", async () => {
    state.listForSources = {
      ok: true,
      data: {
        edges: [
          { sourceId: "e1", targetId: "party-1", role: "attendee" },
          // A different role on the same pair is not an attendee link.
          { sourceId: "e1", targetId: "party-9", role: "about" },
        ],
      },
    };
    state.rowsByTable = {
      party: [{ id: "party-1", display_name: "Dr Chen" }],
      party_contact_point: [
        { party_id: "party-1", medium: { channel: "email", value_key: "dr.chen@clinic.com" } },
      ],
    };
    const byEvent = await readAttendeePeople([
      event({
        id: "e1",
        attendees: {
          __kind: CALENDAR_EVENT_ATTENDEES_KIND,
          attendees: [{ email: "Dr.Chen@Clinic.com", rsvp: "accepted" }],
        },
      }),
    ]);
    // The door is attached to the DOT it belongs beside, matched by address.
    expect(byEvent.get("e1")).toEqual([
      { partyId: "party-1", displayName: "Dr Chen", email: "dr.chen@clinic.com" },
    ]);
  });

  it("still opens the door for a linked Person whose address is no longer on the event", async () => {
    state.listForSources = {
      ok: true,
      data: { edges: [{ sourceId: "e1", targetId: "party-1", role: "attendee" }] },
    };
    state.rowsByTable = {
      party: [{ id: "party-1", display_name: "Dr Chen" }],
      party_contact_point: [
        { party_id: "party-1", medium: { channel: "email", value_key: "moved@clinic.com" } },
      ],
    };
    const byEvent = await readAttendeePeople([
      event({
        id: "e1",
        attendees: {
          __kind: CALENDAR_EVENT_ATTENDEES_KIND,
          attendees: [{ email: "dr.chen@clinic.com", rsvp: "accepted" }],
        },
      }),
    ]);
    expect(byEvent.get("e1")).toEqual([
      { partyId: "party-1", displayName: "Dr Chen", email: null },
    ]);
  });

  it("screams instead of answering 'none of them are People'", async () => {
    state.listForSources = { ok: false, error: { message: "rpc down" } };
    await expect(readAttendeePeople([event({ id: "e1" })])).rejects.toThrow(/rpc down/);
  });

  it("asks for nothing when there are no events", async () => {
    expect((await readAttendeePeople([])).size).toBe(0);
  });
});

describe("readPartyEmailKeys", () => {
  it("returns only the email mediums, normalized, through crm's own reader", async () => {
    expect(await readPartyEmailKeys("party-1")).toEqual(["dr.chen@clinic.com"]);
  });
});

describe("createNoteAboutEvent", () => {
  it("writes the note, the event edge and every Person edge through the ONE path", async () => {
    const result = await createNoteAboutEvent({
      event: event({ id: "e1", title: "Consult" }),
      organizationId: ORG,
      partyIds: ["party-1", "party-2"],
    });
    expect(state.createdNotes[0]).toMatchObject({
      organization_id: ORG,
      visibility: "personal",
    });
    expect(state.addCalls).toEqual([
      {
        sourceType: "calendar_event",
        sourceId: "e1",
        targetType: "note",
        targetId: "note-1",
        orgId: ORG,
        role: "about",
      },
      {
        sourceType: "note",
        sourceId: "note-1",
        targetType: "party",
        targetId: "party-1",
        orgId: ORG,
        role: "about",
      },
      {
        sourceType: "note",
        sourceId: "note-1",
        targetType: "party",
        targetId: "party-2",
        orgId: ORG,
        role: "about",
      },
    ]);
    expect(result).toEqual({
      noteId: "note-1",
      linkedToEvent: true,
      linkedPartyIds: ["party-1", "party-2"],
      failures: [],
    });
  });

  it("a refused link is REPORTED, and never reads as a failed note", async () => {
    state.addResults = [{ ok: false, message: "no access to the event" }, { ok: true }];
    const result = await createNoteAboutEvent({
      event: event({ id: "e1", title: "Consult" }),
      organizationId: ORG,
      partyIds: ["party-1"],
    });
    expect(result.noteId).toBe("note-1");
    expect(result.linkedToEvent).toBe(false);
    expect(result.linkedPartyIds).toEqual(["party-1"]);
    expect(result.failures[0]).toContain("no access to the event");
  });
});
