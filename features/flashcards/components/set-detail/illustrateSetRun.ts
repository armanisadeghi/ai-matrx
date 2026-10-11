"use client";

// illustrateSetRun — the client half of the per-SET flashcard image lane.
//
// Server door: aidream `POST /education/images/source-set` (streaming NDJSON).
// The batch is ~30-60s PER CARD, so the door streams a typed PLAN event (every
// card this run will touch, decided after the plan's pre-flight trim), then one
// PROGRESS event as each card starts and settles, then the terminal summary.
// THE FLOATING LAW: a spinner is never the answer while AI works — this module
// projects that stream onto stable rows the floating window renders live.
//
// Contract twin (never diverge): aidream/services/education/card_images.py
// (`SetImagePlanEvent` / `SetImageProgressEvent`) + api/routers/education_images.py.
// System-of-record: common-docs/systems/education/flashcard-images/FEATURE.md.

import { useRef, useState } from "react";

import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";

export type IllustrateFace = "front" | "back";

/** The sourcing agent's trust judgment — why this picture, in its own words. */
export interface CardImageJudgment {
  alt_text?: string;
  source_trust?: string;
  trust_score?: number;
  reasoning?: string;
}

/** Wire twin of aidream `CardImageSourcingResult`. */
export interface CardImageSourcingResult {
  card_id: string;
  face: string;
  attached: boolean;
  detail_id?: string | null;
  image_url?: string | null;
  alt_text?: string;
  judgment?: CardImageJudgment | null;
  candidate?: {
    page_url?: string;
    domain?: string;
    title?: string;
  } | null;
  query?: string;
  refusal_reason?: string;
}

/** One card's row for the whole life of the run (planned → running → settled). */
export interface IllustrateCardState {
  cardId: string;
  label: string;
  status: "waiting" | "running" | "completed" | "failed";
  /** Settled outcome — present once the card finishes, attached or not. */
  result?: CardImageSourcingResult;
  error?: string;
  /** The human's review verdict, once they keep or reject the picture. */
  review?: "accepted" | "rejected";
}

export interface IllustrateRunState {
  /**
   * `stopping` = Stop was pressed and the stream is being cut; `stopped` = it
   * ended after a Stop, so the cards still `waiting` were never run.
   */
  phase:
    | "idle"
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "done"
    | "refused"
    | "error";
  face: IllustrateFace;
  cards: IllustrateCardState[];
  skippedExisting: number;
  trimmedByLimit: number;
  attachedCount: number;
  message?: string;
}

export const IDLE_RUN: IllustrateRunState = {
  phase: "idle",
  face: "front",
  cards: [],
  skippedExisting: 0,
  trimmedByLimit: 0,
  attachedCount: 0,
};

// ── Wire parsing ───────────────────────────────────────────────────────────
// Typed at the boundary; the stream is data, never trusted shapes.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface PlanEvent {
  kind: "set_image_plan";
  cards: { cardId: string; label: string }[];
  skippedExisting: number;
  trimmedByLimit: number;
}

export interface ProgressEvent {
  kind: "set_image_progress";
  cardId: string;
  status: "running" | "completed" | "failed";
  result?: CardImageSourcingResult;
  error?: string;
}

export interface SummaryEvent {
  kind: "set_images_summary";
  results: CardImageSourcingResult[];
  attachedCount: number;
}

export interface RefusedEvent {
  kind: "refused";
  reason: string;
}

export type IllustrateStreamEvent =
  | PlanEvent
  | ProgressEvent
  | SummaryEvent
  | RefusedEvent;

/** Project one raw stream `data` payload onto a typed event (null = not ours). */
export function parseIllustrateEvent(raw: unknown): IllustrateStreamEvent | null {
  const data = asRecord(raw);
  if (!data) return null;

  if (data.refused === true) {
    return {
      kind: "refused",
      reason:
        typeof data.reason === "string" && data.reason
          ? data.reason
          : "Your plan's image limit was reached for now.",
    };
  }

  if (data.kind === "set_image_plan") {
    const cards: { cardId: string; label: string }[] = [];
    for (const entry of Array.isArray(data.cards) ? data.cards : []) {
      const row = asRecord(entry);
      if (!row || typeof row.card_id !== "string") continue;
      cards.push({
        cardId: row.card_id,
        label: typeof row.label === "string" && row.label ? row.label : "Card",
      });
    }
    return {
      kind: "set_image_plan",
      cards,
      skippedExisting:
        typeof data.skipped_existing === "number" ? data.skipped_existing : 0,
      trimmedByLimit:
        typeof data.trimmed_by_limit === "number" ? data.trimmed_by_limit : 0,
    };
  }

  if (data.kind === "set_image_progress" && typeof data.card_id === "string") {
    const status = data.status;
    if (status !== "running" && status !== "completed" && status !== "failed") {
      return null;
    }
    const result = asRecord(data.result);
    return {
      kind: "set_image_progress",
      cardId: data.card_id,
      status,
      ...(result ? { result: result as unknown as CardImageSourcingResult } : {}),
      ...(typeof data.error === "string" && data.error ? { error: data.error } : {}),
    };
  }

  if (Array.isArray(data.results) && typeof data.attached_count === "number") {
    return {
      kind: "set_images_summary",
      results: data.results as unknown as CardImageSourcingResult[],
      attachedCount: data.attached_count,
    };
  }

  return null;
}

