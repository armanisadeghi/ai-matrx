import type { MeetingInvitee, MeetingRecord } from "@ai-matrx/meet";
import {
  changedSettings,
  draftChanges,
  draftProblem,
  draftSchedule,
  duplicateDraft,
  emptyDraft,
  inviteeDiff,
  meetingToDraft,
  PLATFORM_DEFAULT_SETTINGS,
} from "./meeting-draft";
import {
  isLiveInstant,
  isPast,
} from "@/features/meet/hooks/useMeetingsDirectory";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));

const LA = "America/Los_Angeles";

const weekly = {
  id: "m1",
  organizationId: "o1",
  roomName: "r",
  slug: "abc",
  title: "Weekly client check-in",
  kind: "recurring",
  hostUserId: "u1",
  scheduledFor: "2026-09-29T17:00:00.000Z",
  scheduledDurationMinutes: 60,
  startedAt: null,
  endedAt: null,
  locked: false,
  lobbyEnabled: true,
  recordingPolicy: "host-controlled",
  aiEnabled: true,
  metadata: {},
  timeZone: LA,
  agenda: "Open items",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
  joinBeforeHost: true,
  cancelledAt: null,
  deletedAt: null,
  version: 3,
} as unknown as MeetingRecord;

describe("the meeting form's model", () => {
  it("a new meeting starts at the next half hour in the chosen zone", () => {
    const draft = emptyDraft(LA, new Date("2026-09-27T11:04:00.000Z"));
    expect([draft.date, draft.time]).toEqual(["2026-09-27", "04:30"]);
    expect(draftProblem(draft)).toBe("Give the meeting a title.");
  });

  it("10:00 on a Tuesday in Los Angeles is written as that instant with its weekly rule", () => {
    const draft = {
      ...emptyDraft(LA),
      title: "Weekly client check-in",
      date: "2026-09-29",
      time: "10:00",
      recurrence: {
        frequency: "weekly" as const,
        interval: 1,
        weekdays: [],
        monthlyMode: "day-of-month" as const,
        ends: { kind: "never" as const },
      },
    };
    expect(draftSchedule(draft)).toEqual({
      scheduledFor: "2026-09-29T17:00:00.000Z",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
    });
  });

  it("an edit sends ONLY what changed — the version travels separately", () => {
    const draft = meetingToDraft(weekly, [], LA);
    expect(draftChanges(weekly, draft)).toEqual({});
    const moved = {
      ...draft,
      time: "11:00",
      settings: { ...draft.settings, lobbyEnabled: false },
    };
    expect(draftChanges(weekly, moved)).toEqual({
      scheduledFor: "2026-09-29T18:00:00.000Z",
      lobbyEnabled: false,
    });
  });

  it("settings the person did not touch stay with their knobs", () => {
    expect(
      changedSettings(PLATFORM_DEFAULT_SETTINGS, PLATFORM_DEFAULT_SETTINGS),
    ).toEqual({});
    expect(
      changedSettings(
        { ...PLATFORM_DEFAULT_SETTINGS, aiEnabled: false },
        PLATFORM_DEFAULT_SETTINGS,
      ),
    ).toEqual({ aiEnabled: false });
  });

  it("a duplicate of a past Tuesday series starts on the next Tuesday, same time, nobody invited yet", () => {
    const invitee = {
      id: "i1",
      userId: "u2",
      email: "test@test.com",
      displayName: null,
      role: "invitee",
    } as unknown as MeetingInvitee;
    const draft = meetingToDraft(
      { ...weekly, scheduledFor: "2026-09-15T17:00:00.000Z" },
      [invitee],
      LA,
    );
    const copy = duplicateDraft(draft, new Date("2026-09-27T11:00:00.000Z"));
    expect([copy.date, copy.time, copy.title]).toEqual([
      "2026-09-29",
      "10:00",
      "Weekly client check-in (copy)",
    ]);
    expect(copy.invitees.map((i) => i.inviteeId)).toEqual([null]);
  });

  it("guest changes: add, remove, and co-host flips", () => {
    const saved = [
      { id: "a", role: "invitee" },
      { id: "b", role: "cohost" },
    ] as unknown as MeetingInvitee[];
    const diff = inviteeDiff(saved, [
      {
        key: "a",
        inviteeId: "a",
        userId: "u",
        email: null,
        displayName: null,
        cohost: true,
      },
      {
        key: "x@y.com",
        inviteeId: null,
        userId: null,
        email: "x@y.com",
        displayName: null,
        cohost: false,
      },
    ]);
    expect(diff.add.map((d) => d.email)).toEqual(["x@y.com"]);
    expect(diff.remove.map((r) => r.id)).toEqual(["b"]);
    expect(diff.roleChanges).toEqual([{ invitee: saved[0], cohost: true }]);
  });
});

describe("which tab a meeting belongs on", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  const instant = {
    ...weekly,
    recurrenceRule: null,
    scheduledFor: null,
    kind: "instant",
  } as unknown as MeetingRecord;

  it("an instant meeting started this morning is happening now; one nobody ended days ago is past", () => {
    expect(
      isLiveInstant({ ...instant, startedAt: "2026-09-27T10:00:00.000Z" }, now),
    ).toBe(true);
    const stale = { ...instant, startedAt: "2026-09-20T10:00:00.000Z" };
    expect(isLiveInstant(stale, now)).toBe(false);
    expect(isPast(stale, now)).toBe(true);
  });

  it("a series is never past until it ends; a cancelled or archived meeting is on its own tab", () => {
    expect(isPast(weekly, now)).toBe(false);
    expect(
      isPast(
        {
          ...weekly,
          recurrenceRule: null,
          scheduledFor: "2026-09-20T17:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isPast(
        { ...weekly, cancelledAt: "2026-09-21T00:00:00.000Z", endedAt: "x" },
        now,
      ),
    ).toBe(false);
  });
});
