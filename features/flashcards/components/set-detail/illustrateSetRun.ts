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
// System-of-record: common-docs/systems/education/flashcard-images/VISION_AND_PLAN.md.

import { useState } from "react";

import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { LiveRunProgressState } from "@/features/agents/components/live-run/LiveRunProgress";

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
  phase: "idle" | "starting" | "running" | "done" | "refused" | "error";
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
    case "set_image_plan":
      return {
        ...state,
        phase: "running",
        skippedExisting: event.skippedExisting,
        trimmedByLimit: event.trimmedByLimit,
        cards: event.cards.map((c) => ({
          cardId: c.cardId,
          label: c.label,
          status: "waiting" as const,
        })),
      };
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

/** The run's rows in the canonical live-run progress shape. */
export function toProgressState(
  state: IllustrateRunState,
  setName: string,
): LiveRunProgressState {
  const noun = state.face === "front" ? "front" : "back";
  return {
    title: `Illustrating ${setName}`,
    description:
      state.cards.length === 0
        ? "Finding expert images on the open web…"
        : `An agent searches the open web for each card's ${noun}, judges the source, and attaches only what clears the bar.`,
    items: state.cards.map((card) => ({
      id: card.cardId,
      label: card.label,
      status: card.status,
      ...(card.status === "completed"
        ? {
            detail: card.result?.attached
              ? `Attached from ${card.result.candidate?.domain || "the web"}`
              : `No image attached — ${card.result?.refusal_reason || "nothing cleared the bar"}`,
          }
        : {}),
      ...(card.status === "failed"
        ? { detail: card.error || "Sourcing failed for this card" }
        : {}),
      ...(card.result?.judgment?.reasoning
        ? { preview: card.result.judgment.reasoning }
        : {}),
    })),
  };
}

/**
 * Drive one set-illustration run. State lives here (the page owns it) so the
 * floating window can render both the live progress and the review pass from
 * one source of truth.
 */
export function useIllustrateSetRun() {
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<IllustrateRunState>(IDLE_RUN);

  const start = async (setId: string, face: IllustrateFace) => {
    setRun({ ...IDLE_RUN, phase: "starting", face });
    let refused = false;
    // Counted here (not read back out of state) so the caller's success branch
    // never races React's updater queue.
    let attached = 0;
    const res = await dispatch(
      callApi({
        path: "/education/images/source-set",
        method: "POST",
        body: { set_id: setId, face, skip_existing: true },
        stream: true,
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
    if (res.error) {
      setRun((prev) => ({
        ...prev,
        phase: "error",
        message: res.error?.message ?? "The illustration run failed.",
      }));
      return { attached: 0, refused: false, failed: true };
    }
    if (refused) return { attached: 0, refused: true, failed: false };
    setRun((prev) => ({ ...prev, phase: "done", attachedCount: attached }));
    return { attached, refused: false, failed: false };
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

  return { run, start, setReview, reset };
}
