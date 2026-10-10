// features/employee-performance-reviews/standard/service.ts
//
// THE ONE FILE THAT CALLS THE STANDARD REVIEW DOORS (hr_review_*). Nothing else in this feature
// touches Supabase. NOT the 360 trial: it shares nothing with ../review-360.
//
// Every wrapper returns `StdResult<T>` and never throws: a refusal, a transport failure and an
// unreadable answer all arrive as `{ ok:false, message }` with a sentence a person can act on.

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";

import { refusalMessage } from "./messages";
import { parseGoalHistory, parseGoals, parseTeam, type Goal, type GoalHistoryEntry, type TeamMember } from "./goals";
import {
  isRec,
  parseCalibration,
  parseCycleDetail,
  parseCycleSummary,
  parseHistory,
  parseLaunch,
  parseProblems,
  parseReviewDetail,
  parseReviewSummary,
  parseTemplate,
  parseTemplateList,
  type AnswerProblem,
  type CalibrationData,
  type CycleDetail,
  type CycleSummary,
  type HistoryRow,
  type LaunchResult,
  type ResponseRole,
  type TemplateRow,
  type TemplateSnapshot,
  type ReviewAnswers,
  type ReviewDetail,
  type ReviewSummary,
} from "./types";

/**
 * The schema the review doors are callable from. One constant, so moving the doors is a
 * one-line change. (Doors were created in `hr`; the Data API does not expose it.)
 */
export const REVIEW_DOOR_SCHEMA = "hr" as const;

export type StdResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; message: string; problems?: AnswerProblem[]; currentVersion?: number | null };

const fail = (reason: string, message: string, extra?: { problems?: AnswerProblem[]; currentVersion?: number | null }): StdResult<never> => ({
  ok: false,
  reason,
  message,
  ...extra,
});

type HrFunctions = Database["hr"]["Functions"];
/** Every review door, taken from the generated hr Functions: a renamed or removed door is a type error. */
export type ReviewDoor = Extract<keyof HrFunctions, `hr_review_${string}` | `hr_goal_${string}`>;

type Envelope = Record<string, unknown>;

/**
 * Calls a door and returns its OK envelope, or the refusal said in words. Never throws.
 * `args` is the generated signature of THAT door, so a drifted argument is a type error.
 * Raw driver text never reaches the screen: it goes to the console, the person gets a fixed sentence.
 */
export function callDoor<D extends ReviewDoor>(door: D, args: HrFunctions[D]["Args"]): Promise<StdResult<Envelope>> {
  return settle(door, () => supabase.schema(REVIEW_DOOR_SCHEMA).rpc(door, args));
}

async function settle(
  door: string,
  run: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
): Promise<StdResult<Envelope>> {
  let data: unknown = null;
  let error: { message?: string; code?: string } | null = null;
  try {
    ({ data, error } = await run());
  } catch (thrown) {
    console.error(`[hr-review] ${door} did not reach the server`, thrown);
    return fail("transport", TRANSPORT_MESSAGE);
  }
  // PGRST106: the `hr` schema is not exposed to the Data API yet. Said plainly, never a blank page.
  if (error && (error.code === "PGRST106" || /only the following schemas are exposed/i.test(error.message ?? ""))) {
    return fail("schema_not_exposed", "Performance reviews are not reachable yet. They will open as soon as the service is switched on.");
  }
  if (error) {
    console.error(`[hr-review] ${door} failed`, error);
    return fail("transport", SERVICE_MESSAGE);
  }
  if (!isRec(data)) return fail("unreadable", "The review service answered something unreadable. Reload and try again.");
  if (data.ok !== true) {
    const reason = typeof data.reason === "string" ? data.reason : "refused";
    const field = typeof data.field === "string" ? data.field : null;
    const detail = typeof data.detail === "string" ? data.detail : null;
    return fail(reason, refusalMessage({ reason, field, detail }), {
      problems: parseProblems(data.problems),
      currentVersion: typeof data.current_version === "number" ? data.current_version : null,
    });
  }
  return { ok: true, data };
}

export const TRANSPORT_MESSAGE = "The review could not reach the server. Check your connection and try again.";
export const SERVICE_MESSAGE = "The review service could not complete that. Try again in a moment.";

const unreadable = (what: string) => fail("unreadable", `${what} came back in a shape this page cannot read. Reload and try again.`);

// ── reads ────────────────────────────────────────────────────────────────────────────────────

export async function listMyReviews(organizationId: string | null): Promise<StdResult<ReviewSummary[]>> {
  const r = await callDoor("hr_review_list_mine", organizationId ? { p_organization_id: organizationId } : {});
  if (!r.ok) return r;
  const rows = Array.isArray(r.data.reviews) ? r.data.reviews : [];
  return { ok: true, data: rows.map(parseReviewSummary).filter((x): x is ReviewSummary => x !== null) };
}

