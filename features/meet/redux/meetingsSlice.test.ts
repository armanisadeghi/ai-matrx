// One meeting, loaded once per tab, fed live (meetingsSlice + useMeetingLive).
//
// SUT: the slice's thunks/reducers and the live channel's handlers, over a real
// Redux store. Stubbed: the package repository (the network) and the realtime
// package's namespace helper. The break each test names is in its title.

const repo = {
  meeting: jest.fn(),
  invitees: jest.fn(),
  meetingOccurrences: jest.fn(),
};

jest.mock("@ai-matrx/meet/core", () => ({ createMeetRepository: () => repo }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobWriteDoor: jest.fn() }));
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: ({ namespace }: { namespace: string }) => ({
    topic: (parts: Record<string, string>) => `${namespace}:${Object.values(parts).join(":")}`,
  }),
}));
jest.mock("@ai-matrx/realtime/react", () => ({ useRealtimeManager: () => null }));
jest.mock("@/lib/realtime/sharedChannel", () => ({ openShared: jest.fn() }));

import { configureStore } from "@reduxjs/toolkit";
import meetingsReducer, { loadMeeting, meetingSaved, selectMeetingEntry } from "./meetingsSlice";
import { meetingLiveSpec } from "@/features/meet/hooks/useMeetingLive";

const MEETING = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";

function meetingRecord(version: number, title: string) {
  return {
    id: MEETING,
    organizationId: "7d4e9b21-6c3a-4f8e-b5d2-0a9c1e3f7b64",
    title,
    scheduledFor: "2026-10-06T17:00:00.000Z",
    recurrenceRule: null,
    version,
  };
}

function guest(rsvpState: string) {
  return {
    id: "c1e2d3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    meetingId: MEETING,
    userId: null,
    email: "lucia.ortega@harborviewpm.com",
    displayName: "Lucia Ortega",
    role: "invitee",
    rsvpState,
    respondedAt: null,
    rsvpNote: null,
    lastSentSequence: 0,
    lastSentAt: null,
  };
}

function makeStore() {
  return configureStore({ reducer: { meetings: meetingsReducer } });
}

/** Let every queued read settle (the handlers dispatch without awaiting). */
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  repo.meeting.mockReset().mockResolvedValue(meetingRecord(3, "Owner sync — Unit 4B turnover"));
  repo.invitees.mockReset().mockResolvedValue([guest("needs_action")]);
  repo.meetingOccurrences.mockReset().mockResolvedValue([]);
});

describe("one meeting per tab", () => {
  it("reads a meeting once however many views mount, wake or remount (no re-read of what the store holds)", async () => {
    const store = makeStore();
    await Promise.all([
      store.dispatch(loadMeeting({ meetingId: MEETING })),
      store.dispatch(loadMeeting({ meetingId: MEETING })),
    ]);
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    expect(repo.meeting).toHaveBeenCalledTimes(1);
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe("Owner sync — Unit 4B turnover");
  });

  it("re-reads on purpose (force) and shows the newer answer", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    repo.meeting.mockResolvedValue(meetingRecord(4, "Owner sync — Unit 4B, moved to Thursday"));
    await store.dispatch(loadMeeting({ meetingId: MEETING, force: true }));
    expect(repo.meeting).toHaveBeenCalledTimes(2);
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe(
      "Owner sync — Unit 4B, moved to Thursday",
    );
  });

  it("keeps a failed first read whole for the access gate, and does not retry it on a remount", async () => {
    const store = makeStore();
    const refusal = Object.assign(new Error("not found"), { code: "PGRST116" });
    repo.meeting.mockRejectedValue(refusal);
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    expect(repo.meeting).toHaveBeenCalledTimes(1);
    expect(selectMeetingEntry(store.getState(), MEETING)?.error).toBe(refusal);
  });

  it("an older read landing after a newer one never overwrites it", async () => {
    const store = makeStore();
    let releaseFirst: (v: unknown) => void = () => undefined;
    repo.meeting.mockReturnValueOnce(new Promise((r) => (releaseFirst = r)));
    const first = store.dispatch(loadMeeting({ meetingId: MEETING }));
    repo.meeting.mockResolvedValueOnce(meetingRecord(5, "Owner sync — final"));
    await store.dispatch(loadMeeting({ meetingId: MEETING, force: true }));
    releaseFirst(meetingRecord(3, "Owner sync — stale"));
    await first;
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe("Owner sync — final");
  });

  it("a save here lands in the store with no re-read", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    store.dispatch(meetingSaved({ meeting: meetingRecord(4, "Owner sync — renamed") as never }));
    expect(repo.meeting).toHaveBeenCalledTimes(1);
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe("Owner sync — renamed");
  });
});

describe("the meeting's live channel feeds the store", () => {
  type Binding = { table: string; filter: string; onChange: (d: { row: Record<string, unknown> | null }) => void };
  const bindingFor = (spec: ReturnType<typeof meetingLiveSpec>, table: string) =>
    (spec.postgresChanges as unknown as Binding[]).find((b) => b.table === table)!;

  it("an edit made elsewhere (a newer version) is re-read into the store", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    const spec = meetingLiveSpec(store, MEETING);
    expect(bindingFor(spec, "meet_meetings").filter).toBe(`id=eq.${MEETING}`);
    repo.meeting.mockResolvedValue(meetingRecord(4, "Owner sync — edited on the meeting page"));
    bindingFor(spec, "meet_meetings").onChange({ row: { id: MEETING, version: 4 } });
    await flush();
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe(
      "Owner sync — edited on the meeting page",
    );
  });

  it("this tab's own save echoing back (a version the store holds) re-reads nothing", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    bindingFor(meetingLiveSpec(store, MEETING), "meet_meetings").onChange({ row: { id: MEETING, version: 3 } });
    await flush();
    expect(repo.meeting).toHaveBeenCalledTimes(1);
  });

  it("a guest's answer re-reads only the guest list", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    repo.invitees.mockResolvedValue([guest("accepted")]);
    const spec = meetingLiveSpec(store, MEETING);
    expect(bindingFor(spec, "meet_invitees").filter).toBe(`meeting_id=eq.${MEETING}`);
    bindingFor(spec, "meet_invitees").onChange({ row: { id: "c1e2d3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f" } });
    await flush();
    expect(repo.meeting).toHaveBeenCalledTimes(1);
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.invitees[0]?.rsvpState).toBe("accepted");
  });

  it("a reconnect re-reads the meeting (realtime has no replay)", async () => {
    const store = makeStore();
    await store.dispatch(loadMeeting({ meetingId: MEETING }));
    repo.meeting.mockResolvedValue(meetingRecord(6, "Owner sync — changed while offline"));
    await meetingLiveSpec(store, MEETING).onBackfill?.({ reason: "reconnect", topic: "t", gapMs: null });
    expect(selectMeetingEntry(store.getState(), MEETING)?.loaded?.meeting.title).toBe(
      "Owner sync — changed while offline",
    );
  });
});
