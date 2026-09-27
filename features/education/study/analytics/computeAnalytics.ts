// features/education/study/analytics/computeAnalytics.ts
//
// Pure cross-mode aggregation over the study spine — the analytics engine P5's
// unified dashboard renders and the narrator agent describes. No I/O: the hook
// (`useStudyAnalytics`) fetches; this folds. Mode-agnostic — every item_type in
// item_mastery is bucketed, so the dashboard grows richer as P1–P4 land without
// a rewrite here.

import { displayMasteryPct } from "../utils/masteryFsrs";
import {
  lastAttemptAtBySession,
  sessionStudyMs,
} from "../utils/sessionStudyTime";
import type {
  ItemMasteryRow,
  StudyAttemptRow,
  StudySessionRow,
} from "../types";

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Human labels for known item types; unknown types titleize their token. */
/**
 * Student-facing names for the study spine's REAL `item_mastery.item_type`
 * values (verified live). `quiz_question` / `practice_test_item` were listed
 * here but have never been written by the spine, so every assessment item fell
 * through to the auto-title-caser and a learner's progress read "Assessment
 * Item" instead of "Quiz & test questions".
 *   select distinct item_type from education.item_mastery;
 */
const ITEM_TYPE_LABELS: Record<string, string> = {
  fc_card: "Flashcards",
  assessment_item: "Quiz & test questions",
  spoken_prompt: "Spoken practice",
  handwritten_work: "Graded work",
};

