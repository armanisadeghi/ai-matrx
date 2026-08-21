import {
  ASSIST_PRESENTATION_CYCLE_MS,
  chooseAssistPresentationCycle,
  isAssistPresentationCycleCurrent,
  presentedAssists,
} from "./presentation-cycle";
import type { Assist } from "./types";

function assist(id: string, sourceKey: string): Assist {
  return {
    id,
    userId: "user",
    entityType: null,
    entityId: null,
    surfaceName: null,
    sourceKind: "deterministic",
    sourceKey,
    title: id,
    body: null,
    reasoning: null,
    confidence: 1,
    action: { kind: "navigate", href: "/assists" },
    status: "pending",
    priority: 0,
    dedupeKey: id,
    createdAt: "2026-08-20T00:00:00.000Z",
    decidedAt: null,
    suppressedUntil: null,
    expiresAt: null,
    result: null,
    evidence: null,
    firstSeenAt: null,
    occurrences: 1,
    resolvedAt: null,
    decisionNote: null,
    isStarred: false,
    viewedAt: null,
  };
}

describe("Assist presentation cycles", () => {
  it("pins at most three and gives one slot to each producer family", () => {
    const cycle = chooseAssistPresentationCycle(
      [
        assist("seo-1", "seo.finding_rollup.title"),
        assist("seo-2", "seo.finding_rollup.meta"),
        assist("crm", "crm.duplicates"),
        assist("notes", "notes.unorganized"),
      ],
      null,
      new Date("2026-08-20T12:00:00.000Z"),
    );
    expect(cycle.assistIds).toEqual(["seo-1", "crm", "notes"]);
  });

  it("does not refill a completed slot inside the current cycle", () => {
    const cycle = {
      startedAt: "2026-08-20T12:00:00.000Z",
      assistIds: ["one", "two", "three"],
    };
    expect(
      presentedAssists(
        [assist("two", "crm.duplicates"), assist("new", "notes.unorganized")],
        cycle,
      ).map((row) => row.id),
    ).toEqual(["two"]);
  });

  it("rotates away from the previous three before reusing them", () => {
    const previous = {
      startedAt: "2026-08-20T08:00:00.000Z",
      assistIds: ["old-a", "old-b"],
    };
    const cycle = chooseAssistPresentationCycle(
      [
        assist("old-a", "a"),
        assist("old-b", "b"),
        assist("new-c", "c"),
        assist("new-d", "d"),
      ],
      previous,
      new Date("2026-08-20T12:00:00.000Z"),
    );
    expect(cycle.assistIds).toEqual(["new-c", "new-d", "old-a"]);
  });

  it("expires only after the full cycle window", () => {
    const cycle = {
      startedAt: "2026-08-20T12:00:00.000Z",
      assistIds: ["one"],
    };
    const started = Date.parse(cycle.startedAt);
    expect(
      isAssistPresentationCycleCurrent(
        cycle,
        started + ASSIST_PRESENTATION_CYCLE_MS - 1,
      ),
    ).toBe(true);
    expect(
      isAssistPresentationCycleCurrent(
        cycle,
        started + ASSIST_PRESENTATION_CYCLE_MS,
      ),
    ).toBe(false);
  });
});
