// features/education/engage/data/finalizeGame.ts
//
// The shared "round is over" side-effect. Postgres owns every competitive
// value: the client supplies only the owned study-session id and display name.

"use client";

import { gameService } from "./gameService";
import { BADGES, type BadgeKey } from "../engine/badges";
import type { GameOutcome } from "../types";

export interface FinalizeInput {
  outcome: GameOutcome;
  displayName: string;
}

export interface FinalizeResult {
  newBadges: BadgeKey[];
  officialOutcome: GameOutcome | null;
  error: string | null;
}

export async function finalizeGame(
  input: FinalizeInput,
): Promise<FinalizeResult> {
  const { outcome, displayName } = input;
  if (!outcome.sessionId) {
    return {
      newBadges: [],
      officialOutcome: null,
      error: "The game did not produce a study session to verify.",
    };
  }

  const before = await gameService.listMyBadges();
  const finalized = await gameService.finalizeResult(outcome.sessionId, displayName);
  if (!finalized.data) {
    return { newBadges: [], officialOutcome: null, error: finalized.error };
  }
  const after = await gameService.listMyBadges();
  const heldBefore = new Set((before.data ?? []).map((badge) => badge.badge_key));
  const newBadges = (after.data ?? [])
    .map((badge) => badge.badge_key)
    .filter((key): key is BadgeKey => key in BADGES && !heldBefore.has(key));
  const row = finalized.data;

  return {
    newBadges,
    error: null,
    officialOutcome: {
      roomId: row.room_id,
      sessionId: row.session_id,
      mode: row.mode === "multiplayer" ? "multiplayer" : "solo",
      score: row.score,
      correctCount: row.correct_count,
      answeredCount: row.answered_count,
      bestStreak: row.best_streak,
      masteryGain: Number(row.mastery_gain),
      currencyEarned: row.currency_earned,
      durationMs: row.duration_ms ?? 0,
      sourceKind: row.source_kind,
      sourceSetId: row.source_set_id,
      sourceTitle: row.source_title,
    },
  };
}
