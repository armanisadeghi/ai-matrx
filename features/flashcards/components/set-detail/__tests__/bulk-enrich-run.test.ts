/**
 * Bulk enrichment's PLAN and its accounting.
 *
 * The plan is the newer half and the more dangerous one: it decides which
 * cards get a paid model call. It reads the set page's existing multi-select,
 * and an explicitly picked card beats the "already has layers" skip heuristic —
 * which means the summary owes the user a separate, out-loud line for those.
 *
 * The accounting pins the three promises: a truthful live count, a cancel that
 * under-reports nothing, and a summary that never rounds a failure away.
 */

import {
  EMPTY_BULK_ENRICH_RUN,
  bulkEnrichActionLabel,
  bulkEnrichCounts,
  bulkEnrichProgressLabel,
  bulkEnrichSummary,
  planBulkEnrich,
  reduceBulkEnrichRun,
  type BulkEnrichEvent,
  type BulkEnrichRunState,
} from "../bulkEnrichRun";
import type { CardWithDetails } from "../../../data/types";

const fold = (events: BulkEnrichEvent[]): BulkEnrichRunState =>
  events.reduce(reduceBulkEnrichRun, EMPTY_BULK_ENRICH_RUN);

const startOf = (
  n: number,
  alreadyEnriched = 0,
  opts: { fromSelection?: boolean; reEnriched?: string[] } = {},
): BulkEnrichEvent => ({
  type: "start",
  depth: "applied",
  alreadyEnriched,
  fromSelection: opts.fromSelection ?? false,
  cards: Array.from({ length: n }, (_, i) => ({
    cardId: `c${i}`,
    front: `Card ${i}`,
    back: `Back ${i}`,
    reEnriched: (opts.reEnriched ?? []).includes(`c${i}`),
  })),
});

const layers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: "helper", text: `layer ${i}` }));

/** A card with `n` readable detail layers already stored on it. */
const card = (id: string, n = 0): CardWithDetails =>
  ({
    id,
    front: `Front ${id}`,
    back: `Back ${id}`,
    details: Array.from({ length: n }, (_, i) => ({
      id: `${id}-d${i}`,
      kind: "helper",
      text: `stored ${i}`,
    })),
  }) as unknown as CardWithDetails;

describe("planBulkEnrich — which cards actually run", () => {
  const deck = [card("a"), card("b", 2), card("c"), card("d", 1)];

  it("with NO selection, enriches every card that lacks layers", () => {
    const plan = planBulkEnrich(deck, new Set());
    expect(plan.todo.map((c) => c.id)).toEqual(["a", "c"]);
    expect(plan.alreadyEnriched).toBe(2);
    expect(plan.fromSelection).toBe(false);
    expect(bulkEnrichActionLabel(plan)).toBe("Enrich all cards (2)");
  });

  it("a selection IS the plan — only the picked cards run", () => {
    const plan = planBulkEnrich(deck, new Set(["a", "c"]));
    expect(plan.todo.map((c) => c.id)).toEqual(["a", "c"]);
    expect(plan.fromSelection).toBe(true);
    expect(bulkEnrichActionLabel(plan)).toBe("Enrich selected (2)");
  });

  it("an EXPLICIT pick beats the skip heuristic — a card with layers still runs", () => {
    const plan = planBulkEnrich(deck, new Set(["b"]));
    expect(plan.todo.map((c) => c.id)).toEqual(["b"]);
    // Nothing was skipped: the user asked for this one by name.
    expect(plan.alreadyEnriched).toBe(0);
    // ...and it is flagged, so the summary can say so out loud.
    expect([...plan.reEnrichedIds]).toEqual(["b"]);
  });

  it("null / empty selection falls back to 'all', never to 'nothing'", () => {
    expect(planBulkEnrich(deck, null).todo).toHaveLength(2);
    expect(planBulkEnrich(deck).todo).toHaveLength(2);
  });

  it("ignores selected ids that are not in this set", () => {
    const plan = planBulkEnrich(deck, new Set(["a", "ghost"]));
    expect(plan.todo.map((c) => c.id)).toEqual(["a"]);
    expect(bulkEnrichActionLabel(plan)).toBe("Enrich selected (1)");
  });

  it("the label's count is the count that will run — never the deck size", () => {
    const allRich = [card("x", 1), card("y", 3)];
    expect(bulkEnrichActionLabel(planBulkEnrich(allRich, new Set()))).toBe(
      "Enrich all cards (0)",
    );
  });
});

describe("progress accounting", () => {
  it("counts only settled cards — an in-flight card is not 'enriched' yet", () => {
    const state = fold([
      startOf(80),
      { type: "card_enriched", cardId: "c0", layers: layers(3) },
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
        layers: layers(2),
      });
    }
    expect(bulkEnrichProgressLabel(state)).toBe("6 of 80 cards enriched");
    expect(bulkEnrichCounts(state).layersAdded).toBe(12);
  });

  it("a single card counts once, no matter how many events it emits", () => {
    const state = fold([
      startOf(2),
      { type: "card_running", cardId: "c0" },
      { type: "card_enriched", cardId: "c0", layers: layers(4) },
      { type: "card_running", cardId: "c1" },
      { type: "card_failed", cardId: "c1", error: "timeout" },
    ]);
    expect(bulkEnrichCounts(state)).toMatchObject({
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
      { type: "card_enriched", cardId: "ghost", layers: layers(1) },
    ]);
    expect(state.cards).toHaveLength(2);
    expect(bulkEnrichCounts(state).enriched).toBe(1);
  });
});

