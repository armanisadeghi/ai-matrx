// features/flashcards/data/useLocalFlashcardStudy.ts
//
// The ON-DEVICE study driver for a public deck — the guest twin of
// useFlashcardStudy. It feeds the shared <StudyDeck/> the exact same props
// (cards, currentIndex, flip/next/grade, progress…) but keeps progress in this
// browser's localStorage, keyed by set id and mode, instead of the per-user
// study spine. Studying is never gated: no account, no session, no writes.
//
// Why a second driver and not a flag on useFlashcardStudy: that hook's every
// step is a per-user server call (getSetWithCards under RLS, getMasteryBulk,
// createSession, recordAttempt filed under the CARD's organization). A visitor
// on a public page owns none of that, and a signed-in visitor's attempts would
// be filed into the deck owner's organization — so everyone on the public lanes
// studies on the device; "Save a copy" is the path to account-tracked mastery.
// The Learn-mode queue step is shared (requeueAfterGrade), never re-derived.
//
// Storage is a per-viewer convenience: every read/write is try/catch'd and a
// blocked/private store simply studies without remembering.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import type { CardWithDetails } from "./types";
import type { ReviewResult } from "../types";
import { shuffleItems } from "./roundSize";
import { requeueAfterGrade, type FlashcardStudyProgress } from "./useFlashcardStudy";

export type LocalStudyMode = "study" | "learn";

const STORAGE_PREFIX = "matrx:fc-device-study:v1";

interface StoredProgress {
  /** Working order of card ids (Learn: the shrinking queue). */
  order: string[];
  currentIndex: number;
  results: Record<string, ReviewResult>;
  mastered: string[];
  /** Cards in the pass when it started (Learn's stable denominator). */
  total: number;
  updatedAt: string;
}

function storageKey(setId: string, mode: LocalStudyMode): string {
  return `${STORAGE_PREFIX}:${setId}:${mode}`;
}

function isResult(v: unknown): v is ReviewResult {
  return v === "correct" || v === "partial" || v === "incorrect";
}

