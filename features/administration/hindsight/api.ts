/**
 * features/administration/hindsight/api.ts
 *
 * Contract-bound client for aidream's `/hindsight/*` admin surface. Every call
 * goes through the typed client so a backend rename is a compile error here.
 *
 * The two triggers (`review`, `drain`) declare NO request body in the contract,
 * so `apiPost` would derive `never` for their body. Those use the raw
 * `postJson` escape hatch with a contract-DERIVED response type — the same
 * pattern `features/rag/api/search-lab.ts` uses for `/rag/search-lab/inventory`.
 */
import { apiDelete, apiGet, apiPatch, apiPost, buildPath } from "@/lib/api/typed-client";
import { postJson } from "@/lib/python-client";

import type {
  DrainResult,
  Enrollment,
  EnrollmentDetail,
  EnrollmentUpdateRequest,
  EnrollRequest,
  FindingDecision,
  HindsightCosts,
  Replay,
  ReplayRunResult,
  ReviewDetail,
  ReviewRunResult,
  ToolSubject,
} from "./types";

export async function listEnrollments(status?: string): Promise<Enrollment[]> {
  const { data } = await apiGet("/hindsight/enrollments", {
    query: status ? { status } : undefined,
  });
  return data;
}

export async function enroll(body: EnrollRequest): Promise<Enrollment> {
  const { data } = await apiPost("/hindsight/enrollments", body);
  return data;
}

export async function getEnrollment(id: string): Promise<EnrollmentDetail> {
  const { data } = await apiGet(
    buildPath("/hindsight/enrollments/{enrollment_id}", { enrollment_id: id }),
  );
  return data;
}

export async function updateEnrollment(
  id: string,
  body: EnrollmentUpdateRequest,
): Promise<Enrollment> {
  const { data } = await apiPatch(
    buildPath("/hindsight/enrollments/{enrollment_id}", { enrollment_id: id }),
    body,
  );
  return data;
}

export async function archiveEnrollment(id: string): Promise<{ status: string }> {
  const { data } = await apiDelete(
    buildPath("/hindsight/enrollments/{enrollment_id}", { enrollment_id: id }),
  );
  return data;
}

/**
 * Runs the whole review inline — reviewer agent reads every transcript in the
 * window. Minutes, not seconds. Callers must show real progress, never a
 * spinner that looks hung.
 */
export async function triggerReview(id: string): Promise<ReviewRunResult> {
  const { data } = await postJson<ReviewRunResult, undefined>(
    `/hindsight/enrollments/${encodeURIComponent(id)}/review`,
    undefined,
  );
  return data;
}

export async function getReview(id: string): Promise<ReviewDetail> {
  const { data } = await apiGet(
    buildPath("/hindsight/reviews/{review_id}", { review_id: id }),
  );
  return data;
}

export async function applyFinding(id: string): Promise<FindingDecision> {
  const { data } = await apiPost(
    buildPath("/hindsight/findings/{finding_id}/apply", { finding_id: id }),
    undefined,
  );
  return data;
}

export async function rejectFinding(id: string): Promise<FindingDecision> {
  const { data } = await apiPost(
    buildPath("/hindsight/findings/{finding_id}/reject", { finding_id: id }),
    undefined,
  );
  return data;
}

export async function triggerReplay(
  enrollmentId: string,
  body: {
    source_conversation_id: string;
    overrides?: Record<string, unknown>;
    finding_id?: string | null;
    variant?: string;
  },
): Promise<ReplayRunResult> {
  const { data } = await apiPost(
    buildPath("/hindsight/enrollments/{enrollment_id}/replay", {
      enrollment_id: enrollmentId,
    }),
    body,
  );
  return data;
}

export async function getReplay(id: string): Promise<Replay> {
  const { data } = await apiGet(
    buildPath("/hindsight/replays/{replay_id}", { replay_id: id }),
  );
  return data;
}

export async function listToolSubjects(hours = 168): Promise<ToolSubject[]> {
  const { data } = await apiGet("/hindsight/subjects/tools", { query: { hours } });
  return data;
}

export async function getCosts(): Promise<HindsightCosts> {
  const { data } = await apiGet("/hindsight/costs");
  return data;
}

/** Manual drain pass — the scheduled task does this every 15 minutes. */
export async function triggerDrain(): Promise<DrainResult> {
  const { data } = await postJson<DrainResult, undefined>(
    "/hindsight/drain",
    undefined,
  );
  return data;
}
