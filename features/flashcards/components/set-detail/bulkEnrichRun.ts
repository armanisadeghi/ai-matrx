"use client";

// features/flashcards/components/set-detail/bulkEnrichRun.ts
//
// "Enrich these cards" — the plan, the cursor, and the accounting behind the
// live enrichment cascade (`BulkEnrichWindow` + `EnrichingCardTile`).
//
// Arman's second use case, verbatim: "maybe you have a set of cards and you
// wanna enrich all of them. You click one button, they all get enriched."
//
// TWO CORRECTIONS THIS FILE CARRIES, both against its own first version:
//
//   1. IT IS NOT ALL-OR-NOTHING. Set detail already has full multi-select
//      (`selectedIds` in SetDetailView). `planBulkEnrich` reads it: an explicit
//      selection IS the plan — including a card that already has layers, because
//      a user who picks a card deliberately outranks a skip heuristic. With no
//      selection the old behaviour stands: every card that lacks layers.
//   2. IT DRIVES A LIVE RENDER, NOT A PROGRESS BAR. Each card's run publishes
//      its own `requestId` (`card_request`) the moment the request row exists,
//      mid-stream. The tile subscribes to `selectKindEnvelope(requestId,
//      "card_enrichment")` and the registered `card_enrichment` component draws
//      the layers as they arrive. There is still exactly ONE parse session per
//      card — the StreamBlockAccumulator's — feeding both that display and the
//      extracted JSON this runner persists. No surface opens a second parse.
//
// Shape mirrors `illustrateSetRun.ts` — a PURE reducer plus a thin hook — so
// the accounting is testable without React and without an agent. The work runs
// CLIENT-side (one `enrich_card` mandate run per card) because that mandate has
// no batch door on the server, so this module owns the cursor, the cancel flag
// and the failure isolation a server stream would otherwise own. It PERSISTS as
// it goes (`enrichAndSaveCard`) instead of previewing: 80 previews is not a
// thing a human reviews, and every layer is individually removable.
//
// THE THREE PROMISES this file keeps:
//   1. Live content — real layers on screen while it runs, never a spinner as
//      the primary state.
//   2. Cancellable — cancel stops the CURSOR; cards already in flight are
//      allowed to land and are counted (their model call was already spent).
//   3. Truthful summary — enriched / failed / already-had-layers / re-enriched
//      by request, all reported; one failed card can never end the run.

import { useCallback, useRef, useState } from "react";

import type { Depth } from "@/features/education/assessment/data/types";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { enrichAndSaveCard } from "../../data/enrichCardLane";
import { cardHasDetailLayers } from "../../data/cardDetailLayers";
import type { EnrichedDetail } from "../../data/enhanceCard";
import type { CardWithDetails } from "../../data/types";

/**
 * How many cards stream at once.
 *
 * THREE, deliberately — down from four when this lane was headless. Every
 * in-flight card now owns a visible tile that is drawing live layer text, and
 * the experience IS the deliverable: four simultaneous streams on a 375px
 * screen is motion nobody can read, and each card is a paid model call, so a
 * cancel one second in must not have already spent forty of them. Throughput is
 * explicitly not what this number optimizes.
 */
export const BULK_ENRICH_CONCURRENCY = 3;

export type BulkEnrichCardStatus =
  | "waiting"
  | "running"
  | "enriched"
  | "empty"
  | "failed";

export interface BulkEnrichCardState {
  cardId: string;
  /** The card's front — the tile shows it the instant the run starts. */
  front: string;
  /** The card's back, so a tile is a real card and not a label. */
  back: string;
  status: BulkEnrichCardStatus;
  /**
   * This card's own run request id, published mid-stream. The tile renders
   * `selectKindEnvelope(requestId, "card_enrichment")` off it while streaming.
   */
  requestId?: string;
  /** The layers that actually landed in the DB for this card. */
  layers: EnrichedDetail[];
  /**
   * True when the user EXPLICITLY selected a card that ALREADY had layers. The
   * skip heuristic is overridden, and the summary says so.
   */
  reEnriched: boolean;
  error?: string;
}

export type BulkEnrichPhase = "idle" | "running" | "done" | "cancelled";

export interface BulkEnrichRunState {
  phase: BulkEnrichPhase;
  depth: Depth;
  /** Cards this run is touching. */
  cards: BulkEnrichCardState[];
  /** Cards deliberately NOT touched because they already carried layers. */
  alreadyEnriched: number;
  /** True when the plan came from an explicit selection rather than "all". */
  fromSelection: boolean;
}