export async function listCycles(organizationId: string): Promise<StdResult<CycleSummary[]>> {
  const r = await callDoor("hr_review_cycle_list", { p_organization_id: organizationId });
  if (!r.ok) return r;
  const rows = Array.isArray(r.data.cycles) ? r.data.cycles : [];
  return { ok: true, data: rows.filter(isRec).map(parseCycleSummary).filter((x): x is CycleSummary => x !== null) };
}

export async function getCycle(cycleId: string): Promise<StdResult<CycleDetail>> {
  const r = await callDoor("hr_review_cycle_get", { p_cycle_id: cycleId });
  if (!r.ok) return r;
  const parsed = parseCycleDetail(r.data);
  return parsed ? { ok: true, data: parsed } : unreadable("The cycle");
}

export async function getReview(reviewId: string): Promise<StdResult<ReviewDetail>> {
  const r = await callDoor("hr_review_get", { p_review_id: reviewId });
  if (!r.ok) return r;
  const parsed = parseReviewDetail(r.data);
  return parsed ? { ok: true, data: parsed } : unreadable("The review");
}

export async function reviewHistory(employmentId: string): Promise<StdResult<HistoryRow[]>> {
  const r = await callDoor("hr_review_history", { p_employment_id: employmentId });
  if (!r.ok) return r;
  return { ok: true, data: parseHistory(r.data) };
}

// ── cycle writes ─────────────────────────────────────────────────────────────────────────────

export interface NewCycleInput {
  organizationId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  /** Blank takes the organization's knob days. */
  selfDueOn: string;
  managerDueOn: string;
  shareDueOn: string;
  /** Absent takes the organization's default template. */
  templateId?: string | null;
}

/** Makes sure the organization has the default template, then creates the cycle. Returns the cycle id. */
export async function createCycle(input: NewCycleInput): Promise<StdResult<string>> {
  const tpl = await callDoor("hr_review_template_ensure_default", { p_organization_id: input.organizationId });
  if (!tpl.ok) return tpl;
  const made = await callDoor("hr_review_cycle_create", {
    p_payload: {
      organization_id: input.organizationId,
      name: input.name,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      ...(input.selfDueOn ? { self_due_on: input.selfDueOn } : {}),
      ...(input.managerDueOn ? { manager_due_on: input.managerDueOn } : {}),
      ...(input.shareDueOn ? { share_due_on: input.shareDueOn } : {}),
      ...(input.templateId ? { template_id: input.templateId } : {}),
    },
  });
  if (!made.ok) return made;
  return typeof made.data.cycle_id === "string" ? { ok: true, data: made.data.cycle_id } : unreadable("The new cycle");
}

export type LaunchPopulation =
  | { kind: "manager"; managerEmploymentId: string }
  | { kind: "department"; departmentId: string }
  | { kind: "people"; employmentIds: string[] };

export async function launchCycle(cycleId: string, population: LaunchPopulation): Promise<StdResult<LaunchResult>> {
  const payload =
    population.kind === "manager"
      ? { manager_employment_id: population.managerEmploymentId }
      : population.kind === "department"
        ? { department_id: population.departmentId }
        : { employment_ids: population.employmentIds };
  const r = await callDoor("hr_review_cycle_launch", { p_cycle_id: cycleId, p_payload: payload });
  return r.ok ? { ok: true, data: parseLaunch(r.data) } : r;
}

export async function closeCycle(cycleId: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_cycle_close", { p_cycle_id: cycleId });
  return r.ok ? { ok: true, data: true } : r;
}

// ── review writes ────────────────────────────────────────────────────────────────────────────

export interface SavedResponse {
  version: number;
}

export async function saveResponse(
  reviewId: string,
  role: ResponseRole,
  answers: ReviewAnswers,
  expectedVersion: number | null,
): Promise<StdResult<SavedResponse>> {
  const r = await callDoor("hr_review_save_response", {
    p_review_id: reviewId,
    p_role: role,
    p_answers: answers,
    ...(expectedVersion !== null ? { p_expected_version: expectedVersion } : {}),
  });
  if (!r.ok) return r;
  return typeof r.data.version === "number" ? { ok: true, data: { version: r.data.version } } : unreadable("The saved answer");
}

export interface SubmitOutcome {
  bothSubmitted: boolean;
}

export async function submitResponse(reviewId: string, role: ResponseRole): Promise<StdResult<SubmitOutcome>> {
  const r = await callDoor("hr_review_submit_response", { p_review_id: reviewId, p_role: role });
  return r.ok ? { ok: true, data: { bothSubmitted: r.data.both_submitted === true } } : r;
}

