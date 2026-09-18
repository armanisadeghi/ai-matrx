// features/masterwork/capture-plan/types.ts
//
// THE CAPTURE PLAN — the shapes, and the one place they are declared.
//
// The whole program lives on `platform.rulebook.metadata.capture_plan`, the
// same place and the same compare-and-swap the Prediction Ledger uses. Nothing
// here is re-declared beside a consumer (FEATURE.md rule 15).
//
// 🚨 RAW FACTS ONLY, exactly like the Prediction Ledger. A session stores the
// rule ids that appeared while it ran, the minutes it was given, and when it
// happened. It does NOT store how many of those rules the Expert later
// approved — that is read off the live rules every time it is shown, so the
// ledger can never disagree with the Rulebook.

import { ruleState, type RulebookRule } from "../types";

/** Bumped when this shape changes in a way a reader must notice. */
export const CAPTURE_PLAN_SCHEMA = 1;

export type PlanStatus = "active" | "paused" | "completed" | "stopped";

/**
 * Why a plan ended. Every one of these is SAID on the plan page in the
 * Expert's own language — a plan that just stops is a plan that broke.
 */
export type StopReason =
  /** The goal's coverage target was reached. */
  | "coverage_met"
  /** `flatten_window` completed sessions in a row produced nothing. */
  | "yield_flat"
  /** Every allowed method has been dropped for producing nothing. */
  | "no_methods_left"
  /** The plan reached its horizon. */
  | "horizon_reached"
  /** The Expert ended it. */
  | "ended_by_expert";

export type Cadence = "daily" | "weekdays" | "every_other_day" | "weekly";
export type ReminderChannel = "preferences" | "in_app" | "email" | "sms" | "off";
export type StopRule = "yield_flat" | "coverage_met" | "either" | "horizon_only";

/**
 * Every behaviour of a plan, as the Expert chose it. Each field opens at the
 * `masterwork.capture_plan` knob's resolved value and is then the PLAN's own —
 * changing the knob later never rewrites a running plan behind someone's back.
 */
export interface PlanSettings {
  sessionMinutes: number;
  sessionsPerDay: number;
  cadence: Cadence;
  reminderChannel: ReminderChannel;
  reminderLeadMinutes: number;
  /**
   * How far ahead a reminder is queued. The plan page shows the whole
   * schedule; the QUEUE only ever holds the sessions due inside this window,
   * because a re-plan happens after every session and supersedes everything
   * further out anyway.
   */
  reminderHorizonHours: number;
  /** `"all"` = every live method; otherwise an explicit list of Approach keys. */
  methodsAllowed: "all" | string[];
  stopRule: StopRule;
  flattenWindow: number;
  horizonDays: number;
  targetRules: number;
  /** Minutes a day the Expert said they can give. Sizes the schedule. */
  minutesPerDay: number;
}

export type SessionStatus = "scheduled" | "completed" | "skipped";

export interface PlanSession {
  id: string;
  /** 1-based, in the order the planner laid them out. */
  seq: number;
  /** The `platform.approach` key this session runs. */
  method: string;
  dueAt: string;
  plannedMinutes: number;
  status: SessionStatus;
  /** Why the planner picked this method for this slot, in plain words. */
  chosenBecause: string;
  openedAt?: string;
  completedAt?: string;
  /**
   * The rule ids that appeared in the Rulebook while this session ran, taken
   * by diffing the rule list before and after. Lane-agnostic on purpose: no
   * lane has to know it is inside a plan, and a lane added tomorrow is
   * measured the same way with no change here.
   */
  ruleIds: string[];
  /** The `communication.notification` row ids the reminder created. */
  reminderIds?: string[];
  /** Said out loud on the plan page when the reminder could not be queued. */
  reminderError?: string;
}

/**
 * THE META-ASSET (doctrine CORE.md §5 Compounding): "the elicitation protocol
 * is itself a versioned, scored artifact — load-bearing rules per expert-hour".
 *
 * One row per method per Expert. It OUTLIVES the plan that fed it, so a second
 * plan for the same Rulebook starts from what the first one learned. The
 * Rulebook's platform-wide version capture makes it a versioned artifact for
 * free.
 */