export const EMPTY_BULK_ENRICH_RUN: BulkEnrichRunState = {
  phase: "idle",
  depth: "applied",
  cards: [],
  alreadyEnriched: 0,
  fromSelection: false,
};

/** One card as the plan describes it, before any work happens. */
export interface PlannedEnrichCard {
  cardId: string;
  front: string;
  back: string;
  reEnriched: boolean;
}

export type BulkEnrichEvent =
  | {
      type: "start";
      depth: Depth;
      cards: PlannedEnrichCard[];
      alreadyEnriched: number;
      fromSelection: boolean;
    }
  | { type: "card_running"; cardId: string }
  /** The run's request row exists — the tile can go live. */
  | { type: "card_request"; cardId: string; requestId: string }
  | { type: "card_enriched"; cardId: string; layers: EnrichedDetail[] }
  | { type: "card_empty"; cardId: string }
  | { type: "card_failed"; cardId: string; error: string }
  | { type: "cancel" }
  | { type: "finish" }
  | { type: "reset" };

// ---------------------------------------------------------------------------
// THE PLAN — pure, and the only place that decides which cards get enriched.
// ---------------------------------------------------------------------------

export interface BulkEnrichPlan {
  /** The cards this run will actually touch, in order. */
  todo: CardWithDetails[];
  /** Cards skipped up front because they already had layers ("all" mode only). */
  alreadyEnriched: number;
  /** Selected cards that already had layers and are being enriched anyway. */
  reEnrichedIds: Set<string>;
  /** True when an explicit selection produced this plan. */
  fromSelection: boolean;
}

/**
 * Decide the work.
 *
 * WITH a selection: the selection IS the plan. Every selected card runs —
 * including one that already carries layers, because an explicit pick beats the
 * skip heuristic (and the summary reports those separately, so nobody is
 * surprised by a second spend on a card they chose).
 *
 * WITHOUT a selection: every card that lacks layers, and the rest are skipped
 * and SAID so — never silently re-billed.
 */
export function planBulkEnrich(
  cards: readonly CardWithDetails[],
  selectedIds?: ReadonlySet<string> | null,
): BulkEnrichPlan {
  const selected =
    selectedIds && selectedIds.size > 0
      ? cards.filter((c) => selectedIds.has(c.id))
      : null;

  if (selected && selected.length > 0) {
    const reEnrichedIds = new Set(
      selected.filter((c) => cardHasDetailLayers(c.details)).map((c) => c.id),
    );
    return {
      todo: selected,
      alreadyEnriched: 0,
      reEnrichedIds,
      fromSelection: true,
    };
  }

  const todo = cards.filter((c) => !cardHasDetailLayers(c.details));
  return {
    todo,
    alreadyEnriched: cards.length - todo.length,
    reEnrichedIds: new Set<string>(),
    fromSelection: false,
  };
}

/**
 * What the button says. The count is always the count of cards that will
 * actually run, so the label can never promise work the plan won't do.
 */
export function bulkEnrichActionLabel(plan: BulkEnrichPlan): string {
  return plan.fromSelection
    ? `Enrich selected (${plan.todo.length})`
    : `Enrich all cards (${plan.todo.length})`;
}

// ---------------------------------------------------------------------------
// THE REDUCER
// ---------------------------------------------------------------------------

function plannedToState(card: PlannedEnrichCard): BulkEnrichCardState {
  return {
    cardId: card.cardId,
    front: card.front,
    back: card.back,
    status: "waiting",
    layers: [],
    reEnriched: card.reEnriched,
  };
}

/** Fold one event into the run state. Pure — this is what the tests pin. */
export function reduceBulkEnrichRun(
  state: BulkEnrichRunState,
  event: BulkEnrichEvent,
): BulkEnrichRunState {
  switch (event.type) {
    case "reset":
      return EMPTY_BULK_ENRICH_RUN;
    case "start":
      return {
        phase: "running",
        depth: event.depth,
        alreadyEnriched: event.alreadyEnriched,
        fromSelection: event.fromSelection,
        cards: event.cards.map(plannedToState),
      };
    case "cancel":
      // Cancelling is a decision about the CURSOR, not about the cards already
      // in flight — their rows still land, and the counts below still count
      // them. Marking them "cancelled" here would under-report real work.
      return state.phase === "running" ? { ...state, phase: "cancelled" } : state;
    case "finish":
      return state.phase === "running" || state.phase === "cancelled"
        ? {
            ...state,
            phase: state.phase === "cancelled" ? "cancelled" : "done",
            // Anything never reached (cancel, or a card that vanished) must not
            // sit on a lying "running" row.
            cards: state.cards.map((c) =>
              c.status === "running" || c.status === "waiting"
                ? { ...c, status: "waiting" as const, requestId: undefined }
                : c,
            ),
          }
        : state;
    case "card_running":
    case "card_request":
    case "card_enriched":
    case "card_empty":
    case "card_failed": {
      let touched = false;
      const cards = state.cards.map((card) => {
        if (card.cardId !== event.cardId) return card;
        touched = true;
        return applyCardEvent(card, event);
      });
      // Progress that silently drops work is a lie (same rule the illustrate
      // reducer follows): an unknown card id still gets a row.
      if (!touched) {
        cards.push(
          applyCardEvent(
            plannedToState({
              cardId: event.cardId,
              front: "Card",
              back: "",
              reEnriched: false,
            }),
            event,
          ),
        );
      }
      return { ...state, cards };
    }
  }
}

