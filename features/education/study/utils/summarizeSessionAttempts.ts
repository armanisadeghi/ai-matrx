// features/education/study/utils/summarizeSessionAttempts.ts
//
// Pure client-side rollup over one session's attempt ledger — correct/partial/
// missed counts, accuracy, average score, best in-session streak, and duration.
// Mirrors the counting logic FastFire's Redux scoreboard already computes
// in-memory (`selectFastFireScoreboard`), generalized so any mode's session-detail
// view can derive the same numbers from `study_attempt` rows. `study_session
// .aggregate_score` is never written by any writer today, so nothing here reads
// it — recompute from the ledger, which is always current.

import type { StudyAttemptRow, StudySessionRow } from "../types";

export interface SessionSummary {
  total: number;
  graded: number;
  correct: number;
  partial: number;
  incorrect: number;
  /** Rounded 0-100, or null if nothing has been graded yet. */
  accuracyPct: number | null;
  /** Mean of `score_value` (0-1) across attempts that have one, as 0-100. */
  avgScorePct: number | null;
  /** Longest run of consecutive `correct` attempts, in ledger order. */
  bestStreak: number;
  /** ended_at - (started_at ?? created_at), when both ends are known. */
  durationMs: number | null;
}

export function summarizeSessionAttempts(
  attempts: StudyAttemptRow[],
  session?: Pick<StudySessionRow, "started_at" | "ended_at" | "created_at">,
): SessionSummary {
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  let streak = 0;
  let bestStreak = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const a of attempts) {
    if (a.result === "correct") {
      correct += 1;
      streak += 1;
      if (streak > bestStreak) bestStreak = streak;
    } else if (a.result === "partial") {
      partial += 1;
      streak = 0;
    } else if (a.result === "incorrect") {
      incorrect += 1;
      streak = 0;
    }
    if (a.score_value != null) {
      scoreSum += Number(a.score_value);
      scoreCount += 1;
    }
  }

  const graded = correct + partial + incorrect;

  let durationMs: number | null = null;
  const start = session?.started_at ?? session?.created_at;
  const end = session?.ended_at;
  if (start && end) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isFinite(ms) && ms >= 0) durationMs = ms;
  }

  return {
    total: attempts.length,
    graded,
    correct,
    partial,
    incorrect,
    accuracyPct: graded > 0 ? Math.round((correct / graded) * 100) : null,
    avgScorePct:
      scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) : null,
    bestStreak,
    durationMs,
  };
}

/** "1m 42s" / "48s" — compact duration for a scorecard, not a stopwatch. */
export function formatSessionDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
