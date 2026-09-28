"use client";

// features/education/study/planner/educationPlannerScope.ts
//
// Runtime scope builder for `matrx-user/education-planner`. Called at trigger
// time by PlannerWorkspace's `getScope` — synchronously, from live state plus
// the module snapshot store (`plannerSnapshot.ts`), never a fetch: the Surface
// Context window samples `getScope` every 400ms.
//
// Everything derived here is EVIDENCE (mastery, struggle counts, plan
// progress). It is emitted so an agent can reason from it, and it is
// deliberately absent from the manifest's writeTargets so no agent can forge
// it.

import { createEducationPlannerScope } from "@/features/surfaces/manifests/education-planner.manifest";
import type {
  PlannerAgendaDay,
  PlannerGoalScopeEntry,
  PlannerPlanProgress,
} from "@/features/surfaces/manifests/education-planner.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { StudyGoalRow } from "../types";
import { daysUntil, rankGoals, type GoalStat } from "./goalStats";
import { readPlanSetupDraft, readPlannerPlanSnapshot } from "./plannerSnapshot";
import type { PlanWithDays } from "./types";

const MS_PER_DAY = 86_400_000;

/** Local-midnight day delta for a `YYYY-MM-DD` plan date (matches the header countdown). */
function daysUntilPlanDate(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / MS_PER_DAY);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function goalEntry(
  goal: StudyGoalRow,
  stat: GoalStat | undefined,
): PlannerGoalScopeEntry {
  const meta = goal.metadata as { topic?: string } | null;
  return {
    id: goal.id,
    title: goal.title,
    target_date: goal.target_date,
    status: goal.status,
    topic: meta?.topic ?? null,
    days_until: daysUntil(goal.target_date),
    matched_items: stat?.matched ?? 0,
    avg_mastery_pct: stat?.avgMasteryPct ?? null,
    struggling_count: stat?.struggling ?? 0,
  };
}

function agendaFor(plan: PlanWithDays): PlannerAgendaDay[] {
  return plan.days.map(({ day, blocks }) => ({
    date: day.day_date,
    target_minutes: day.target_minutes,
    is_rest_day: day.is_rest_day,
    rationale: day.rationale,
    blocks: blocks.map((b) => ({
      label: b.label,
      target_kind: b.target_kind,
      estimated_minutes: b.estimated_minutes,
      estimated_items: b.estimated_items,
      method: b.method,
      status: b.status,
      rationale: b.rationale,
    })),
  }));
}

function progressFor(plan: PlanWithDays): PlannerPlanProgress {
  const today = todayIso();
  const progress: PlannerPlanProgress = {
    total: 0,
    done: 0,
    skipped: 0,
    pending: 0,
    overdue: 0,
  };
  for (const { day, blocks } of plan.days) {
    for (const block of blocks) {
      progress.total += 1;
      if (block.status === "done") progress.done += 1;
      else if (block.status === "skipped") progress.skipped += 1;
      else {
        progress.pending += 1;
        if (day.day_date < today) progress.overdue += 1;
      }
    }
  }
  return progress;
}

export interface EducationPlannerScopeInput {
  /** "plan" | "goals" — which view is on screen. */
  activeTab: string;
  /** The goal list the workspace has loaded; null while it is still loading. */
  goals: StudyGoalRow[] | null;
  stats: Record<string, GoalStat>;
  goalsError: string | null;
}

/**
 * Build the live scope. Goal state comes from the workspace (which owns the
 * load so goals stay readable from BOTH tabs); plan state comes from the
 * snapshot store, so it is present only while the Plan tab is mounted — which
 * is exactly what the manifest promises.
 */
export function buildEducationPlannerScope(
  input: EducationPlannerScopeInput,
): SurfaceScopePayload {
  const goals = input.goals ?? [];
  const ranked = rankGoals(goals, input.stats);
  const entries = ranked.map((goal) => goalEntry(goal, input.stats[goal.id]));

  const planSnapshot = readPlannerPlanSnapshot();
  const plan = planSnapshot?.plan ?? null;
  const setupDraft = readPlanSetupDraft();
  const daysToExam = plan ? daysUntilPlanDate(plan.plan.end_date) : null;

  return createEducationPlannerScope({
    active_tab: input.activeTab,
    study_goals: entries,
    study_goal_count: entries.length,
    ...(entries[0] ? { top_priority_goal: entries[0] } : {}),
    ...(input.goalsError ? { goals_error: input.goalsError } : {}),
    ...(plan
      ? {
          active_plan: {
            id: plan.plan.id,
            title: plan.plan.title,
            status: plan.plan.status,
            start_date: plan.plan.start_date,
            end_date: plan.plan.end_date,
            daily_minutes: plan.plan.daily_minutes,
            daily_item_cap: plan.plan.daily_item_cap,
            rest_days: plan.plan.rest_days,
            generated_by: plan.plan.generated_by,
            rationale: plan.plan.rationale,
            goal_id: plan.plan.goal_id,
            item_type:
              (plan.plan.config as { itemType?: string } | null)?.itemType ??
              null,
          },
          plan_agenda: agendaFor(plan),
          plan_progress: progressFor(plan),
          ...(daysToExam !== null ? { plan_days_until_exam: daysToExam } : {}),
        }
      : {}),
    ...(planSnapshot?.lastSessionAt
      ? { last_study_session_at: planSnapshot.lastSessionAt }
      : {}),
    ...(planSnapshot?.error ? { plan_error: planSnapshot.error } : {}),
    ...(setupDraft
      ? {
          plan_setup_draft: {
            title: setupDraft.title,
            exam_date: setupDraft.examDate,
            daily_minutes: setupDraft.dailyMinutes,
            rest_days: setupDraft.restDays,
            daily_item_cap: setupDraft.dailyItemCap,
          },
        }
      : {}),
  });
}