export async function setOverallRating(reviewId: string, ratingKey: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_set_overall", { p_review_id: reviewId, p_rating: ratingKey });
  return r.ok ? { ok: true, data: true } : r;
}

export async function shareReview(reviewId: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_share", { p_review_id: reviewId });
  return r.ok ? { ok: true, data: true } : r;
}

export async function acknowledgeReview(reviewId: string, comment: string | null): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_acknowledge", { p_review_id: reviewId, ...(comment ? { p_comment: comment } : {}) });
  return r.ok ? { ok: true, data: true } : r;
}

export async function reopenReview(reviewId: string, reason: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_reopen", { p_review_id: reviewId, p_reason: reason });
  return r.ok ? { ok: true, data: true } : r;
}

export async function cancelReview(reviewId: string, reason: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_cancel", { p_review_id: reviewId, p_reason: reason });
  return r.ok ? { ok: true, data: true } : r;
}

export async function replaceManager(reviewId: string, managerEmploymentId: string): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_replace_manager", { p_review_id: reviewId, p_manager_employment_id: managerEmploymentId });
  return r.ok ? { ok: true, data: true } : r;
}

// ── wave 2: templates, calibration ───────────────────────────────────────────────────────────

export async function listTemplates(organizationId: string): Promise<StdResult<TemplateRow[]>> {
  const r = await callDoor("hr_review_template_list", { p_organization_id: organizationId });
  return r.ok ? { ok: true, data: parseTemplateList(r.data) } : r;
}

export interface SavedTemplate {
  templateId: string;
  created: boolean;
  version: number;
}

/** `payload` is built by templateBuilder.ts, so every object carries the `__kind` the door validates. */
export async function saveTemplate(payload: Record<string, unknown>): Promise<StdResult<SavedTemplate>> {
  const r = await callDoor("hr_review_template_save", { p_payload: payload });
  if (!r.ok) return r;
  return typeof r.data.template_id === "string"
    ? { ok: true, data: { templateId: r.data.template_id, created: r.data.created === true, version: typeof r.data.version === "number" ? r.data.version : 1 } }
    : unreadable("The saved template");
}

export async function archiveTemplate(templateId: string): Promise<StdResult<{ wasDefault: boolean }>> {
  const r = await callDoor("hr_review_template_archive", { p_template_id: templateId });
  return r.ok ? { ok: true, data: { wasDefault: r.data.was_default === true } } : r;
}

export async function getCalibration(cycleId: string): Promise<StdResult<CalibrationData>> {
  const r = await callDoor("hr_review_calibration", { p_cycle_id: cycleId, p_filter: {} });
  return r.ok ? { ok: true, data: parseCalibration(r.data) } : r;
}

export async function calibrateReview(reviewId: string, ratingKey: string, note: string | null): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_calibrate", {
    p_review_id: reviewId,
    p_rating: ratingKey,
    ...(note ? { p_note: note } : {}),
  });
  return r.ok ? { ok: true, data: true } : r;
}

// ── wave 3: goals ────────────────────────────────────────────────────────────────────────────

export async function listGoals(employmentId: string): Promise<StdResult<{ goals: Goal[]; canEdit: boolean }>> {
  const r = await callDoor("hr_goal_list", { p_employment_id: employmentId });
  return r.ok ? { ok: true, data: { goals: parseGoals(r.data.goals), canEdit: r.data.can_edit === true } } : r;
}

export async function listTeamGoals(managerEmploymentId: string): Promise<StdResult<TeamMember[]>> {
  const r = await callDoor("hr_goal_list_team", { p_manager_employment_id: managerEmploymentId });
  return r.ok ? { ok: true, data: parseTeam(r.data) } : r;
}

export interface GoalInput {
  goalId?: string | null;
  employmentId: string;
  title: string;
  description: string;
  measure: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  startOn: string;
  dueOn: string;
  status: string;
  parentGoalId: string | null;
}

/** Blank text clears the field (the door treats an empty string as null); numbers go as numbers. */
export function goalPayload(g: GoalInput): Record<string, unknown> {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    ...(g.goalId ? { goal_id: g.goalId } : { employment_id: g.employmentId }),
    title: g.title.trim(),
    description: g.description.trim(),
    measure: g.measure.trim(),
    target_value: n(g.targetValue),
    current_value: n(g.currentValue),
    unit: g.unit.trim(),
    start_on: g.startOn,
    due_on: g.dueOn,
    status: g.status,
    parent_goal_id: g.parentGoalId ?? "",
  };
}

export async function saveGoal(input: GoalInput): Promise<StdResult<{ goalId: string }>> {
  const r = await callDoor("hr_goal_save", { p_payload: goalPayload(input) });
  if (!r.ok) return r;
  return typeof r.data.goal_id === "string" ? { ok: true, data: { goalId: r.data.goal_id } } : unreadable("The saved goal");
}