/** Fold one event into the run state — pure, so the reducer is testable. */
export function reduceIllustrateRun(
  state: IllustrateRunState,
  event: IllustrateStreamEvent,
): IllustrateRunState {
  switch (event.kind) {
    case "refused":
      return { ...state, phase: "refused", message: event.reason };
    case "set_image_plan": {
      // A follow-up run ("illustrate the rest") keeps the cards an earlier run
      // already settled, so the trial card's picture never vanishes from review.
      const planned = new Set(event.cards.map((c) => c.cardId));
      const kept = state.cards.filter(
        (c) =>
          !planned.has(c.cardId) &&
          (c.status === "completed" || c.status === "failed"),
      );
      return {
        ...state,
        phase: state.phase === "stopping" ? "stopping" : "running",
        skippedExisting: event.skippedExisting,
        trimmedByLimit: event.trimmedByLimit,
        cards: [
          ...kept,
          ...event.cards.map((c) => ({
            cardId: c.cardId,
            label: c.label,
            status: "waiting" as const,
          })),
        ],
      };
    }
    case "set_image_progress": {
      const cards = state.cards.map((card) =>
        card.cardId === event.cardId
          ? {
              ...card,
              status: event.status,
              ...(event.result ? { result: event.result } : {}),
              ...(event.error ? { error: event.error } : {}),
            }
          : card,
      );
      // A card the plan didn't name (shouldn't happen) still gets a row rather
      // than vanishing — progress that silently drops work is a lie.
      if (!cards.some((c) => c.cardId === event.cardId)) {
        cards.push({
          cardId: event.cardId,
          label: "Card",
          status: event.status,
          ...(event.result ? { result: event.result } : {}),
        });
      }
      return { ...state, cards };
    }
    case "set_images_summary":
      return { ...state, attachedCount: event.attachedCount };
  }
}

/**
 * Drive one set-illustration run. State lives here (the page owns it) so the
 * floating window can render both the live progress and the review pass from
 * one source of truth.
 */
export function useIllustrateSetRun() {
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<IllustrateRunState>(IDLE_RUN);
  // Stop aborts the stream: aidream's source-set cancels on disconnect, and the
  // disconnect reaches the very server process running the batch. The
  // /ai/cancel call is a second, best-effort signal (it only reaches the
  // process it lands on).
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  /**
   * `limit` caps the cards sourced this run (the server counts it after
   * skipping cards that already have a picture) — `1` is "try one card first".
   * `excludeCardIds` are cards the person already judged (a rejected picture),
   * never re-sourced and re-billed.
   */
  const start = async (
    setId: string,
    face: IllustrateFace,
    options: { limit?: number; excludeCardIds?: string[] } = {},
  ) => {
    // One run at a time: a second batch would plan the same unreached cards
    // and pay for them twice.
    if (abortRef.current) {
      return { attached: 0, refused: false, failed: false, stopped: false };
    }
    const controller = new AbortController();
    abortRef.current = controller;
    requestIdRef.current = null;
    stopRequestedRef.current = false;
    setRun((prev) => ({
      ...IDLE_RUN,
      // Keep what earlier runs settled so the review list only grows.
      cards: prev.cards.filter(
        (c) => c.status === "completed" || c.status === "failed",
      ),
      phase: "starting",
      face,
    }));
    let refused = false;
    // Counted here (not read back out of state) so the caller's success branch
    // never races React's updater queue.
    let attached = 0;
    const res = await dispatch(
      callApi({
        path: "/education/images/source-set",
        method: "POST",
        body: {
          set_id: setId,
          face,
          skip_existing: true,
          ...(options.limit ? { limit: options.limit } : {}),
          ...(options.excludeCardIds?.length
            ? { exclude_card_ids: options.excludeCardIds }
            : {}),
        },
        stream: true,
        outputKind: "image",
        signal: controller.signal,
        onStreamStart: (requestId) => {
          requestIdRef.current = requestId;
        },
        onStreamEvent: (event) => {
          const parsed = parseIllustrateEvent(
            (event as { data?: unknown }).data,
          );
          if (!parsed) return;
          if (parsed.kind === "refused") refused = true;
          if (
            parsed.kind === "set_image_progress" &&
            parsed.status === "completed" &&
            parsed.result?.attached
          ) {
            attached += 1;
          }
          setRun((prev) => reduceIllustrateRun(prev, parsed));
        },
      }),
    );
    abortRef.current = null;
    const stopped = stopRequestedRef.current;
    if (res.error && !stopped) {
      setRun((prev) => ({
        ...prev,
        phase: "error",
        message: res.error?.message ?? "The illustration run failed.",
      }));
      return { attached: 0, refused: false, failed: true, stopped: false };
    }
    if (refused) return { attached: 0, refused: true, failed: false, stopped: false };
    setRun((prev) => ({
      ...prev,
      phase: stopped ? "stopped" : "done",
      // The card in hand when Stop landed was cancelled with the stream.
      cards: stopped
        ? prev.cards.map((c) =>
            c.status === "running" ? { ...c, status: "waiting" as const } : c,
          )
        : prev.cards,
      attachedCount: attached,
    }));
    return { attached, refused: false, failed: false, stopped };
  };

  /** Stop the run now: the stream is cut and nothing more is sourced. */
  const stop = () => {
    const controller = abortRef.current;
    if (!controller || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setRun((prev) => ({ ...prev, phase: "stopping" }));
    const requestId = requestIdRef.current;
    if (requestId) {
      void dispatch(
        callApi({
          path: "/ai/cancel/{request_id}",
          method: "POST",
          pathParams: { request_id: requestId },
        }),
      );
    }
    controller.abort();
  };

  /** Record the human's keep/reject verdict on one card's row. */
  const setReview = (cardId: string, review: "accepted" | "rejected") =>
    setRun((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.cardId === cardId ? { ...c, review } : c,
      ),
    }));

  const reset = () => setRun(IDLE_RUN);

  return { run, start, stop, setReview, reset };
}