function readStored(setId: string, mode: LocalStudyMode): StoredProgress | null {
  try {
    const raw = window.localStorage.getItem(storageKey(setId, mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    if (!Array.isArray(parsed.order)) return null;
    const results: Record<string, ReviewResult> = {};
    for (const [id, r] of Object.entries(parsed.results ?? {})) {
      if (isResult(r)) results[id] = r;
    }
    return {
      order: parsed.order.filter((id): id is string => typeof id === "string"),
      currentIndex: typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0,
      results,
      mastered: Array.isArray(parsed.mastered)
        ? parsed.mastered.filter((id): id is string => typeof id === "string")
        : [],
      total: typeof parsed.total === "number" ? parsed.total : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return null;
  }
}

function writeStored(setId: string, mode: LocalStudyMode, value: StoredProgress | null) {
  try {
    if (value) {
      window.localStorage.setItem(storageKey(setId, mode), JSON.stringify(value));
    } else {
      window.localStorage.removeItem(storageKey(setId, mode));
    }
  } catch {
    // Blocked / private storage: the sitting still works, it just isn't kept.
  }
}

/** What the deck page shows before a sitting opens ("12 of 40 · Resume"). */
export interface DeviceProgressSummary {
  mode: LocalStudyMode;
  done: number;
  total: number;
  correct: number;
  updatedAt: string;
}

/** Read a deck's saved on-device progress (both modes, newest first). */
export function readDeviceProgress(
  setId: string,
  cardIds: readonly string[],
): DeviceProgressSummary[] {
  if (typeof window === "undefined") return [];
  const known = new Set(cardIds);
  const out: DeviceProgressSummary[] = [];
  for (const mode of ["study", "learn"] as const) {
    const stored = readStored(setId, mode);
    if (!stored) continue;
    const graded = Object.keys(stored.results).filter((id) => known.has(id));
    const done =
      mode === "learn"
        ? stored.mastered.filter((id) => known.has(id)).length
        : graded.length;
    if (done === 0) continue;
    out.push({
      mode,
      done,
      total: mode === "learn" ? Math.max(stored.total, done) : known.size,
      correct:
        mode === "learn"
          ? done
          : graded.filter((id) => stored.results[id] === "correct").length,
      updatedAt: stored.updatedAt,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Forget a deck's on-device progress (one mode, or both). */
export function clearDeviceProgress(setId: string, mode?: LocalStudyMode): void {
  if (typeof window === "undefined") return;
  if (mode !== "learn") writeStored(setId, "study", null);
  if (mode !== "study") writeStored(setId, "learn", null);
}

function freshProgress(cards: readonly CardWithDetails[]): StoredProgress {
  const ids = cards.map((c) => c.id);
  return {
    order: ids,
    currentIndex: 0,
    results: {},
    mastered: [],
    total: ids.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Saved progress reconciled with the deck as it is now (cards added/removed). */
function restore(
  setId: string,
  mode: LocalStudyMode,
  cards: readonly CardWithDetails[],
): StoredProgress {
  const stored = typeof window === "undefined" ? null : readStored(setId, mode);
  if (!stored) return freshProgress(cards);
  const byId = new Set(cards.map((c) => c.id));
  const mastered = stored.mastered.filter((id) => byId.has(id));
  const order = stored.order.filter((id) => byId.has(id));
  const seen = new Set([...order, ...mastered]);
  const added = cards.map((c) => c.id).filter((id) => !seen.has(id));
  const results: Record<string, ReviewResult> = {};
  for (const [id, r] of Object.entries(stored.results)) {
    if (byId.has(id)) results[id] = r;
  }
  // New cards join the end of the pass (Learn: the end of the queue).
  const nextOrder = [...order, ...added];
  return {
    ...stored,
    order: nextOrder,
    mastered,
    results,
    total: mode === "learn" ? Math.max(stored.total, mastered.length + nextOrder.length) : cards.length,
    currentIndex: Math.min(Math.max(0, stored.currentIndex), Math.max(0, nextOrder.length - 1)),
  };
}

export interface UseLocalFlashcardStudyOptions {
  setId: string;
  cards: readonly CardWithDetails[];
  mode: LocalStudyMode;
}

export function useLocalFlashcardStudy({
  setId,
  cards: deck,
  mode,
}: UseLocalFlashcardStudyOptions) {
  // The driver mounts client-only (ssr:false), so the saved pass is read in
  // the initializer — no empty first frame, no hydration mismatch.
  const [state, setState] = useState<StoredProgress>(() =>
    restore(setId, mode, deck),
  );
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    writeStored(setId, mode, state);
  }, [setId, mode, state]);

  const byId = new Map(deck.map((c) => [c.id, c]));
  const cards = state.order
    .map((id) => byId.get(id))
    .filter((c): c is CardWithDetails => c !== undefined);
  const currentIndex = Math.min(state.currentIndex, Math.max(0, cards.length - 1));

  const clamp = (i: number) => Math.min(Math.max(0, i), Math.max(0, cards.length - 1));
  const touch = (next: Partial<StoredProgress>) =>
    setState((prev) => ({ ...prev, ...next, updatedAt: new Date().toISOString() }));

  const goTo = (index: number) => {
    touch({ currentIndex: clamp(index) });
    setIsFlipped(false);
  };

  const grade = (result: ReviewResult): void => {
    const card = cards[currentIndex];
    if (!card) return;
    setIsFlipped(false);
    setState((prev) => {
      const results = { ...prev.results, [card.id]: result };
      const updatedAt = new Date().toISOString();
      if (mode === "learn") {
        const order = requeueAfterGrade(prev.order.map((id) => ({ id })), { id: card.id }, result).map(
          (c) => c.id,
        );
        const mastered =
          result === "correct" && !prev.mastered.includes(card.id)
            ? [...prev.mastered, card.id]
            : prev.mastered;
        // The index stays put: the next card has shifted into this slot.
        return {
          ...prev,
          order,
          mastered,
          results,
          currentIndex: Math.min(prev.currentIndex, Math.max(0, order.length - 1)),
          updatedAt,
        };
      }
      return {
        ...prev,
        results,
        currentIndex: Math.min(prev.currentIndex + 1, Math.max(0, prev.order.length - 1)),
        updatedAt,
      };
    });
  };

  /** A new pass over the whole deck, in set order. */
  const restart = () => {
    setIsFlipped(false);
    setState(freshProgress(deck));
  };

  /**
   * Deal the pass in a random order without losing a grade: results are kept
   * by card, and the sitting continues at the first card not yet graded.
   */
  const reshuffle = () => {
    setIsFlipped(false);
    setState((prev) => {
      const order = shuffleItems(prev.order);
      const firstOpen =
        mode === "learn" ? 0 : order.findIndex((id) => prev.results[id] === undefined);
      return {
        ...prev,
        order,
        currentIndex: Math.max(0, firstOpen),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const gradedIds = Object.keys(state.results);
  const progress: FlashcardStudyProgress =
    mode === "learn"
      ? { done: state.mastered.length, total: state.total, correct: state.mastered.length }
      : {
          done: gradedIds.length,
          total: cards.length,
          correct: gradedIds.filter((id) => state.results[id] === "correct").length,
        };

  return {
    cards,
    currentIndex,
    isFlipped,
    resultsByCard: state.results as Record<string, ReviewResult | undefined>,
    progress,
    flip: () => setIsFlipped((f) => !f),
    next: () => goTo(currentIndex + 1),
    prev: () => goTo(currentIndex - 1),
    goTo,
    grade,
    restart,
    reshuffle,
  };
}
