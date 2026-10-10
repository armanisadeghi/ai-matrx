// features/employee-performance-reviews/standard/service.ts
//
// THE ONE FILE THAT CALLS THE STANDARD REVIEW DOORS (hr_review_*). Nothing else in this feature
// touches Supabase. NOT the 360 trial: it shares nothing with ../review-360.
//
// Every wrapper returns `StdResult<T>` and never throws: a refusal, a transport failure and an
// unreadable answer all arrive as `{ ok:false, message }` with a sentence a person can act on.

import { supabase } from "@/utils/supabase/client";

import { refusalMessage } from "./messages";
import {
  isRec,
  parseCycleDetail,
  parseCycleSummary,
  parseHistory,
  parseLaunch,
  parseProblems,
  parseReviewDetail,
  parseReviewSummary,
  type AnswerProblem,
  type CycleDetail,
  type CycleSummary,
  type HistoryRow,
  type LaunchResult,
  type ResponseRole,
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

export type ReviewDoor =
  | "hr_review_template_ensure_default"
  | "hr_review_cycle_create"
  | "hr_review_cycle_launch"
  | "hr_review_cycle_list"
  | "hr_review_cycle_get"
  | "hr_review_list_mine"
  | "hr_review_get"
  | "hr_review_save_response"
  | "hr_review_submit_response"
  | "hr_review_set_overall"
  | "hr_review_share"
  | "hr_review_acknowledge"
  | "hr_review_reopen"
  | "hr_review_cancel"
  | "hr_review_replace_manager"
  | "hr_review_history"
  | "hr_review_cycle_close";

type Envelope = Record<string, unknown>;

/** Calls a door and returns its OK envelope, or the refusal said in words. Never throws. */
export async function callDoor(door: ReviewDoor, args: Record<string, unknown>): Promise<StdResult<Envelope>> {
  let data: unknown = null;
  let error: { message?: string; code?: string } | null = null;
  try {
    ({ data, error } = (await supabase.schema(REVIEW_DOOR_SCHEMA).rpc(door as never, args as never)) as {
      data: unknown;
      error: { message?: string; code?: string } | null;
    });
  } catch (thrown) {
    return fail("transport", `The review could not reach the server. Check your connection and try again. (${thrown instanceof Error ? thrown.message : String(thrown)})`);
  }
  // PGRST106: the `hr` schema is not exposed to the Data API yet. Said plainly, never a blank page.
  if (error && (error.code === "PGRST106" || /only the following schemas are exposed/i.test(error.message ?? ""))) {
    return fail("schema_not_exposed", "Performance reviews are not reachable yet. They will open as soon as the service is switched on.");
  }
  if (error) return fail("transport", `The review service did not answer: ${error.message ?? "unknown error"}.`);
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
  selfDueOn: string;
  managerDueOn: string;
  shareDueOn: string;
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
      self_due_on: input.selfDueOn,
      manager_due_on: input.managerDueOn,
      share_due_on: input.shareDueOn,
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
