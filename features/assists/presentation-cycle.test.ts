import {
  ASSIST_PRESENTATION_CYCLE_MS,
  chooseAssistPresentationCycle,
  isAssistPresentationCycleCurrent,
  presentedAssists,
} from "./presentation-cycle";
import { assistPriority, type Assist } from "./types";

function urgent(id: string, sourceKey: string): Assist {
  return { ...assist(id, sourceKey), priority: assistPriority("urgent") };
}

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

  // 🚨 THE BLOCKER GUARD. Rotation is for treats. An urgent assist is, by the
  // platform's own definition, something blocked that only this person can
  // unblock — hiding one for up to three hours behind three suggestions is the
  // silent failure this feature exists to avoid. Remove the pin in
  // `presentedAssists` and all three of these fail.
  describe("the urgent band is pinned, never rotated", () => {
    it("shows an urgent assist the previous cycle displaced", () => {
      const previous = {
        startedAt: "2026-08-20T12:00:00.000Z",
        assistIds: ["treat-a", "treat-b", "treat-c"],
      };
      const candidates = [
        urgent("blocked", "capture_ladder.needs_your_browser"),
        assist("treat-a", "a.one"),
        assist("treat-b", "b.one"),
        assist("treat-c", "c.one"),
      ];
      expect(presentedAssists(candidates, previous).map((a) => a.id)).toEqual([
        "blocked",
        "treat-a",
        "treat-b",
        "treat-c",
      ]);
    });

    it("shows an urgent assist that arrives mid-cycle, without waiting for the next one", () => {
      const cycle = {
        startedAt: "2026-08-20T12:00:00.000Z",
        assistIds: ["treat-a"],
      };
      const candidates = [
        urgent("arrived-just-now", "capture_ladder.needs_your_browser"),
        assist("treat-a", "a.one"),
      ];
      expect(presentedAssists(candidates, cycle).map((a) => a.id)).toEqual([
        "arrived-just-now",
        "treat-a",
      ]);
    });

    it("never spends a rotated slot on a row that is pinned anyway", () => {
      const cycle = chooseAssistPresentationCycle(
        [
          urgent("blocked", "capture_ladder.needs_your_browser"),
          assist("treat-a", "a.one"),
          assist("treat-b", "b.one"),
          assist("treat-c", "c.one"),
          assist("treat-d", "d.one"),
        ],
        null,
        new Date("2026-08-20T12:00:00.000Z"),
      );
      expect(cycle.assistIds).toEqual(["treat-a", "treat-b", "treat-c"]);
    });

    it("still bounds a storm — the overflow stays behind the dock's door", () => {
      const candidates = [
        urgent("u1", "a.one"),
        urgent("u2", "b.one"),
        urgent("u3", "c.one"),
        urgent("u4", "d.one"),
        urgent("u5", "e.one"),
      ];
      expect(presentedAssists(candidates, null).map((a) => a.id)).toEqual([
        "u1",
        "u2",
        "u3",
      ]);
    });
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
