// features/education/study/planner/recovery.ts
//
// The "recovery plan after an absence" anti-burnout capability (P5) — the
// genuinely-new-vs-competitors piece. When a learner returns after missing
// planned days, we DON'T show a guilt wall of overdue items: we detect the
// absence, then rebuild the REMAINING plan with a gentle re-entry (a lighter
// first day, weak/high-value work first, low-value overdue items absorbed) by
// reusing the deterministic `buildPlan` load-smoother with `reentry: true`.
//
// Pure + injected-`now` so it's testable and never reaches for `Date.now()`.

import { buildPlan, type PlanSummary } from "./buildPlan";
import type { PlanDraft, PlanInput, PlanWithDays, Weekday } from "./types";

const MS_PER_DAY = 86_400_000;

/** How stale the session record has to be (days) to count as an absence on its own. */
export const ABSENCE_SESSION_GAP_DAYS = 3;
/** How many past study days must sit incomplete to count as an absence. */
export const ABSENCE_MISSED_DAYS = 2;

export interface AbsenceInfo {
  /** Past, non-rest days that still have ≥1 pending block. */
  missedStudyDays: number;
  /** Total pending blocks sitting on those past days (the "overdue backlog"). */
  overdueBlocks: number;
  /** Whole days since the learner's last study session (null if never / unknown). */
  daysSinceLastSession: number | null;
  /** Is there still runway to rebuild into (exam date today or later)? */
  hasRunway: boolean;
}

function todayIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Detect a return-after-absence against an active plan. Returns `null` when
 * there's nothing to recover from (on track, no runway, or a fresh plan).
 *
 * Two independent signals — either one (with runway) is an absence:
 *   1. Incomplete past blocks: planned study days now in the past, still pending.
 *   2. A session gap: no study session in ≥ ABSENCE_SESSION_GAP_DAYS days.
 */
export function detectAbsence(
  plan: PlanWithDays,
  lastSessionAt: Date | null,
  now: Date,
): AbsenceInfo | null {
  const today = todayIso(now);

  let missedStudyDays = 0;
  let overdueBlocks = 0;
  for (const { day, blocks } of plan.days) {
    if (day.is_rest_day) continue;
    if (day.day_date >= today) continue; // only the past counts as "missed"
    const pending = blocks.filter((b) => b.status === "pending");
    if (pending.length > 0) {
      missedStudyDays += 1;
      overdueBlocks += pending.length;
    }
  }

  const daysSinceLastSession = lastSessionAt
    ? Math.floor((now.getTime() - lastSessionAt.getTime()) / MS_PER_DAY)
    : null;

  const endDate = plan.plan.end_date ?? plan.plan.start_date;
  const hasRunway = !!endDate && endDate >= today;

  const missedEnough = missedStudyDays >= ABSENCE_MISSED_DAYS;
  // The session-gap signal only counts if the plan itself predates the gap —
  // otherwise a fresh (re)plan would immediately re-trigger "you've been away",
  // nagging a learner who just rebuilt their plan. Building the recovery plan
  // stamps `last_planned_at`, so this self-clears until they study or lapse again.
  const daysSincePlanned = plan.plan.last_planned_at
    ? Math.floor(
        (now.getTime() - new Date(plan.plan.last_planned_at).getTime()) /
          MS_PER_DAY,
      )
    : null;
  const goneEnough =
    daysSinceLastSession != null &&
    daysSinceLastSession >= ABSENCE_SESSION_GAP_DAYS &&
    (daysSincePlanned == null || daysSincePlanned >= ABSENCE_SESSION_GAP_DAYS);

  if (!hasRunway || (!missedEnough && !goneEnough)) return null;
  return { missedStudyDays, overdueBlocks, daysSinceLastSession, hasRunway };
}

/**
 * Rebuild the REMAINING plan as a gentle recovery plan. Deterministic on
 * purpose (no agent round-trip): the load-smoother reuses the plan's own
 * anti-burnout config (rest days, daily cap, minutes) but re-windows to
 * today→exam and eases the first days back in. `summary` is the LIVE study
 * snapshot — its due/weak counts already reflect the overdue backlog, so
 * `buildPlan` spreads that backlog across the window under the daily cap
 * instead of piling it on day one.
 */
export function buildRecoveryDraft(
  plan: PlanWithDays,
  summary: PlanSummary,
  now: Date,
): PlanDraft {
  const input: PlanInput = {
    title: plan.plan.title,
    startDate: todayIso(now),
    examDate: plan.plan.end_date ?? plan.plan.start_date,
    dailyMinutes: plan.plan.daily_minutes ?? 30,
    restDays: ((plan.plan.rest_days ?? []) as number[]).filter(
      (d): d is Weekday => d >= 0 && d <= 6,
    ),
    dailyItemCap: plan.plan.daily_item_cap ?? null,
    goalId: plan.plan.goal_id ?? null,
    itemType:
      (plan.plan.config as { itemType?: string } | null)?.itemType ?? "fc_card",
    reentry: true,
  };
  return buildPlan(input, summary, now);
}
