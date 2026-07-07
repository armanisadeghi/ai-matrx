// features/education/engage/data/finalizeGame.ts
//
// The shared "round is over" side-effect: persist the result, evaluate + award
// OUTCOME badges, and (if opted in) add the round's mastery gain to the weekly
// league. Both solo and multiplayer call this from useGamePlay's onFinish, so
// the reward path is identical. Best-effort + never throws — a failed award
// never blocks the results screen.

"use client";

import { supabase } from "@/utils/supabase/client";
import { studyService } from "@/features/education/study/service/studyService";
import { displayMasteryPct } from "@/features/education/study/utils/masteryFsrs";
import { gameService } from "./gameService";
import { qualifyingBadges, type BadgeKey } from "../engine/badges";
import type { GameOutcome } from "../types";

const MASTERED_THRESHOLD = 0.9;

export interface FinalizeInput {
  outcome: GameOutcome;
  displayName: string;
  /** Multiplayer only: did this player trail then finish in the top half? */
  wasComeback?: boolean;
}

export interface FinalizeResult {
  newBadges: BadgeKey[];
}

export async function finalizeGame(
  input: FinalizeInput,
): Promise<FinalizeResult> {
  const { outcome, displayName, wasComeback = false } = input;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { newBadges: [] };

  // 1. Persist the result row.
  await gameService.saveResult(outcome, userId, displayName);

  // 2. League: add the mastery gain to the caller's standing (no-op if opted out).
  if (outcome.masteryGain > 0) {
    await gameService.addLeagueResult(outcome.masteryGain, displayName);
  }

  // 3. Evaluate outcome badges from live signals.
  const [masteryRes, streakRes, resultsRes] = await Promise.all([
    studyService.listAllMastery(3000),
    studyService.getStreak(),
    gameService.listMyResults(200),
  ]);
  const itemsMastered = (masteryRes.data ?? []).filter((m) => {
    const pct = displayMasteryPct(m);
    return pct != null && pct >= MASTERED_THRESHOLD;
  }).length;
  const currentStreak = streakRes.data?.current_streak ?? 0;
  const gamesPlayed = resultsRes.data?.length ?? 1;
  const perfectRound =
    outcome.answeredCount >= 5 && outcome.correctCount === outcome.answeredCount;

  const qualifies = qualifyingBadges({
    gamesPlayed,
    itemsMastered,
    currentStreak,
    wasComeback,
    perfectRound,
  });
  const awardRes = await gameService.awardBadges(qualifies, userId, {
    roomId: outcome.roomId,
    score: outcome.score,
  });

  return { newBadges: awardRes.data ?? [] };
}
