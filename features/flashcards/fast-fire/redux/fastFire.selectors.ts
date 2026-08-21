// features/flashcards/fast-fire/redux/fastFire.selectors.ts
//
// Selectors for the FastFire slice. Every derived array/object is wrapped in
// createSelector; primitives are returned directly (stable by value). Per the
// project rule, every property gets its own selector and derivations live in the
// result function, never inline `?? []` in the output.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  AdaptationState,
  AdvanceReason,
  CardGrade,
  DrillCard,
  FastFirePhase,
  FastFireConfig,
  ReviewFilter,
} from "./fastFireSlice";

const EMPTY_CARDS: DrillCard[] = [];

// ─── Base ─────────────────────────────────────────────────────────────────────
export const selectFastFirePhase = (state: RootState): FastFirePhase =>
  state.fastFire.phase;

export const selectFastFireConfig = (state: RootState): FastFireConfig =>
  state.fastFire.config;

export const selectFastFireCards = (state: RootState): DrillCard[] =>
  state.fastFire.cards.length > 0 ? state.fastFire.cards : EMPTY_CARDS;

export const selectFastFireCurrentIndex = (state: RootState): number =>
  state.fastFire.currentIndex;

/** Why the current card advanced — drives the TIME'S UP hold (timeout) vs a
 *  quick, alarm-free transition (skip). Null outside the `advancing` beat. */
export const selectFastFireAdvanceReason = (
  state: RootState,
): AdvanceReason | null => state.fastFire.lastAdvanceReason;

export const selectFastFireSessionId = (state: RootState): string | null =>
  state.fastFire.sessionId;

export const selectFastFireSessionAudioFileId = (
  state: RootState,
): string | null => state.fastFire.sessionAudioFileId;

export const selectFastFireSessionReview = (state: RootState): string | null =>
  state.fastFire.sessionReview;

export const selectFastFireError = (state: RootState): string | null =>
  state.fastFire.error;

/** VISION §3 — the live-adaptation receipt (null until the first reorder). */
export const selectFastFireAdaptation = (
  state: RootState,
): AdaptationState | null => state.fastFire.adaptation;

// ─── Current card ───────────────────────────────────────────────────────────
export const selectFastFireCurrentCard = (
  state: RootState,
): DrillCard | null => {
  const { cards, currentIndex } = state.fastFire;
  if (currentIndex < 0 || currentIndex >= cards.length) return null;
  return cards[currentIndex];
};

// ─── Grades ─────────────────────────────────────────────────────────────────
export const selectGradesByCard = (
  state: RootState,
): Record<string, CardGrade> => state.fastFire.gradesByCard;

/** One card's grade record (live + scoreboard rendering). */
export const selectCardGrade =
  (cardId: string) =>
  (state: RootState): CardGrade | undefined =>
    state.fastFire.gradesByCard[cardId];

/** All grades in the drill's card order. Memoized. */
export const selectGradesInOrder = createSelector(
  selectFastFireCards,
  selectGradesByCard,
  (cards, byCard): CardGrade[] =>
    cards.map((c) => byCard[c.id]).filter((g): g is CardGrade => g != null),
);

/** How many grades are still in-flight ("processing N in background…"). */
export const selectPendingGradeCount = createSelector(
  selectGradesByCard,
  (byCard): number =>
    Object.values(byCard).filter((g) => g.status === "pending").length,
);

/** The live scoreboard rollup. Memoized. */
export interface FastFireScoreboard {
  graded: number;
  correct: number;
  partial: number;
  incorrect: number;
  total: number;
  /** Accuracy over graded cards (0..100), or null when nothing is graded yet. */
  accuracyPct: number | null;
  /** Average normalized score over graded cards (0..100), or null. */
  avgScorePct: number | null;
}

export const selectFastFireScoreboard = createSelector(
  selectFastFireCards,
  selectGradesByCard,
  (cards, byCard): FastFireScoreboard => {
    let correct = 0;
    let partial = 0;
    let incorrect = 0;
    let graded = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const c of cards) {
      const g = byCard[c.id];
      if (!g || g.status !== "resolved" || g.result === null) continue;
      graded += 1;
      if (g.result === "correct") correct += 1;
      else if (g.result === "partial") partial += 1;
      else incorrect += 1;
      if (g.score !== null) {
        scoreSum += g.score;
        scoreCount += 1;
      }
    }
    return {
      graded,
      correct,
      partial,
      incorrect,
      total: cards.length,
      accuracyPct: graded > 0 ? Math.round((correct / graded) * 100) : null,
      avgScorePct: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) : null,
    };
  },
);

// ─── Review playback (audioPlayer is STATE) ───────────────────────────────────
export const selectPlayingCardId = (state: RootState): string | null =>
  state.fastFire.audioPlayer.playingCardId;

export const selectReviewFilter = (state: RootState): ReviewFilter =>
  state.fastFire.audioPlayer.filter;

/** The cards (+ grades) the current review filter is showing. Memoized. */
export interface ReviewRow {
  card: DrillCard;
  grade: CardGrade | undefined;
}

/** "Review Best" size (spec 26b) — enough to feel like a highlight reel,
 *  short enough to replay in a minute. Product constant, not a quota. */
const BEST_COUNT = 5;

export const selectReviewRows = createSelector(
  selectFastFireCards,
  selectGradesByCard,
  selectReviewFilter,
  (cards, byCard, filter): ReviewRow[] => {
    const rows = cards.map((card) => ({ card, grade: byCard[card.id] }));
    if (filter === "all") return rows;
    if (filter === "best") {
      // The learner's strongest ANSWERS — needs a rank, not a predicate:
      // top-scored resolved answers that actually have a clip to replay.
      return rows
        .filter(
          (r) => r.grade?.score != null && !!r.grade.responseAudioFileId,
        )
        .sort((a, b) => (b.grade?.score ?? 0) - (a.grade?.score ?? 0))
        .slice(0, BEST_COUNT);
    }
    return rows.filter((r) => {
      const result = r.grade?.result;
      if (filter === "correct") return result === "correct";
      return result === "incorrect" || result === "partial";
    });
  },
);
