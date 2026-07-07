// features/education/engage/engine/scoring.ts
//
// PURE scoring for the engagement game. No I/O, no Date, no randomness — every
// function is deterministic given its inputs, so the whole module is trivially
// unit-tested and identical solo vs multiplayer.
//
// The anti-Duolingo / anti-Kahoot stance is encoded HERE: score rewards
// CORRECTNESS + PERSONAL STREAK + (small) speed bonus — never raw speed-rank.
// A slow, correct learner out-scores a fast, wrong one. Mastery gain (the real
// outcome) is tracked separately and is what leagues/badges reward.

import type { PowerUp, PowerUpKey } from "../types";

/** Base points for a correct answer. Wrong answers score 0 (never negative — no shame). */
export const BASE_CORRECT_POINTS = 100;
/** Max speed bonus, decaying linearly to 0 across the question's time budget. */
export const MAX_SPEED_BONUS = 50;
/** Per-consecutive-correct streak bonus (caps so a hot streak can't run away). */
export const STREAK_BONUS_PER = 10;
export const STREAK_BONUS_CAP = 100;
/** Currency earned per correct answer (Gimkit model — buys power-ups). */
export const CURRENCY_PER_CORRECT = 25;

export interface ScoreInput {
  correct: boolean;
  /** Time taken to answer (ms). */
  latencyMs: number;
  /** The question's time budget (ms) — speed bonus decays across it. */
  budgetMs: number;
  /** Consecutive-correct streak AFTER this answer (0 if this answer was wrong). */
  streakAfter: number;
  /** Active multiplier from a power-up (e.g. 2 for double_points), default 1. */
  multiplier?: number;
}

export interface ScoreDelta {
  points: number;
  currency: number;
}

/**
 * Points + currency for one answer. Correctness-first: a wrong answer yields 0
 * points and 0 currency (no punishment, no negative). A correct answer yields
 * base + a decaying speed bonus + a capped streak bonus, times any power-up
 * multiplier.
 */
export function scoreAnswer(input: ScoreInput): ScoreDelta {
  if (!input.correct) return { points: 0, currency: 0 };
  const mult = input.multiplier ?? 1;
  const speedFrac = clamp01(1 - input.latencyMs / Math.max(1, input.budgetMs));
  const speedBonus = Math.round(MAX_SPEED_BONUS * speedFrac);
  const streakBonus = Math.min(
    STREAK_BONUS_CAP,
    Math.max(0, input.streakAfter - 1) * STREAK_BONUS_PER,
  );
  const points = Math.round((BASE_CORRECT_POINTS + speedBonus + streakBonus) * mult);
  return { points, currency: CURRENCY_PER_CORRECT };
}

/**
 * Comeback assist (keeps late/behind players in the match — Gimkit model).
 * Players whose score is far below the leader get a gentle currency top-up so
 * they can still afford power-ups. Never touches POINTS (that would be unfair);
 * only the discretionary currency economy.
 */
export function comebackCurrencyBonus(
  playerScore: number,
  leaderScore: number,
): number {
  if (leaderScore <= 0) return 0;
  const behindFrac = clamp01((leaderScore - playerScore) / leaderScore);
  // Up to +15 currency when very far behind, 0 when tied/ahead.
  return Math.round(15 * behindFrac);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ─── Power-ups (earn-to-upgrade) ─────────────────────────────────────────────
export const POWER_UPS: Record<PowerUpKey, PowerUp> = {
  double_points: {
    key: "double_points",
    label: "Double Points",
    description: "Your next correct answer scores 2×.",
    cost: 150,
  },
  fifty_fifty: {
    key: "fifty_fifty",
    label: "50 / 50",
    description: "Remove two wrong choices on the current question.",
    cost: 100,
  },
  shield: {
    key: "shield",
    label: "Streak Shield",
    description: "Your streak survives your next wrong answer.",
    cost: 200,
  },
};

export const POWER_UP_LIST: PowerUp[] = Object.values(POWER_UPS);

export function canAfford(currency: number, key: PowerUpKey): boolean {
  return currency >= POWER_UPS[key].cost;
}
