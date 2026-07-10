// features/education/study/planner/types.ts
//
// Types for the AI Study Planner (P5). A "plan draft" is the mode-agnostic,
// pre-persistence shape produced by EITHER the deterministic heuristic builder
// (`buildPlan.ts`) OR the planner agent — both emit the SAME draft so the
// persistence layer (`planService.savePlan`) is generator-agnostic. Row types
// derive from the generated `education` schema; never hand-mirror a column.

import type { Database } from "@/types/database.types";

type Edu = Database["education"]["Tables"];

export type StudyPlanRow = Edu["study_plan"]["Row"];
export type StudyPlanDayRow = Edu["study_plan_day"]["Row"];
export type StudyPlanBlockRow = Edu["study_plan_block"]["Row"];

/** ISO weekday: 0 = Sunday … 6 = Saturday (matches `Date.getDay()`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlanBlockKind = StudyPlanBlockRow["target_kind"]; // db check-constrained union

/** What a block points the learner at — polymorphic, so no per-mode column. */
export interface PlanTargetRef {
  setId?: string;
  topic?: string;
  goalId?: string;
  /** An explicit deep link; when absent the UI derives one from kind + itemType. */
  href?: string;
}

// ─── Draft shape (generator output, pre-persistence) ──────────────────────────
export interface PlanBlockDraft {
  dayDate: string; // ISO date (YYYY-MM-DD)
  targetKind: PlanBlockKind;
  itemType?: string | null;
  targetRef?: PlanTargetRef;
  label: string;
  estimatedMinutes: number;
  estimatedItems?: number | null;
  method?: string | null;
  ordering: number;
  rationale?: string | null;
}

export interface PlanDayDraft {
  dayDate: string;
  targetMinutes: number;
  isRestDay: boolean;
  rationale?: string | null;
  blocks: PlanBlockDraft[];
}

export interface PlanDraft {
  title: string;
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  dailyItemCap?: number | null;
  restDays: Weekday[];
  goalId?: string | null;
  generatedBy: "ai" | "heuristic";
  generatorAgentId?: string | null;
  rationale?: string | null;
  config: Record<string, unknown>;
  days: PlanDayDraft[];
}

// ─── Generation input ─────────────────────────────────────────────────────────
/** What the user (or a re-plan trigger) supplies to generate a plan. */
export interface PlanInput {
  title: string;
  /** ISO date the plan starts; defaults to today when omitted by the caller. */
  startDate: string;
  /** ISO date of the exam / target; the plan's last day. */
  examDate: string;
  /** Minutes the learner can study on a normal day. */
  dailyMinutes: number;
  /** Rest days the planner keeps clear (anti-burnout). */
  restDays: Weekday[];
  /** Gentle cap on review items per day (anti-burnout); null = uncapped. */
  dailyItemCap?: number | null;
  /** The exam goal this plan is built around, if any. */
  goalId?: string | null;
  /** Which study-spine item_type the plan schedules. Default 'fc_card'. */
  itemType?: string;
  /**
   * Anti-burnout re-entry ramp (recovery-after-absence). When set, the
   * deterministic builder eases the first study days back in (a smaller first
   * day, gentle second day) instead of dumping the whole overdue backlog on day
   * one — the "welcome back, here's your recovery plan" shape. Only the
   * heuristic builder honors it (recovery is deliberately deterministic).
   */
  reentry?: boolean;
}

/** A hydrated plan: the plan row + its days, each with its ordered blocks. */
export interface PlanWithDays {
  plan: StudyPlanRow;
  days: Array<{ day: StudyPlanDayRow; blocks: StudyPlanBlockRow[] }>;
}
