// features/education/engage/data/finalizeGame.ts
//
// The shared "round is over" side-effect. Postgres owns every competitive
// value: the client supplies only the owned study-session id and display name.

"use client";

import { gameService } from "./gameService";
import { BADGES, type BadgeKey } from "../engine/badges";
import type { GameOutcome } from "../types";
import type { Json } from "@/types/database.types";

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

  const finalized = await gameService.finalizeResult(
    outcome.sessionId,
    displayName,
  );
  if (!finalized.data) {
    return {
      newBadges: [],
      officialOutcome: null,
      error: finalized.error ?? "The result authority returned no result.",
    };
  }
  const row = finalized.data;
  const newBadges = readAwardedBadges(row.metadata);

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

function readAwardedBadges(metadata: Json): BadgeKey[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const value = "new_badges" in metadata ? metadata.new_badges : undefined;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (key): key is BadgeKey => typeof key === "string" && key in BADGES,
  );
}