export interface MethodYield {
  method: string;
  /** Completed sessions. A skipped session is not evidence about a method. */
  sessions: number;
  /** Minutes of the Expert's life this method has actually consumed. */
  minutes: number;
  /** Every rule id this method has ever produced, across every plan. */
  ruleIds: string[];
  /** Completed sessions in a row that produced no rule at all. */
  zeroYieldStreak: number;
  /** The planner's weight. Higher wins the next slot. */
  weight: number;
  /** Dropped methods are never scheduled again in this plan. */
  dropped: boolean;
  droppedReason?: string;
  lastSessionAt?: string;
}

export interface PastPlanSummary {
  id: string;
  goal: string;
  createdAt: string;
  endedAt: string;
  stopReason: StopReason;
  sessionsCompleted: number;
  rulesDrafted: number;
}

export interface CapturePlan {
  id: string;
  goal: string;
  createdAt: string;
  status: PlanStatus;
  stopReason: StopReason | null;
  stoppedAt: string | null;
  settings: PlanSettings;
  /** Bumped on every re-plan. The protocol version doctrine §3.6 asks for. */
  protocolVersion: number;
  sessions: PlanSession[];
}

export interface CapturePlanState {
  schema: number;
  plan: CapturePlan | null;
  /** Keyed by Approach key. Survives plan completion. */
  yields: Record<string, MethodYield>;
  pastPlans: PastPlanSummary[];
}

export const EMPTY_CAPTURE_PLAN_STATE: CapturePlanState = {
  schema: CAPTURE_PLAN_SCHEMA,
  plan: null,
  yields: {},
  pastPlans: [],
};

/**
 * Read the plan off a Rulebook's metadata. Total: anything unrecognisable
 * reads as "no plan", never as a crash and never as a half-plan.
 */
export function readCapturePlan(metadata: unknown): CapturePlanState {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return EMPTY_CAPTURE_PLAN_STATE;
  }
  const raw = (metadata as Record<string, unknown>).capture_plan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_CAPTURE_PLAN_STATE;
  }
  const state = raw as Partial<CapturePlanState>;
  return {
    schema: typeof state.schema === "number" ? state.schema : CAPTURE_PLAN_SCHEMA,
    plan: state.plan && typeof state.plan === "object" ? (state.plan as CapturePlan) : null,
    yields:
      state.yields && typeof state.yields === "object" && !Array.isArray(state.yields)
        ? (state.yields as Record<string, MethodYield>)
        : {},
    pastPlans: Array.isArray(state.pastPlans) ? (state.pastPlans as PastPlanSummary[]) : [],
  };
}

/**
 * What a set of rule ids is WORTH right now, read off the live rules.
 *
 * `approved` is the Expert's act and the only number that means anything on
 * its own. `loadBearing` is deliberately absent until a Bench trial exists for
 * this Rulebook — the Bench scores a whole built Masterwork, not a rule, so
 * there is no honest per-rule number to show and a zero would read as "none of
 * your rules matter". The plan page says that in those words rather than
 * printing a number nobody measured.
 */
export interface RuleIdYield {
  drafted: number;
  approved: number;
  /** Still waiting on the Expert. */
  waiting: number;
  /** The Expert looked and said no. */
  rejected: number;
  /** Approved once and since retired — produced, then taken back. */
  retired: number;
}

export function yieldOfRuleIds(
  ruleIds: readonly string[],
  rules: readonly RulebookRule[],
): RuleIdYield {
  const wanted = new Set(ruleIds);
  const tally: RuleIdYield = {
    drafted: 0,
    approved: 0,
    waiting: 0,
    rejected: 0,
    retired: 0,
  };
  for (const rule of rules) {
    if (!wanted.has(rule.id)) continue;
    tally.drafted += 1;
    // `ruleState` is the ONE precedence (FEATURE.md rule 20) — never re-derived.
    switch (ruleState(rule)) {
      case "approved":
        tally.approved += 1;
        break;
      case "draft":
        tally.waiting += 1;
        break;
      case "rejected":
        tally.rejected += 1;
        break;
      case "retired":
        tally.retired += 1;
        break;
    }
  }
  return tally;
}