function applyCardEvent(
  card: BulkEnrichCardState,
  event: Extract<
    BulkEnrichEvent,
    { type: "card_running" | "card_request" | "card_enriched" | "card_empty" | "card_failed" }
  >,
): BulkEnrichCardState {
  switch (event.type) {
    case "card_running":
      return { ...card, status: "running" };
    case "card_request":
      // The requestId can arrive before or after `card_running` — never let it
      // downgrade a settled card back into the live lane.
      return { ...card, requestId: event.requestId };
    case "card_enriched":
      // The live handle is dropped the moment real rows exist: from here the
      // tile renders what is IN THE DATABASE, not what a stream said.
      return {
        ...card,
        status: "enriched",
        layers: event.layers,
        requestId: undefined,
      };
    case "card_empty":
      return { ...card, status: "empty", layers: [], requestId: undefined };
    case "card_failed":
      return {
        ...card,
        status: "failed",
        error: event.error,
        requestId: undefined,
      };
  }
}

// ---------------------------------------------------------------------------
// THE ACCOUNTING
// ---------------------------------------------------------------------------

export interface BulkEnrichCounts {
  /** Cards this run set out to enrich. */
  total: number;
  /** Cards that have reached a final state (enriched + empty + failed). */
  processed: number;
  enriched: number;
  empty: number;
  failed: number;
  /** Cards skipped up front because they already had layers. */
  alreadyEnriched: number;
  /** Cards the user explicitly picked that already had layers — run anyway. */
  reEnriched: number;
  /** Detail layers actually written in this run. */
  layersAdded: number;
  running: number;
}

/** The accounting. Every number the summary quotes comes from here. */
export function bulkEnrichCounts(state: BulkEnrichRunState): BulkEnrichCounts {
  let enriched = 0;
  let empty = 0;
  let failed = 0;
  let running = 0;
  let layersAdded = 0;
  let reEnriched = 0;
  for (const card of state.cards) {
    if (card.status === "enriched") {
      enriched += 1;
      layersAdded += card.layers.length;
      if (card.reEnriched) reEnriched += 1;
    } else if (card.status === "empty") empty += 1;
    else if (card.status === "failed") failed += 1;
    else if (card.status === "running") running += 1;
  }
  return {
    total: state.cards.length,
    processed: enriched + empty + failed,
    enriched,
    empty,
    failed,
    alreadyEnriched: state.alreadyEnriched,
    reEnriched,
    layersAdded,
    running,
  };
}

/** The live headline: "6 of 80 cards enriched". */
export function bulkEnrichProgressLabel(state: BulkEnrichRunState): string {
  const c = bulkEnrichCounts(state);
  return `${c.processed} of ${c.total} card${c.total === 1 ? "" : "s"} enriched`;
}

/**
 * The end-of-run truth. Names every bucket that is non-zero and NEVER rounds a
 * failure away — "68 enriched, 2 failed, 10 already had layers".
 */
export function bulkEnrichSummary(state: BulkEnrichRunState): string {
  return summarizeBulkEnrichCounts(bulkEnrichCounts(state));
}