export function itemTypeLabel(itemType: string): string {
  return (
    ITEM_TYPE_LABELS[itemType] ??
    itemType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export interface OverallStats {
  studied: number;
  mastered: number;
  learning: number;
  struggling: number;
  dueNow: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number | null;
  bestStreak: number;
}

export interface ModeStat extends OverallStats {
  itemType: string;
  label: string;
}

export interface TopicStat {
  topic: string;
  count: number;
  masteryPct: number;
  struggling: number;
  /** Cards in the topic with at least one recorded answer (0 = not studied yet). */
  answered?: number;
}

export interface AccuracyTrend {
  direction: "improving" | "flat" | "declining";
  recentPct: number;
  priorPct: number;
  weeks: number;
}

export interface StudyAnalytics {
  overall: OverallStats;
  byMode: ModeStat[];
  /** Per-topic breakdown for the topic-bearing mode (fc_card), weakest first. */
  weakTopics: TopicStat[];
  totalMinutes: number;
  sessions: number;
  /** Current daily study streak (from study_streak), distinct from per-item streaks. */
  currentStreak: number;
  trend: AccuracyTrend | null;
  hasData: boolean;
}

function emptyStats(): OverallStats {
  return {
    studied: 0,
    mastered: 0,
    learning: 0,
    struggling: 0,
    dueNow: 0,
    totalAttempts: 0,
    correctAttempts: 0,
    accuracyPct: null,
    bestStreak: 0,
  };
}

/**
 * THE one "needs work" rule: flagged struggling, or live (decayed) mastery
 * under 40%. The dashboard's counts, the topic list and the weak-area drill all
 * read it, so a button never opens a different set than the number beside it.
 */
export function needsWork(m: ItemMasteryRow, now: Date): boolean {
  return Boolean(m.struggle_flag) || (displayMasteryPct(m, now) ?? 0) < 0.4;
}

function accumulate(stats: OverallStats, m: ItemMasteryRow, now: Date): void {
  const score = displayMasteryPct(m, now) ?? 0;
  stats.studied += 1;
  if (needsWork(m, now)) stats.struggling += 1;
  else if (score >= 0.8) stats.mastered += 1;
  else stats.learning += 1;
  if (m.due_at && new Date(m.due_at).getTime() <= now.getTime()) {
    stats.dueNow += 1;
  }
  stats.totalAttempts += m.attempt_count ?? 0;
  stats.correctAttempts += m.correct_count ?? 0;
  if ((m.streak ?? 0) > stats.bestStreak) stats.bestStreak = m.streak ?? 0;
}

function finalizeAccuracy(stats: OverallStats): void {
  stats.accuracyPct =
    stats.totalAttempts > 0
      ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100)
      : null;
}

/** Recent-half vs prior-half accuracy over the last `weeks` weeks of attempts. */
function computeTrend(
  attempts: StudyAttemptRow[],
  now: Date,
  weeks = 4,
): AccuracyTrend | null {
  const windowStart = now.getTime() - weeks * MS_PER_WEEK;
  const midpoint = now.getTime() - (weeks / 2) * MS_PER_WEEK;
  let recentTotal = 0;
  let recentCorrect = 0;
  let priorTotal = 0;
  let priorCorrect = 0;
  for (const a of attempts) {
    if (!a.result) continue;
    const t = new Date(a.created_at).getTime();
    if (t < windowStart) continue;
    const correct = a.result === "correct" ? 1 : 0;
    if (t >= midpoint) {
      recentTotal += 1;
      recentCorrect += correct;
    } else {
      priorTotal += 1;
      priorCorrect += correct;
    }
  }
  if (recentTotal < 3 || priorTotal < 3) return null;
  const recentPct = Math.round((recentCorrect / recentTotal) * 100);
  const priorPct = Math.round((priorCorrect / priorTotal) * 100);
  const diff = recentPct - priorPct;
  const direction: AccuracyTrend["direction"] =
    diff >= 5 ? "improving" : diff <= -5 ? "declining" : "flat";
  return { direction, recentPct, priorPct, weeks };
}

export interface ComputeInputs {
  mastery: ItemMasteryRow[];
  attempts: StudyAttemptRow[];
  sessions: StudySessionRow[];
  /** Current daily streak from study_streak (not a per-item streak). */
  currentStreak?: number;
  /** fc_card item_id → topic (for the weak-topic breakdown). */
  topicsById?: Record<string, string | null>;
}

export function computeAnalytics(
  inputs: ComputeInputs,
  now: Date,
): StudyAnalytics {
  const { mastery, attempts, sessions, topicsById } = inputs;
  const overall = emptyStats();
  const byModeMap = new Map<string, ModeStat>();

  for (const m of mastery) {
    accumulate(overall, m, now);
    let mode = byModeMap.get(m.item_type);
    if (!mode) {
      mode = {
        ...emptyStats(),
        itemType: m.item_type,
        label: itemTypeLabel(m.item_type),
      };
      byModeMap.set(m.item_type, mode);
    }
    accumulate(mode, m, now);
  }

  finalizeAccuracy(overall);
  const byMode = Array.from(byModeMap.values());
  for (const mode of byMode) finalizeAccuracy(mode);
  byMode.sort((a, b) => b.studied - a.studied);

  // Per-topic weak breakdown (fc_card): reuse the topic map when provided.
  const weakTopics: TopicStat[] = [];
  if (topicsById) {
    const byTopic = new Map<
      string,
      { sum: number; count: number; struggling: number; answered: number }
    >();
    for (const m of mastery) {
      if (m.item_type !== "fc_card") continue;
      const topic = topicsById[m.item_id]?.trim();
      if (!topic) continue;
      const pct = displayMasteryPct(m, now) ?? 0;
      const agg =
        byTopic.get(topic) ?? { sum: 0, count: 0, struggling: 0, answered: 0 };
      agg.sum += pct;
      agg.count += 1;
      if ((m.attempt_count ?? 0) > 0) agg.answered += 1;
      if (needsWork(m, now)) agg.struggling += 1;
      byTopic.set(topic, agg);
    }
    for (const [topic, agg] of byTopic) {
      weakTopics.push({
        topic,
        count: agg.count,
        masteryPct: Math.round((agg.sum / agg.count) * 100),
        struggling: agg.struggling,
        answered: agg.answered,
      });
    }
    weakTopics.sort((a, b) => a.masteryPct - b.masteryPct);
  }

  // Time actually studied — never an abandoned session's wall-clock span
  // (see utils/sessionStudyTime.ts for the measured defect this replaces).
  const lastAttemptAt = lastAttemptAtBySession(attempts);
  let totalMinutes = 0;
  // A session counts only when something was studied in it — opening a review
  // and leaving creates a session with no answers, which is not a session.
  let studiedSessions = 0;
  for (const s of sessions) {
    const ms = sessionStudyMs(s, lastAttemptAt.get(s.id));
    totalMinutes += ms / 60_000;
    if (ms > 0) studiedSessions += 1;
  }

  return {
    overall,
    byMode,
    weakTopics,
    totalMinutes: Math.round(totalMinutes),
    sessions: studiedSessions,
    currentStreak: inputs.currentStreak ?? 0,
    trend: computeTrend(attempts, now),
    hasData: overall.studied > 0,
  };
}
