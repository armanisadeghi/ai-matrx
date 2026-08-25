/**
 * Bulk enrichment's accounting — the half that was missing entirely ("it
 * doesn't say 6 out of 80 flashcards enriched"). These pin the three promises:
 * a truthful live count, a cancel that under-reports nothing, and a summary
 * that never rounds a failure away.
 */

import {
  EMPTY_BULK_ENRICH_RUN,
  bulkEnrichCounts,
  bulkEnrichProgressLabel,
  bulkEnrichSummary,
  reduceBulkEnrichRun,
  toBulkEnrichProgressState,
  type BulkEnrichEvent,
  type BulkEnrichRunState,
} from "../bulkEnrichRun";

const fold = (events: BulkEnrichEvent[]): BulkEnrichRunState =>
  events.reduce(reduceBulkEnrichRun, EMPTY_BULK_ENRICH_RUN);

const startOf = (n: number, alreadyEnriched = 0): BulkEnrichEvent => ({
  type: "start",
  depth: "applied",
  alreadyEnriched,
  cards: Array.from({ length: n }, (_, i) => ({
    cardId: `c${i}`,
    label: `Card ${i}`,
  })),
});

describe("progress accounting", () => {
  it("counts only settled cards — an in-flight card is not 'enriched' yet", () => {
    const state = fold([
      startOf(80),
      { type: "card_enriched", cardId: "c0", layersAdded: 3 },
      { type: "card_running", cardId: "c1" },
    ]);
    expect(bulkEnrichProgressLabel(state)).toBe("1 of 80 cards enriched");
    expect(bulkEnrichCounts(state).running).toBe(1);
  });

  it("reports the real N of M as cards settle", () => {
    let state = fold([startOf(80)]);
    for (let i = 0; i < 6; i++) {
      state = reduceBulkEnrichRun(state, {
        type: "card_enriched",
        cardId: `c${i}`,
        layersAdded: 2,
      });
    }
    expect(bulkEnrichProgressLabel(state)).toBe("6 of 80 cards enriched");
    expect(bulkEnrichCounts(state).layersAdded).toBe(12);
  });

  it("a single card counts once, no matter how many events it emits", () => {
    const state = fold([
      startOf(2),
      { type: "card_running", cardId: "c0" },
      { type: "card_enriched", cardId: "c0", layersAdded: 4 },
      { type: "card_running", cardId: "c1" },
      { type: "card_failed", cardId: "c1", error: "timeout" },
    ]);
    const counts = bulkEnrichCounts(state);
    expect(counts).toMatchObject({
      total: 2,
      processed: 2,
      enriched: 1,
      failed: 1,
      layersAdded: 4,
    });
  });

  it("never silently drops a card the plan didn't name", () => {
    const state = fold([
      startOf(1),
      { type: "card_enriched", cardId: "ghost", layersAdded: 1 },
    ]);
    expect(state.cards).toHaveLength(2);
    expect(bulkEnrichCounts(state).enriched).toBe(1);
  });
});

describe("failure isolation", () => {
  it("one failed card never ends the run — later cards still land", () => {
    const state = fold([
      startOf(3),
      { type: "card_failed", cardId: "c0", error: "The AI couldn't enrich this card." },
      { type: "card_enriched", cardId: "c1", layersAdded: 3 },
      { type: "card_enriched", cardId: "c2", layersAdded: 2 },
      { type: "finish" },
    ]);
    expect(state.phase).toBe("done");
    expect(bulkEnrichCounts(state)).toMatchObject({
      enriched: 2,
      failed: 1,
      processed: 3,
    });
  });

  it("keeps the failure's reason for the summary rows", () => {
    const state = fold([
      startOf(1),
      { type: "card_failed", cardId: "c0", error: "rate limited" },
    ]);
    expect(state.cards[0].error).toBe("rate limited");
    const items = toBulkEnrichProgressState(state, "Bio").items;
    expect(items[0]).toMatchObject({ status: "failed", detail: "rate limited" });
  });

  it("an agent with nothing to add is 'empty', not a failure", () => {
    const state = fold([startOf(1), { type: "card_empty", cardId: "c0" }]);
    const counts = bulkEnrichCounts(state);
    expect(counts.failed).toBe(0);
    expect(counts.empty).toBe(1);
    expect(counts.processed).toBe(1);
    expect(toBulkEnrichProgressState(state, "Bio").items[0].status).toBe(
      "completed",
    );
  });
});

describe("cancellation", () => {
  it("stops the cursor but still counts what already landed", () => {
    const state = fold([
      startOf(10),
      { type: "card_enriched", cardId: "c0", layersAdded: 3 },
      { type: "card_running", cardId: "c1" },
      { type: "cancel" },
      { type: "card_enriched", cardId: "c1", layersAdded: 2 },
      { type: "finish" },
    ]);
    expect(state.phase).toBe("cancelled");
    expect(bulkEnrichCounts(state)).toMatchObject({
      enriched: 2,
      processed: 2,
      total: 10,
    });
  });

  it("leaves no card stuck on a lying 'running' row after finish", () => {
    const state = fold([
      startOf(3),
      { type: "card_running", cardId: "c0" },
      { type: "cancel" },
      { type: "finish" },
    ]);
    expect(state.cards.every((c) => c.status !== "running")).toBe(true);
    expect(bulkEnrichCounts(state).processed).toBe(0);
  });
});

describe("the end-of-run summary is the truth", () => {
  it("names enriched, failed and already-had-layers", () => {
    let state = fold([startOf(70, 10)]);
    for (let i = 0; i < 68; i++) {
      state = reduceBulkEnrichRun(state, {
        type: "card_enriched",
        cardId: `c${i}`,
        layersAdded: 3,
      });
    }
    for (let i = 68; i < 70; i++) {
      state = reduceBulkEnrichRun(state, {
        type: "card_failed",
        cardId: `c${i}`,
        error: "timeout",
      });
    }
    state = reduceBulkEnrichRun(state, { type: "finish" });
    expect(bulkEnrichSummary(state)).toBe(
      "68 enriched, 2 failed, 10 already had layers",
    );
  });

  it("reports cards a cancel never reached instead of hiding them", () => {
    const state = fold([
      startOf(10),
      { type: "card_enriched", cardId: "c0", layersAdded: 1 },
      { type: "cancel" },
      { type: "finish" },
    ]);
    expect(bulkEnrichSummary(state)).toBe("1 enriched, 9 not started");
  });

  it("says so plainly when a whole deck was already enriched", () => {
    const state = fold([startOf(0, 12), { type: "finish" }]);
    expect(bulkEnrichSummary(state)).toBe("0 enriched, 12 already had layers");
  });
});

describe("reset", () => {
  it("returns to the idle run", () => {
    const state = fold([
      startOf(3),
      { type: "card_enriched", cardId: "c0", layersAdded: 1 },
      { type: "reset" },
    ]);
    expect(state).toEqual(EMPTY_BULK_ENRICH_RUN);
  });
});