/** The same truth, straight from the counts (what the runner hands back). */
export function summarizeBulkEnrichCounts(c: BulkEnrichCounts): string {
  const parts: string[] = [`${c.enriched} enriched`];
  if (c.empty > 0) parts.push(`${c.empty} had nothing to add`);
  if (c.failed > 0) parts.push(`${c.failed} failed`);
  // The explicit override, said out loud — a user who picked an already-rich
  // card must see that we honoured the pick and spent on it.
  if (c.reEnriched > 0) {
    parts.push(`${c.reEnriched} you picked already had layers and got more`);
  }
  if (c.alreadyEnriched > 0) {
    parts.push(`${c.alreadyEnriched} already had layers`);
  }
  const notReached = c.total - c.processed;
  if (notReached > 0) parts.push(`${notReached} not started`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// THE RUNNER
// ---------------------------------------------------------------------------

export interface BulkEnrichStartArgs {
  /** Every card in the set — the plan decides which of them run. */
  cards: CardWithDetails[];
  /** The user's current multi-select, if any. See `planBulkEnrich`. */
  selectedIds?: ReadonlySet<string> | null;
  depth: Depth;
  /** Called once per card that genuinely succeeded — the metering seam. */
  onCardEnriched?: () => void | Promise<void>;
}

export interface BulkEnrichOutcome {
  counts: BulkEnrichCounts;
  cancelled: boolean;
}

/**
 * The runner. Sequentially-cursored, `BULK_ENRICH_CONCURRENCY` at a time,
 * cancellable, and per-card fault isolated: a card that throws is recorded as
 * failed and the cursor moves on.
 *
 * Each card runs with `displayMode: "direct"` + `keepInstance: true` (set by
 * `enrichCard`) so its render blocks — and therefore its live
 * `card_enrichment` envelope — survive the stream for the tile to draw. The
 * runner owns the matching teardown: the instance is destroyed the moment the
 * card settles, because from then on the tile renders the persisted rows.
 */
export function useBulkEnrichRun(
  dispatch: AppDispatch,
  getState: () => RootState,
) {
  const [run, setRun] = useState<BulkEnrichRunState>(EMPTY_BULK_ENRICH_RUN);
  const cancelledRef = useRef(false);
  // The reducer output is also read synchronously by the runner (to build the
  // final outcome without waiting for a React commit).
  const stateRef = useRef<BulkEnrichRunState>(EMPTY_BULK_ENRICH_RUN);

  const send = useCallback((event: BulkEnrichEvent) => {
    stateRef.current = reduceBulkEnrichRun(stateRef.current, event);
    setRun(stateRef.current);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    send({ type: "cancel" });
  }, [send]);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    send({ type: "reset" });
  }, [send]);

  const start = useCallback(
    async (args: BulkEnrichStartArgs): Promise<BulkEnrichOutcome> => {
      cancelledRef.current = false;
      const plan = planBulkEnrich(args.cards, args.selectedIds);
      send({
        type: "start",
        depth: args.depth,
        alreadyEnriched: plan.alreadyEnriched,
        fromSelection: plan.fromSelection,
        cards: plan.todo.map((c) => ({
          cardId: c.id,
          front: c.front,
          back: c.back,
          reEnriched: plan.reEnrichedIds.has(c.id),
        })),
      });

      let cursor = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          if (cancelledRef.current) return;
          const card = plan.todo[cursor++];
          if (!card) return;
          send({ type: "card_running", cardId: card.id });
          // Kept so this card's instance can be torn down when it settles —
          // `keepInstance: true` makes teardown the caller's job.
          let conversationId: string | null = null;
          const releaseInstance = () => {
            if (!conversationId) return;
            const owned = conversationId;
            conversationId = null;
            dispatch(destroyInstanceIfAllowed(owned));
          };
          try {
            const outcome = await enrichAndSaveCard({
              card,
              depth: args.depth,
              onConversationCreated: (id) => {
                conversationId = id;
              },
              // The live seam: the tile goes from "queued" to real streaming
              // content the moment this fires.
              onRequestId: (requestId) =>
                send({ type: "card_request", cardId: card.id, requestId }),
            })(dispatch, getState);
            if (outcome.status === "saved") {
              send({
                type: "card_enriched",
                cardId: card.id,
                layers: outcome.rows.map((r) => ({
                  kind: r.kind,
                  text: r.text,
                })),
              });
              // One card = one model call = one metered unit, recorded on the
              // genuine success branch only.
              await args.onCardEnriched?.();
            } else if (outcome.status === "empty") {
              send({ type: "card_empty", cardId: card.id });
            } else {
              send({
                type: "card_failed",
                cardId: card.id,
                error: outcome.error,
              });
            }
          } catch (err) {
            // A thrown card is STILL just one failed card (promise #3).
            send({
              type: "card_failed",
              cardId: card.id,
              error:
                err instanceof Error
                  ? err.message
                  : "Enrichment failed for this card",
            });
          } finally {
            releaseInstance();
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(BULK_ENRICH_CONCURRENCY, plan.todo.length) },
          () => worker(),
        ),
      );
      send({ type: "finish" });
      return {
        counts: bulkEnrichCounts(stateRef.current),
        cancelled: cancelledRef.current,
      };
    },
    [dispatch, getState, send],
  );

  return { run, start, cancel, reset };
}