describe("the live-render handle", () => {
  it("carries the card's own requestId so its tile can stream", () => {
    const state = fold([
      startOf(2),
      { type: "card_running", cardId: "c0" },
      { type: "card_request", cardId: "c0", requestId: "req-1" },
    ]);
    expect(state.cards[0]).toMatchObject({
      status: "running",
      requestId: "req-1",
      front: "Card 0",
      back: "Back 0",
    });
    // A card that hasn't started has no live handle to subscribe to.
    expect(state.cards[1].requestId).toBeUndefined();
  });

  it("a request id arriving out of order never revives a settled card", () => {
    const state = fold([
      startOf(1),
      { type: "card_enriched", cardId: "c0", layers: layers(2) },
      { type: "card_request", cardId: "c0", requestId: "late" },
    ]);
    expect(state.cards[0].status).toBe("enriched");
  });

  it("drops the handle the moment real rows exist — the DB is the truth then", () => {
    const state = fold([
      startOf(1),
      { type: "card_request", cardId: "c0", requestId: "req-1" },
      { type: "card_running", cardId: "c0" },
      { type: "card_enriched", cardId: "c0", layers: layers(2) },
    ]);
    expect(state.cards[0].requestId).toBeUndefined();
    expect(state.cards[0].layers).toHaveLength(2);
  });

  it("keeps the card's face from the first frame, before anything streams", () => {
    const state = fold([startOf(1)]);
    expect(state.cards[0]).toMatchObject({
      status: "waiting",
      front: "Card 0",
      back: "Back 0",
      layers: [],
    });
  });
});

describe("failure isolation", () => {
  it("one failed card never ends the run — later cards still land", () => {
    const state = fold([
      startOf(3),
      {
        type: "card_failed",
        cardId: "c0",
        error: "The AI couldn't enrich this card.",
      },
      { type: "card_enriched", cardId: "c1", layers: layers(3) },
      { type: "card_enriched", cardId: "c2", layers: layers(2) },
      { type: "finish" },
    ]);
    expect(state.phase).toBe("done");
    expect(bulkEnrichCounts(state)).toMatchObject({
      enriched: 2,
      failed: 1,
      processed: 3,
    });
  });

  it("keeps the failure's reason for the tile to show", () => {
    const state = fold([
      startOf(1),
      { type: "card_failed", cardId: "c0", error: "rate limited" },
    ]);
    expect(state.cards[0]).toMatchObject({
      status: "failed",
      error: "rate limited",
    });
  });

  it("an agent with nothing to add is 'empty', not a failure", () => {
    const state = fold([startOf(1), { type: "card_empty", cardId: "c0" }]);
    expect(bulkEnrichCounts(state)).toMatchObject({
      failed: 0,
      empty: 1,
      processed: 1,
    });
  });
});

describe("cancellation", () => {
  it("stops the cursor but still counts what already landed", () => {
    const state = fold([
      startOf(10),
      { type: "card_enriched", cardId: "c0", layers: layers(3) },
      { type: "card_running", cardId: "c1" },
      { type: "cancel" },
      { type: "card_enriched", cardId: "c1", layers: layers(2) },
      { type: "finish" },
    ]);
    expect(state.phase).toBe("cancelled");
    expect(bulkEnrichCounts(state)).toMatchObject({
      enriched: 2,
      processed: 2,
      total: 10,
    });
  });

  it("leaves no card stuck on a lying 'running' row (or a dead handle) after finish", () => {
    const state = fold([
      startOf(3),
      { type: "card_running", cardId: "c0" },
      { type: "card_request", cardId: "c0", requestId: "req-1" },
      { type: "cancel" },
      { type: "finish" },
    ]);
    expect(state.cards.every((c) => c.status !== "running")).toBe(true);
    expect(state.cards.every((c) => c.requestId === undefined)).toBe(true);
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
        layers: layers(3),
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

  it("says out loud when a card the user picked was already enriched", () => {
    const state = fold([
      startOf(2, 0, { fromSelection: true, reEnriched: ["c1"] }),
      { type: "card_enriched", cardId: "c0", layers: layers(2) },
      { type: "card_enriched", cardId: "c1", layers: layers(3) },
      { type: "finish" },
    ]);
    expect(bulkEnrichSummary(state)).toBe(
      "2 enriched, 1 you picked already had layers and got more",
    );
  });

  it("reports cards a cancel never reached instead of hiding them", () => {
    const state = fold([
      startOf(10),
      { type: "card_enriched", cardId: "c0", layers: layers(1) },
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
      { type: "card_enriched", cardId: "c0", layers: layers(1) },
      { type: "reset" },
    ]);
    expect(state).toEqual(EMPTY_BULK_ENRICH_RUN);
  });
});
