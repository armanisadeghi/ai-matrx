import {
  FEATURE_ENTITY,
  createPickBatcher,
  entityIdOf,
  entitySource,
  hrefFor,
  matchesEntity,
  meetingPhase,
  orderMeetingsForPicker,
  titleToAdopt,
  type MeetingLike,
} from "../feature-items.logic";
import type { PlacedItem } from "../types";

describe("feature item sources", () => {
  it("a type renders only its own entity", () => {
    const isTask = matchesEntity(FEATURE_ENTITY.task);
    expect(isTask(entitySource("task", "t1"))).toBe(true);
    expect(isTask(entitySource("task", null))).toBe(true);
    expect(isTask(entitySource("war-room", "r1"))).toBe(false);
    expect(isTask({ kind: "text", markdown: "task" })).toBe(false);
  });

  it("the id is the record's, or null for a draft or another kind", () => {
    expect(entityIdOf(entitySource("meeting", "m1"))).toBe("m1");
    expect(entityIdOf(entitySource("meeting", null))).toBeNull();
    expect(entityIdOf({ kind: "label", text: "x" })).toBeNull();
  });

  it("href opens the record's page and never a page for a draft", () => {
    const href = hrefFor(FEATURE_ENTITY.workflowRun, (id) => `/workflows/runs/${id}`);
    expect(href(entitySource("workflow-run", "r9"))).toBe("/workflows/runs/r9");
    expect(href(entitySource("workflow-run", null))).toBeNull();
    // Another type's source never borrows this type's door.
    expect(href(entitySource("task", "r9"))).toBeNull();
    // A registry with no route for the token answers null, not a 404 link.
    expect(hrefFor(FEATURE_ENTITY.task, () => undefined)(entitySource("task", "t"))).toBeNull();
  });

  it("the tile adopts the record's name only when it is real and different", () => {
    expect(titleToAdopt("New task", "Call the client")).toBe("Call the client");
    expect(titleToAdopt("Call the client", "Call the client")).toBeNull();
    expect(titleToAdopt("Call the client", "  ")).toBeNull();
    expect(titleToAdopt("Call the client", null)).toBeNull();
  });
});

describe("meetings in the picker", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const m = (over: Partial<MeetingLike> & { id: string }): MeetingLike => ({
    title: over.id,
    scheduledFor: null,
    startedAt: null,
    endedAt: null,
    ...over,
  });

  it("names where each meeting is in its life", () => {
    expect(meetingPhase(m({ id: "a", startedAt: "2026-09-27T11:50:00Z" }), now)).toBe("live");
    expect(meetingPhase(m({ id: "b", scheduledFor: "2026-09-28T09:00:00Z" }), now)).toBe("upcoming");
    expect(meetingPhase(m({ id: "c", scheduledFor: "2026-09-20T09:00:00Z" }), now)).toBe("ended");
    expect(meetingPhase(m({ id: "d", endedAt: "2026-09-20T10:00:00Z" }), now)).toBe("ended");
    expect(meetingPhase(m({ id: "e", cancelledAt: "2026-09-20T10:00:00Z" }), now)).toBe("cancelled");
    expect(meetingPhase(m({ id: "f", deletedAt: "2026-09-20T10:00:00Z", cancelledAt: "x" }), now)).toBe("archived");
    expect(meetingPhase(m({ id: "g" }), now)).toBe("unscheduled");
    // A series that met before still has its next occurrence ahead.
    expect(
      meetingPhase(
        m({ id: "h", scheduledFor: "2026-09-01T09:00:00Z", endedAt: "2026-09-20T10:00:00Z", recurrenceRule: "FREQ=WEEKLY" }),
        now,
      ),
    ).toBe("upcoming");
  });

  it("lists live, then soonest upcoming, then most recent past; each meeting once", () => {
    const rows = orderMeetingsForPicker(
      [
        m({ id: "past-old", endedAt: "2026-08-01T10:00:00Z", scheduledFor: "2026-08-01T09:00:00Z" }),
        m({ id: "later", scheduledFor: "2026-10-05T09:00:00Z" }),
        m({ id: "cancelled", cancelledAt: "2026-09-01T00:00:00Z", scheduledFor: "2026-10-01T09:00:00Z" }),
        m({ id: "past-new", endedAt: "2026-09-26T10:00:00Z", scheduledFor: "2026-09-26T09:00:00Z" }),
        m({ id: "soon", scheduledFor: "2026-09-28T09:00:00Z" }),
        m({ id: "live", startedAt: "2026-09-27T11:55:00Z" }),
        m({ id: "soon", scheduledFor: "2026-09-28T09:00:00Z" }),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["live", "soon", "later", "past-new", "past-old", "cancelled"]);
  });
});

describe("placing several picks at once", () => {
  const item = (id: string): PlacedItem => ({ title: id, source: entitySource("task", id) });

  it("every pick made together lands in ONE placement, duplicates dropped", () => {
    const flushes: (() => void)[] = [];
    const placed: PlacedItem[][] = [];
    const add = createPickBatcher(
      (items) => placed.push(items),
      (flush) => flushes.push(flush),
    );
    add(item("a"));
    add(item("b"));
    add(item("a"));
    expect(placed).toHaveLength(0);
    expect(flushes).toHaveLength(1);
    flushes[0]();
    expect(placed).toEqual([[item("a"), item("b")]]);
  });

  it("a later pick starts a new placement", async () => {
    const placed: PlacedItem[][] = [];
    const add = createPickBatcher((items) => placed.push(items));
    add(item("a"));
    await Promise.resolve();
    add(item("b"));
    await Promise.resolve();
    expect(placed).toEqual([[item("a")], [item("b")]]);
  });
});
