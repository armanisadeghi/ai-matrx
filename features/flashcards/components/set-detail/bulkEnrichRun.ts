"use client";

// features/flashcards/components/set-detail/bulkEnrichRun.ts
//
// "Enrich every card in this set" — one button, real progress, honest ending.
//
// Arman's second use case, verbatim: "maybe you have a set of cards and you
// wanna enrich all of them. You click one button, they all get enriched." The
// defect this replaces: set detail opened a scroll-and-pick LIST of every card
// and made you enrich them one at a time, with no progress anywhere ("it
// doesn't say 6 out of 80 flashcards enriched").
//
// Shape mirrors `illustrateSetRun.ts` — a PURE reducer plus a thin hook — so
// the accounting is testable without React and without an agent. Differences
// from the illustrate lane, both deliberate:
//   • The work runs CLIENT-side (one `enrich_card` mandate run per card through
//     the canonical headless primitive), because that mandate has no batch door
//     on the server. So this module owns the cursor, the cancel flag and the
//     failure isolation that a server stream would otherwise own.
//   • It PERSISTS as it goes (`enrichAndSaveCard`) instead of previewing: 80
//     previews is not a thing a human reviews, and every layer is individually
//     removable in the editor.
//
// THE THREE PROMISES this file keeps:
//   1. Live count — "N of M cards enriched" while it runs, never a spinner.
//   2. Cancellable — cancel stops the CURSOR; cards already in flight are
//      allowed to land and are counted (their model call was already spent).
//   3. Truthful summary — enriched / failed / already-had-layers, all reported;
//      one failed card can never end the run.

import { useCallback, useRef, useState } from "react";

import type { LiveRunProgressState } from "@/features/agents/components/live-run/LiveRunProgress";
import type { Depth } from "@/features/education/assessment/data/types";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { enrichAndSaveCard } from "../../data/enrichCardLane";
import { cardHasDetailLayers } from "../../data/cardDetailLayers";
import type { CardWithDetails } from "../../data/types";

/** How many cards are enriched at once. Small on purpose: the point is a live,
 *  cancellable count, not maximum throughput — and each card is a paid model
 *  call, so a cancel one second in must not have already spent forty of them. */
export const BULK_ENRICH_CONCURRENCY = 4;

export type BulkEnrichCardStatus =
  | "waiting"
  | "running"
  | "enriched"
  | "empty"
  | "failed";

export interface BulkEnrichCardState {
  cardId: string;
  label: string;
  status: BulkEnrichCardStatus;
  /** How many `fc_detail` layers actually landed on this card. */
  layersAdded: number;
  error?: string;
}

export type BulkEnrichPhase = "idle" | "running" | "done" | "cancelled";

export interface BulkEnrichRunState {
  phase: BulkEnrichPhase;
  depth: Depth;
  /** Cards this run will touch (i.e. cards that had no layers yet). */
  cards: BulkEnrichCardState[];
  /** Cards deliberately NOT touched because they already carried layers. */
  alreadyEnriched: number;
}

export const EMPTY_BULK_ENRICH_RUN: BulkEnrichRunState = {
  phase: "idle",
  depth: "applied",
  cards: [],
  alreadyEnriched: 0,
};

export type BulkEnrichEvent =
  | {
      type: "start";
      depth: Depth;
      cards: { cardId: string; label: string }[];
      alreadyEnriched: number;
    }
  | { type: "card_running"; cardId: string }
  | { type: "card_enriched"; cardId: string; layersAdded: number }
  | { type: "card_empty"; cardId: string }
  | { type: "card_failed"; cardId: string; error: string }
  | { type: "cancel" }
  | { type: "finish" }
  | { type: "reset" };

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
        cards: event.cards.map((c) => ({
          cardId: c.cardId,
          label: c.label,
          status: "waiting" as const,
          layersAdded: 0,
        })),
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
                ? { ...c, status: "waiting" as const }
                : c,
            ),
          }
        : state;
    case "card_running":
    case "card_enriched":
    case "card_empty":
    case "card_failed": {
      let touched = false;
      const cards = state.cards.map((card) => {
        if (card.cardId !== event.cardId) return card;
        touched = true;
        if (event.type === "card_running") {
          return { ...card, status: "running" as const };
        }
        if (event.type === "card_enriched") {
          return {
            ...card,
            status: "enriched" as const,
            layersAdded: event.layersAdded,
          };
        }
        if (event.type === "card_empty") {
          return { ...card, status: "empty" as const, layersAdded: 0 };
        }
        return { ...card, status: "failed" as const, error: event.error };
      });
      // Progress that silently drops work is a lie (same rule the illustrate
      // reducer follows): an unknown card id still gets a row.
      if (!touched) {
        cards.push({
          cardId: event.cardId,
          label: "Card",
          status:
            event.type === "card_running"
              ? "running"
              : event.type === "card_enriched"
                ? "enriched"
                : event.type === "card_empty"
                  ? "empty"
                  : "failed",
          layersAdded: event.type === "card_enriched" ? event.layersAdded : 0,
          ...(event.type === "card_failed" ? { error: event.error } : {}),
        });
      }
      return { ...state, cards };
    }
  }
}

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
  for (const card of state.cards) {
    if (card.status === "enriched") {
      enriched += 1;
      layersAdded += card.layersAdded;
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
  if (c.alreadyEnriched > 0) {
    parts.push(`${c.alreadyEnriched} already had layers`);
  }
  const notReached = c.total - c.processed;
  if (notReached > 0) parts.push(`${notReached} not started`);
  return parts.join(", ");
}

/** The run's rows in the canonical live-run progress shape. */
export function toBulkEnrichProgressState(
  state: BulkEnrichRunState,
  setName: string,
): LiveRunProgressState {
  return {
    title: `Enriching ${setName}`,
    description: bulkEnrichProgressLabel(state),
    items: state.cards.map((card) => ({
      id: card.cardId,
      label: card.label,
      status:
        card.status === "enriched" || card.status === "empty"
          ? ("completed" as const)
          : card.status === "failed"
            ? ("failed" as const)
            : card.status === "running"
              ? ("running" as const)
              : ("waiting" as const),
      ...(card.status === "enriched"
        ? {
            detail: `${card.layersAdded} new layer${
              card.layersAdded === 1 ? "" : "s"
            }`,
          }
        : {}),
      ...(card.status === "empty"
        ? { detail: "Nothing new to add for this card" }
        : {}),
      ...(card.status === "failed"
        ? { detail: card.error || "Enrichment failed for this card" }
        : {}),
    })),
  };
}

export interface BulkEnrichStartArgs {
  cards: CardWithDetails[];
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
      const todo = args.cards.filter((c) => !cardHasDetailLayers(c.details));
      const alreadyEnriched = args.cards.length - todo.length;
      send({
        type: "start",
        depth: args.depth,
        alreadyEnriched,
        cards: todo.map((c) => ({
          cardId: c.id,
          label: c.front.slice(0, 90) || "Card",
        })),
      });

      let cursor = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          if (cancelledRef.current) return;
          const card = todo[cursor++];
          if (!card) return;
          send({ type: "card_running", cardId: card.id });
          try {
            const outcome = await enrichAndSaveCard({
              card,
              depth: args.depth,
            })(dispatch, getState);
            if (outcome.status === "saved") {
              send({
                type: "card_enriched",
                cardId: card.id,
                layersAdded: outcome.rows.length,
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
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(BULK_ENRICH_CONCURRENCY, todo.length) },
          () => worker()),
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
