/**
 * features/hindsight/api.ts
 *
 * Contract-bound client for aidream's `/hindsight/*` admin surface. Every call
 * goes through the typed client so a backend rename is a compile error here.
 *
 * The two triggers (`review`, `drain`) declare NO request body in the contract,
 * so `apiPost` would derive `never` for their body. Those use the raw
 * `postJson` escape hatch with a contract-DERIVED response type — the same
 * pattern `features/knowledge/api/search-lab.ts` uses for `/knowledge/search-lab/inventory`.
 */
import { apiDelete, apiGet, apiPatch, apiPost, buildPath } from "@/lib/api/typed-client";
import { postJson } from "@/lib/python-client";

import type {
  ChangeHistory,
  ChangeRole,
  DiscussResult,
  DrainResult,
  Enrollment,
  EnrollmentDetail,
  EnrollmentUpdateRequest,
  EnrollRequest,
  FindingDecision,
  FindingEffectiveness,
  FindingRevert,
  HindsightCosts,
  RegressionCase,
  Replay,
  ReplayRunResult,
  ReviewDetail,
  ReviewRunResult,
  ReviewThread,
  ToolSubject,
  UnitToken,
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

/**
 * The reviewer's own conversation. `available: false` is a NORMAL outcome —
 * reviews from before threaded reviews shipped persisted only a cost spine —
 * and `reason` carries the sentence to show instead of an empty void.
 */
export async function getReviewThread(reviewId: string): Promise<ReviewThread> {
  const { data } = await apiGet(
    buildPath("/hindsight/reviews/{review_id}/thread", { review_id: reviewId }),
  );
  return data;
}

/**
 * Send human guidance into the reviewer's thread. Takes roughly a minute (a
 * frontier model call) and commonly produces BRAND-NEW findings rather than
 * editing the one the human was looking at — callers must refetch the review.
 * `status: "failed"` with a `reason` is a normal outcome to render.
 */
export async function discussReview(
  reviewId: string,
  message: string,
): Promise<DiscussResult> {
  const { data } = await apiPost(
    buildPath("/hindsight/reviews/{review_id}/discuss", { review_id: reviewId }),
    { message },
  );
  return data;
}

/** Same thread, scoped to one finding. */
export async function discussFinding(
  findingId: string,
  message: string,
): Promise<DiscussResult> {
  const { data } = await apiPost(
    buildPath("/hindsight/findings/{finding_id}/discuss", { finding_id: findingId }),
    { message },
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

/**
 * Undo an applied finding. The server re-promotes the pre-apply version
 * through the same canonical agent write path the apply used, recording it
 * as a NEW version row — so the receipt names both the version that came
 * back (`reverted_to_version`) and the row that carries it
 * (`new_version_number`). Only valid while the agent is still AT the
 * applied version; a 422 with a human-readable reason is the normal
 * refusal, not an exception case.
 */
export async function revertFinding(id: string): Promise<FindingRevert> {
  const { data } = await apiPost(
    buildPath("/hindsight/findings/{finding_id}/revert", { finding_id: id }),
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

// ── Internal Affairs (C-19) ────────────────────────────────────────────────
// Two read-only views behind two admin-gated endpoints. There is deliberately
// no write here: a governed unit is changed only through the agent write path,
// and a finding is decided only through apply / reject / revert above.

export async function getChangeHistory(params: {
  unitToken?: UnitToken;
  unitId?: string;
  changeRole?: ChangeRole;
  actorTier?: "code" | "ai" | "human";
  withFindingsOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<ChangeHistory> {
  const { data } = await apiGet("/hindsight/change-history", {
    query: {
      ...(params.unitToken ? { unit_token: params.unitToken } : {}),
      ...(params.unitId ? { unit_id: params.unitId } : {}),
      ...(params.changeRole ? { change_role: params.changeRole } : {}),
      ...(params.actorTier ? { actor_tier: params.actorTier } : {}),
      ...(params.withFindingsOnly ? { with_findings_only: true } : {}),
      ...(params.limit != null ? { limit: params.limit } : {}),
      ...(params.offset != null ? { offset: params.offset } : {}),
    },
  });
  return data;
}

export async function getFindingEffectiveness(params: {
  unitToken?: UnitToken;
  unitId?: string;
} = {}): Promise<FindingEffectiveness[]> {
  const { data } = await apiGet("/hindsight/finding-effectiveness", {
    query: {
      ...(params.unitToken ? { unit_token: params.unitToken } : {}),
      ...(params.unitId ? { unit_id: params.unitId } : {}),
    },
  });
  return data;
}

// ── Regression cases (C-17) ────────────────────────────────────────────────
// A regression case is a PINNED SNAPSHOT plus a machine-checkable expectation.
// Creating one from a finding is the door out of "this went wrong once" into
// "this can never go wrong again unnoticed" — the finding's `snapshot_ids` are
// collected server-side by the same C-13 rule that decides which snapshots the
// retention pin protects, so a case built from one stays reproducible.
// Admin-only, like wire replay: every later re-check spends real money.

export async function listRegressionCases(params: {
  snapshotId?: string;
  originFindingId?: string;
  status?: string;
} = {}): Promise<RegressionCase[]> {
  const { data } = await apiGet("/hindsight/regression-cases", {
    query: {
      ...(params.snapshotId ? { snapshot_id: params.snapshotId } : {}),
      ...(params.originFindingId ? { origin_finding_id: params.originFindingId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
  });
  return data;
}

/**
 * Turn one recorded call into a permanent test. The expectation is omitted on
 * purpose: the server's default (`not_worse_than_original`) is the only claim
 * that is true by construction for a snapshot a human just pointed at — it
 * compares a re-issue against the call's OWN recording. A stricter claim is an
 * edit on the case, never a guess made at creation time.
 */
export async function createRegressionCaseFromFinding(
  snapshotId: string,
  finding: { id: string; title: string },
): Promise<RegressionCase> {
  const { data } = await apiPost(
    buildPath("/hindsight/snapshots/{snapshot_id}/regression-case", {
      snapshot_id: snapshotId,
    }),
    {
      title: finding.title.slice(0, 300),
      origin: "finding",
      origin_finding_id: finding.id,
      notes: `Created from Hindsight finding ${finding.id}.`,
    },
  );
  return data;
}
