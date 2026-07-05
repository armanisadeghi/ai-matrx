// features/education/study/utils/sessionListDisplay.ts
//
// Display helpers for the sessions history list — set title, pace/card stats,
// attempt rollup, and coach score from persisted session rows.

import type { SessionAttemptSummary, StudySessionRow } from "../types";

const MODE_LABEL: Record<string, string> = {
  fast_fire: "Fast Fire",
  classic_review: "Study",
  flashcards: "Study",
  quiz: "Quiz",
  practice_test: "Practice Test",
  adaptive: "Adaptive",
};

export function sessionModeLabel(mode: string | null): string {
  if (!mode) return "Session";
  return MODE_LABEL[mode] ?? mode.replace(/_/g, " ");
}

export function readSessionSettings(settings: StudySessionRow["settings"]): {
  cardCount?: number;
  secondsPerCard?: number;
  liveScore?: boolean;
} {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const s = settings as Record<string, unknown>;
  return {
    cardCount: typeof s.card_count === "number" ? s.card_count : undefined,
    secondsPerCard:
      typeof s.seconds_per_card === "number" ? s.seconds_per_card : undefined,
    liveScore: typeof s.live_score === "boolean" ? s.live_score : undefined,
  };
}

export function readCoachScore(
  sessionReview: StudySessionRow["session_review"],
): number | null {
  if (
    !sessionReview ||
    typeof sessionReview !== "object" ||
    Array.isArray(sessionReview)
  ) {
    return null;
  }
  const score = (sessionReview as Record<string, unknown>).secondary_score;
  return typeof score === "number" ? Math.round(score) : null;
}

export function whenLabel(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * The single headline score for a session-list row — same priority as the
 * detail page's scorecard: the weighted score (partial credit counts) beats
 * strict accuracy, which beats nothing. Independent of the AI coach's score
 * (shown separately), which is a holistic judgment, not derived from this.
 */
export function sessionListScorePct(
  attempts: SessionAttemptSummary | undefined,
): number | null {
  if (!attempts || attempts.total === 0) return null;
  if (attempts.avgScorePct != null) return attempts.avgScorePct;
  const graded = attempts.correct + attempts.partial + attempts.incorrect;
  if (graded === 0) return null;
  return Math.round((attempts.correct / graded) * 100);
}

/** Primary + secondary lines for a session history row. */
export function buildSessionListLines(
  session: StudySessionRow,
  setName: string | undefined,
  attempts: SessionAttemptSummary | undefined,
  modeLabel: string,
): { title: string; detail: string; meta: string } {
  const title = setName?.trim() || "Unknown set";
  const settings = readSessionSettings(session.settings);
  const coachScore = readCoachScore(session.session_review);

  const configParts: string[] = [modeLabel];
  if (settings.cardCount != null)
    configParts.push(`${settings.cardCount} cards`);
  if (settings.secondsPerCard != null) {
    configParts.push(`${settings.secondsPerCard}s per card`);
  }

  const metaParts: string[] = [];
  const when = whenLabel(session.created_at);
  if (when) metaParts.push(when);

  if (attempts && attempts.total > 0) {
    metaParts.push(
      `${attempts.total} ${attempts.total === 1 ? "answer" : "answers"}`,
    );
  } else if (session.status === "active") {
    metaParts.push("No answers recorded yet");
  }

  if (coachScore != null) {
    metaParts.push(`${coachScore}% coach score`);
  }

  return {
    title,
    detail: configParts.join(" · "),
    meta: metaParts.join(" · "),
  };
}
