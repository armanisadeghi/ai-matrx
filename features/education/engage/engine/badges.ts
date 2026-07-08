// features/education/engage/engine/badges.ts
//
// PURE badge catalog + award rules. Badges reward OUTCOMES (mastery gained,
// items mastered, comeback wins, consistency) — NEVER vanity (hours logged,
// raw win count for its own sake). This is the "metrics headline outcomes over
// vanity" mandate encoded as data. Award evaluation is deterministic; the
// service persists the winners to education.game_badge (once per key/user).

import { Award, Flame, Rocket, Target, TrendingUp, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BadgeKey =
  | "first_game"
  | "mastery_10"
  | "mastery_50"
  | "comeback"
  | "streak_7"
  | "streak_30"
  | "perfect_round";

export interface BadgeDef {
  key: BadgeKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const BADGES: Record<BadgeKey, BadgeDef> = {
  first_game: {
    key: "first_game",
    label: "First Round",
    description: "Played your first study game.",
    icon: Sparkles,
  },
  mastery_10: {
    key: "mastery_10",
    label: "Ten Mastered",
    description: "Reached 10 items mastered across all study.",
    icon: Target,
  },
  mastery_50: {
    key: "mastery_50",
    label: "Fifty Mastered",
    description: "Reached 50 items mastered — real, durable learning.",
    icon: TrendingUp,
  },
  comeback: {
    key: "comeback",
    label: "Comeback",
    description: "Finished a multiplayer game strong after trailing.",
    icon: Rocket,
  },
  streak_7: {
    key: "streak_7",
    label: "Seven-Day Habit",
    description: "Studied 7 days in a row (rest days count).",
    icon: Flame,
  },
  streak_30: {
    key: "streak_30",
    label: "Thirty-Day Habit",
    description: "Kept a healthy 30-day study habit.",
    icon: Award,
  },
  perfect_round: {
    key: "perfect_round",
    label: "Flawless",
    description: "Answered every question correctly in a round.",
    icon: Award,
  },
};

export const BADGE_LIST: BadgeDef[] = Object.values(BADGES);

/** Signals the award evaluator reads (all outcome-based). */
export interface BadgeSignals {
  gamesPlayed: number;
  itemsMastered: number;
  currentStreak: number;
  /** This round: was it a multiplayer comeback (trailed then finished top-half)? */
  wasComeback: boolean;
  /** This round: every answered question correct AND at least a few answered. */
  perfectRound: boolean;
}

/**
 * The set of badge keys the signals QUALIFY for. The caller diffs this against
 * already-earned keys and persists only the newly-earned ones (idempotent).
 */
export function qualifyingBadges(s: BadgeSignals): BadgeKey[] {
  const earned: BadgeKey[] = [];
  if (s.gamesPlayed >= 1) earned.push("first_game");
  if (s.itemsMastered >= 10) earned.push("mastery_10");
  if (s.itemsMastered >= 50) earned.push("mastery_50");
  if (s.wasComeback) earned.push("comeback");
  if (s.currentStreak >= 7) earned.push("streak_7");
  if (s.currentStreak >= 30) earned.push("streak_30");
  if (s.perfectRound) earned.push("perfect_round");
  return earned;
}
