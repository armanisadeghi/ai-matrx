// features/education/study/planner/goalStats.ts
//
// The planner's goal-progress derivation, extracted from StudyPlanner.tsx so
// the GOALS list and the `matrx-user/education-planner` surface scope builder
// derive identical numbers from identical inputs. Everything here is DERIVED
// OUTPUT — mastery, struggle counts, urgency ranking. None of it is ever an
// agent write target: an agent that could write a mastery percentage would be
// forging the evidence the planner exists to compute.
//
// Targeting rides in `study_goal.metadata` (itemType/topic) rather than
// dedicated columns — see `StudyGoalMetadata` in ../types.

import { displayMasteryPct } from "../utils/masteryFsrs";
import type { ItemMasteryRow, StudyGoalRow } from "../types";

const MS_PER_DAY = 86_400_000;

export interface GoalStat {
  /** How many mastery rows this goal's targeting matched. */
  matched: number;
  /** Mean display mastery across matched items, 0-100. Null when none matched. */
  avgMasteryPct: number | null;
  /** Matched items flagged struggling (explicit flag, or mastery under 40%). */
  struggling: number;
}

/** Whole days from now until `targetDate`; null when the goal has no date. */
export function daysUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate).getTime();
  return Math.ceil((target - Date.now()) / MS_PER_DAY);
}

export function dueLabel(
  targetDate: string | null,
): { text: string; overdue: boolean } | null {
  const days = daysUntil(targetDate);
  if (days === null) return null;
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  return { text: `${days}d left`, overdue: false };
}

/** V1 heuristic: earlier target dates and higher struggle counts rank first. */
export function priorityScore(
  goal: StudyGoalRow,
  stat: GoalStat | undefined,
): number {
  const days = daysUntil(goal.target_date);
  const urgency = days === null ? 0 : Math.max(0, 60 - days);
  return urgency + (stat?.struggling ?? 0) * 5;
}

/** Goals ordered the way the planner list renders them (most urgent first). */
export function rankGoals(
  goals: StudyGoalRow[],
  stats: Record<string, GoalStat>,
): StudyGoalRow[] {
  return goals
    .slice()
    .sort(
      (a, b) => priorityScore(b, stats[b.id]) - priorityScore(a, stats[a.id]),
    );
}

/**
 * Join each goal's `metadata` targeting to the learner's `item_mastery` rows
 * and roll up matched / average mastery / struggling counts. The flashcards
 * topic lookup is dynamically imported so this stays mode-agnostic study-spine
 * infrastructure.
 */
export async function resolveGoalStats(
  goals: StudyGoalRow[],
  mastery: ItemMasteryRow[],
): Promise<Record<string, GoalStat>> {
  const now = new Date();
  const withTopic = goals.filter((g) => {
    const meta = g.metadata as { itemType?: string; topic?: string } | null;
    return meta?.itemType === "fc_card" && meta.topic;
  });
  let topicsById: Record<string, string | null> = {};
  if (withTopic.length > 0 && mastery.length > 0) {
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getTopicsForCardIds(
      mastery.map((m) => m.item_id),
    );
    topicsById = res.data ?? {};
  }

  const stats: Record<string, GoalStat> = {};
  for (const goal of goals) {
    const meta = goal.metadata as { itemType?: string; topic?: string } | null;
    const relevant =
      meta?.itemType && meta.topic
        ? mastery.filter((m) => topicsById[m.item_id]?.trim() === meta.topic)
        : meta?.itemType
          ? mastery
          : [];
    if (relevant.length === 0) {
      stats[goal.id] = { matched: 0, avgMasteryPct: null, struggling: 0 };
      continue;
    }
    let sum = 0;
    let struggling = 0;
    for (const m of relevant) {
      const pct = displayMasteryPct(m, now) ?? 0;
      sum += pct;
      if (m.struggle_flag || pct < 0.4) struggling += 1;
    }
    stats[goal.id] = {
      matched: relevant.length,
      avgMasteryPct: Math.round((sum / relevant.length) * 100),
      struggling,
    };
  }
  return stats;
}
