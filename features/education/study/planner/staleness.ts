// features/education/study/planner/staleness.ts
//
// Adaptive re-plan TRIGGER (P5). A plan is a living document, but re-planning
// out from under a learner without consent is jarring — and a re-plan reads a
// live snapshot that may be mid-session. So instead of a silent auto-re-plan we
// detect when real performance data has diverged materially from the snapshot
// the plan was built on, and surface a one-tap "your plan is stale — re-plan
// now" prompt. Honest, non-magical, and the learner stays in control.
//
// Compares the plan's stored `config.summary` (what it was generated from) to
// the LIVE study snapshot, gated on there being new performance data since the
// plan was last (re)planned — so a plan generated moments ago never reads stale.

import type { PlanSummary } from "./buildPlan";
import type { StudyPlanRow } from "./types";

/** A material jump in the weak backlog since planning. */
const WEAK_GROWTH_ABS = 3;
/** A material jump in the due backlog since planning. */
const DUE_GROWTH_ABS = 6;

export interface PlanStaleness {
  reason: string;
}

/** The subset of PlanSummary the plan persists in `config.summary`. */
function coerceBaselineSummary(
  config: unknown,
): Pick<PlanSummary, "dueCount" | "weakCount"> | null {
  if (!config || typeof config !== "object") return null;
  const summary = (config as { summary?: unknown }).summary;
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  const due = typeof s.dueCount === "number" ? s.dueCount : null;
  const weak = typeof s.weakCount === "number" ? s.weakCount : null;
  if (due == null && weak == null) return null;
  return { dueCount: due ?? 0, weakCount: weak ?? 0 };
}

/**
 * Decide whether the active plan is materially out of date. Returns `null` when
 * the plan still reflects reality (or there's no new data to judge against).
 *
 * `lastSessionAt` gates the check: staleness only means something once the
 * learner has actually studied since the plan was built, otherwise the numbers
 * can't have moved for a real reason.
 */
export function computePlanStaleness(
  plan: StudyPlanRow,
  live: PlanSummary,
  lastSessionAt: Date | null,
): PlanStaleness | null {
  const baseline = coerceBaselineSummary(plan.config);
  if (!baseline) return null;

  const plannedAt = plan.last_planned_at
    ? new Date(plan.last_planned_at)
    : null;
  const hasNewData =
    !!lastSessionAt && !!plannedAt && lastSessionAt.getTime() > plannedAt.getTime();
  if (!hasNewData) return null;

  const weakDelta = live.weakCount - baseline.weakCount;
  const dueDelta = live.dueCount - baseline.dueCount;

  if (weakDelta >= WEAK_GROWTH_ABS) {
    return {
      reason: `You've picked up ${weakDelta} more weak area${weakDelta === 1 ? "" : "s"} since this plan was built — re-planning will re-target your time where it now matters most.`,
    };
  }
  if (dueDelta >= DUE_GROWTH_ABS) {
    return {
      reason: `${dueDelta} more items have come due than this plan assumed — re-planning will re-spread the review load so no day becomes a wall.`,
    };
  }
  return null;
}