export async function updateGoalProgress(
  goalId: string,
  input: { currentValue: number | null; progress: number | null; status: string | null; note: string | null },
): Promise<StdResult<{ progress: number; status: string; history: GoalHistoryEntry[] }>> {
  const r = await callDoor("hr_goal_update_progress", {
    p_goal_id: goalId,
    ...(input.currentValue !== null ? { p_current_value: input.currentValue } : {}),
    ...(input.progress !== null ? { p_progress: input.progress } : {}),
    ...(input.status ? { p_status: input.status } : {}),
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (!r.ok) return r;
  return {
    ok: true,
    data: { progress: typeof r.data.progress === "number" ? r.data.progress : 0, status: typeof r.data.status === "string" ? r.data.status : "on_track", history: parseGoalHistory(r.data.history) },
  };
}

export async function archiveGoal(goalId: string): Promise<StdResult<{ childrenKept: number }>> {
  const r = await callDoor("hr_goal_archive", { p_goal_id: goalId });
  return r.ok ? { ok: true, data: { childrenKept: typeof r.data.children_kept === "number" ? r.data.children_kept : 0 } } : r;
}

// ── wave 3: peers ────────────────────────────────────────────────────────────────────────────

export interface PeerNominateResult {
  nominated: Array<{ peerName: string; status: string }>;
  refused: Array<{ employmentId: string; reason: string }>;
}

const list = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter(isRec) : []);

export async function nominatePeers(reviewId: string, employmentIds: string[]): Promise<StdResult<PeerNominateResult>> {
  const r = await callDoor("hr_review_peer_nominate", { p_review_id: reviewId, p_employment_ids: employmentIds });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      nominated: list(r.data.nominations).map((n) => ({ peerName: typeof n.peer_name === "string" ? n.peer_name : "Colleague", status: typeof n.status === "string" ? n.status : "pending" })),
      refused: list(r.data.refused).map((n) => ({ employmentId: typeof n.employment_id === "string" ? n.employment_id : "", reason: typeof n.reason === "string" ? n.reason : "refused" })),
    },
  };
}

export async function decidePeers(reviewId: string, nominationIds: string[], approve: boolean): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_peer_approve", { p_review_id: reviewId, p_nomination_ids: nominationIds, p_approve: approve });
  return r.ok ? { ok: true, data: true } : r;
}

export async function sharePeerFeedback(reviewId: string, share: boolean): Promise<StdResult<true>> {
  const r = await callDoor("hr_review_peer_share", { p_review_id: reviewId, p_share: share });
  return r.ok ? { ok: true, data: true } : r;
}

export interface PeerRequest {
  reviewId: string;
  employeeName: string;
  cycleName: string;
  cycleStatus: string;
  dueOn: string | null;
  responseStatus: string;
}

export async function myPeerRequests(): Promise<StdResult<PeerRequest[]>> {
  const r = await settle("hr_review_peer_requests_mine", () => supabase.schema(REVIEW_DOOR_SCHEMA).rpc("hr_review_peer_requests_mine"));
  if (!r.ok) return r;
  return {
    ok: true,
    data: list(r.data.requests).flatMap((x) =>
      typeof x.review_id === "string"
        ? [
            {
              reviewId: x.review_id,
              employeeName: typeof x.employee_name === "string" ? x.employee_name : "Colleague",
              cycleName: typeof x.cycle_name === "string" ? x.cycle_name : "Review cycle",
              cycleStatus: typeof x.cycle_status === "string" ? x.cycle_status : "open",
              dueOn: typeof x.due_on === "string" ? x.due_on : null,
              responseStatus: typeof x.response_status === "string" ? x.response_status : "not_started",
            },
          ]
        : [],
    ),
  };
}

/** Whether this employer has turned peer feedback on (knob standard_review_peers_enabled). */
export async function readPeersEnabled(organizationId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema("platform").rpc("knob_resolve", {
      p_feature: "hr.performance",
      p_key: "standard_review_peers_enabled",
      p_organization_id: organizationId,
      p_user_id: userId,
    });
    if (error) return false;
    const v = isRec(data) && "value" in data ? data.value : data;
    return v === true || v === "true";
  } catch {
    return false;
  }
}

// ── wave 3: full template editing ───────────────────────────────────────────────────────────

export async function getTemplate(templateId: string): Promise<StdResult<{ snapshot: TemplateSnapshot; version: number }>> {
  const r = await callDoor("hr_review_template_get", { p_template_id: templateId });
  if (!r.ok) return r;
  const t = isRec(r.data.template) ? r.data.template : null;
  if (!t) return unreadable("The template");
  return { ok: true, data: { snapshot: parseTemplate(t), version: typeof t.version === "number" ? t.version : 1 } };
}
