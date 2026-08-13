/**
 * Surface manifest — Study Planner (`matrx-user/education-planner`).
 *
 * The /education/planner workspace: two views behind one shell. The PLAN tab is
 * the AI day-by-day study plan (generate form when there is no active plan;
 * countdown + rationale + agenda when there is). The GOALS tab is real
 * `education.study_goal` CRUD, ranked by the planner's urgency-plus-struggle
 * heuristic.
 *
 * Curated groups (band 0-899):
 *
 *   planner_view  Which of the two views the learner is looking at
 *   goals         The learner's active study goals + their derived progress
 *   study_plan    The active day-by-day plan and how far through it they are
 *   plan_setup    The generation form's live values, while it is on screen
 *
 * Write half (read/write v1): FOUR targets, all `ask`. Three author goals
 * through the shared canonical path (`features/education/study/planner/
 * goalWrites.ts` → `studyService`, the same functions the editor dialog calls),
 * and one stages the plan-generation form. What is deliberately NOT writable:
 *
 *  - Every mastery / struggle / progress number in the `goals` and `study_plan`
 *    groups is DERIVED EVIDENCE computed from the study spine. An agent that
 *    could write a mastery percentage would forge the very measurement the
 *    planner exists to produce.
 *  - Deleting a goal stays human (destructive), so no delete target exists and
 *    `goalWrites.ts` deliberately exposes no delete helper for one to call.
 *  - Marking a plan BLOCK done/skipped is the learner's own record of what they
 *    actually studied. An agent ticking it off would be a lie about their
 *    behaviour, and it feeds mastery — so the agenda is read-only.
 *  - Generating, re-planning and archiving a plan are actions, not values, and
 *    generation spends an agent run; the learner presses those buttons.
 *
 * Emitter: `features/education/study/planner/components/PlannerWorkspace.tsx`
 * mounts the provider and owns the goal handlers; `StudyPlanView` and
 * `PlanGenerateForm` publish their slices through
 * `features/education/study/planner/plannerSnapshot.ts` (a module snapshot
 * store, NOT a fetch in `getScope` — the Surface Context window polls
 * `getScope` every 400ms, so it must stay synchronous and cheap).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "planner_view",
    label: "Planner view",
    sortOrder: 100,
    description:
      "Which of the planner's two views the learner is looking at right now.",
  },
  {
    key: "goals",
    label: "Study goals",
    sortOrder: 200,
    description:
      "The learner's active study goals, each with the derived progress the planner ranks them by (matched items, average mastery, how many they are struggling with).",
  },
  {
    key: "study_plan",
    label: "Study plan",
    sortOrder: 300,
    description:
      "The active day-by-day plan: its parameters, its agenda, and how far through it the learner is.",
  },
  {
    key: "plan_setup",
    label: "Plan setup",
    sortOrder: 400,
    description:
      "The plan-generation form's live values, while that form is the view on screen.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Planner view ──────────────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which view is on screen: "plan" (the AI day-by-day plan) or "goals" (the study-goal list). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 100,
    group: "planner_view",
  },

  // ── Study goals ───────────────────────────────────────────────────────
  {
    name: "study_goals",
    label: "Active goals",
    description:
      "The learner's active study goals, most urgent first, as { id, title, target_date, status, topic, days_until, matched_items, avg_mastery_pct, struggling_count }. Always present — an empty array when they have no active goals. The `id` is what a goal write target's goal_id must be.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 700,
    sortOrder: 200,
    group: "goals",
  },
  {
    name: "study_goal_count",
    label: "Goal count",
    description:
      "How many active goals the learner has. Always present; 0 when the list is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 210,
    group: "goals",
  },
  {
    name: "top_priority_goal",
    label: "Top priority goal",
    description:
      "The goal the planner's heuristic ranks first (soonest target date, weighted up by how many of its items the learner is struggling with), in the same shape as a study_goals entry. Absent when there are no active goals.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 220,
    group: "goals",
  },
  {
    name: "goals_error",
    label: "Goals load error",
    description:
      "The error message when loading the goal list failed. Absent on the happy path — present so an agent can help with the real failure instead of guessing at an empty list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 230,
    group: "goals",
  },

  // ── Study plan ────────────────────────────────────────────────────────
  {
    name: "active_plan",
    label: "Active plan",
    description:
      "The learner's active study plan as { id, title, status, start_date, end_date, daily_minutes, daily_item_cap, rest_days, generated_by, rationale, goal_id, item_type }. Absent when they have no active plan (the generation form is showing instead) and while the Goals tab is the view on screen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 300,
    group: "study_plan",
  },
  {
    name: "plan_days_until_exam",
    label: "Days until exam",
    description:
      "Whole days from today to the active plan's end date — negative when the exam date has passed. Absent whenever active_plan is absent.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "study_plan",
  },
  {
    name: "plan_agenda",
    label: "Plan agenda",
    description:
      "The plan day by day: [{ date, target_minutes, is_rest_day, rationale, blocks: [{ label, target_kind, estimated_minutes, estimated_items, method, status, rationale }] }]. Absent whenever active_plan is absent. Read-only evidence — block status is the learner's own record of what they studied.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 320,
    group: "study_plan",
  },
  {
    name: "plan_progress",
    label: "Plan progress",
    description:
      "Rollup of the agenda's blocks as { total, done, skipped, pending, overdue } — `overdue` counts still-pending blocks dated before today. Absent whenever active_plan is absent.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 330,
    group: "study_plan",
  },
  {
    name: "last_study_session_at",
    label: "Last study session",
    description:
      "ISO timestamp of the learner's most recent study session, which is what the planner's return-after-absence prompt keys off. Absent when they have never studied, and while the Goals tab is the view on screen.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 340,
    group: "study_plan",
  },
  {
    name: "plan_error",
    label: "Plan load error",
    description:
      "The error message when loading the active plan failed. Absent on the happy path.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 350,
    group: "study_plan",
  },

  // ── Plan setup ────────────────────────────────────────────────────────
  {
    name: "plan_setup_draft",
    label: "Plan setup draft",
    description:
      "The plan-generation form's live values as { title, exam_date, daily_minutes, rest_days, daily_item_cap } — the read twin of the plan_setup write target. Absent unless that form is the view on screen, which it is only when the learner has no active plan or pressed New.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 400,
    group: "plan_setup",
  },
];

/**
 * Write half (read/write v1).
 *
 * Goal authoring is the surface's strongest case for an agent: "I want to be
 * ready for the biology midterm in three weeks" carries a title, a date and a
 * topic, and turning that sentence into a tracked goal is exactly the
 * decomposition an agent does well. All three goal targets are `entity` — a
 * goal is a small, visible, fully reversible row the learner can edit or
 * archive in one click, and staging it as a draft would mean inventing an
 * editor state the page does not have. They are `ask`, so the learner still
 * sees and approves each one.
 *
 * `plan_setup` is `draft`: it fills the generation form and stops. Generating
 * the plan spends an agent run and rewrites the learner's schedule, so the
 * "Generate plan" button stays human-pressed.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_goal",
    label: "New study goal",
    description:
      'Creates a new active study goal, saved immediately. Value is an OBJECT: { title: string (required, plain text — what the learner is working toward, e.g. "Ace the AP Bio unit 3 exam"), target_date?: string | null (the exam/target day as YYYY-MM-DD, e.g. "2026-09-14"; omit or null for an open-ended goal), topic?: string | null (a flashcard topic tag to track progress against, e.g. "Cell respiration"; omit for an untargeted goal) }. Creates a NEW goal every time — to change an existing one use update_goal with its goal_id.',
    valueType: "object",
    updatesValue: "study_goals",
    mode: "entity",
    applyPolicy: "ask",
    group: "goals",
    sortOrder: 200,
  },
  {
    name: "update_goal",
    label: "Goal details",
    description:
      'Edits an EXISTING study goal, saved immediately. Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals; it decides WHICH goal changes), title?: string (plain text), target_date?: string | null (YYYY-MM-DD, or null to clear the date), topic?: string | null (the flashcard topic tag; pass an empty string to clear it) }. Only the fields you include are changed — omit a field to leave it alone. At least one of title / target_date / topic is required alongside goal_id.',
    valueType: "object",
    updatesValue: "study_goals",
    mode: "entity",
    applyPolicy: "ask",
    group: "goals",
    sortOrder: 210,
  },
  {
    name: "goal_status",
    label: "Goal status",
    description:
      'Moves an existing goal through its lifecycle, saved immediately. Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals), status: "active" | "achieved" | "archived" }. "achieved" is for a goal the learner has actually met; "archived" retires one they are no longer working toward. Both remove it from the active list. This is not a delete — deleting a goal is destructive and stays a human action.',
    valueType: "object",
    updatesValue: "study_goals",
    mode: "entity",
    applyPolicy: "ask",
    group: "goals",
    sortOrder: 220,
  },
  {
    name: "plan_setup",
    label: "Plan setup",
    description:
      'Fills the plan-generation form. NOTHING is generated or saved — the learner reviews the values and presses "Generate plan" themselves. Value is an OBJECT; include only the fields you mean to set: { title?: string (plain text — what they are studying for, e.g. "Spanish midterm"), exam_date?: string (the target day as YYYY-MM-DD; must be today or later), daily_minutes?: number (10-180, how long they can study on a normal day), rest_days?: number[] (weekdays kept clear, 0=Sunday through 6=Saturday, e.g. [0,6] for weekends), daily_item_cap?: number | null (a gentle cap on review items per day; null for no cap) }. Only available while the generation form is on screen — it is not offered when an active plan is showing.',
    valueType: "object",
    updatesValue: "plan_setup_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "plan_setup",
    sortOrder: 400,
  },
];

export const educationPlannerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-planner",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + four write targets shipped and verified with a live agent run. Not yet stamped verified: no agent roles or config namespaces are declared; no `data-surface-value` Locate anchors are tagged; and the return-after-absence / plan-staleness banners are transient UI prompts derived from a heavy cross-mode snapshot (collectPlanSummary), so their computed `reason` strings are deliberately not emitted — the underlying facts (plan_progress.overdue, last_study_session_at, the agenda dates) are.",
  label: "Study Planner",
  urlPattern: "/education/planner",
  intro: `<surface_intro>
You are on the Study Planner at /education/planner. It holds two views, and active_tab tells you which one the learner is looking at.

The GOALS view is the learner's exam targets: study_goals lists them most-urgent-first, each carrying its own derived progress — matched_items, avg_mastery_pct and struggling_count come from their real attempt history, not a guess. top_priority_goal is what the planner's heuristic surfaces first (soonest target date, weighted up by struggle). You can author goals here: create_goal turns "I have a biology midterm in three weeks" into a tracked row, update_goal edits one by its id, and goal_status retires one. Deleting stays with the learner.

The PLAN view is the day-by-day schedule. When active_plan is present, plan_agenda is the real agenda and plan_progress says how much of it has actually been done — treat overdue blocks as information, never as something to scold about; the product's whole posture toward a missed week is a gentle recovery plan, not a wall of guilt. When active_plan is absent the generation form is showing instead, plan_setup_draft mirrors its live fields, and plan_setup lets you fill them in from what the learner just told you. Filling the form does not generate anything — they press Generate themselves.

Every mastery, struggle and progress number here is measured evidence. Reason from it and coach with it; you cannot write it, and you should not talk as though it can be adjusted.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `study_goals` (and the shape of `top_priority_goal`). */
export interface PlannerGoalScopeEntry {
  id: string;
  title: string;
  target_date: string | null;
  status: string;
  topic: string | null;
  days_until: number | null;
  matched_items: number;
  avg_mastery_pct: number | null;
  struggling_count: number;
}

export interface PlannerAgendaBlock {
  label: string;
  target_kind: string;
  estimated_minutes: number;
  estimated_items: number | null;
  method: string | null;
  status: string;
  rationale: string | null;
}

export interface PlannerAgendaDay {
  date: string;
  target_minutes: number;
  is_rest_day: boolean;
  rationale: string | null;
  blocks: PlannerAgendaBlock[];
}

export interface PlannerPlanProgress {
  total: number;
  done: number;
  skipped: number;
  pending: number;
  overdue: number;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationPlannerScope(values: {
  // alwaysAvailable: true → required
  active_tab: string;
  study_goals: PlannerGoalScopeEntry[];
  study_goal_count: number;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  top_priority_goal?: PlannerGoalScopeEntry;
  goals_error?: string;
  active_plan?: Record<string, unknown>;
  plan_days_until_exam?: number;
  plan_agenda?: PlannerAgendaDay[];
  plan_progress?: PlannerPlanProgress;
  last_study_session_at?: string;
  plan_error?: string;
  plan_setup_draft?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
