/**
 * Mandate Candidates — the client half of the live-candidate doors (PLAN §2.4).
 *
 * Every call goes through the contract-bound typed client, so the request and
 * response shapes are the GENERATED `LiveCandidate*` types — never a hand copy.
 * The payload (the sensitive half, A2) is read by the server under the viewer's
 * own identity; a viewer who may see the mandate but not the live conversation
 * gets `payload: null` + `payload_withheld_reason`, which the pair body shows.
 */

import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { components } from "@ai-matrx/agents/generated/api-types";

export type LiveCandidate = components["schemas"]["LiveCandidate"];
export type LiveCandidateRun = components["schemas"]["LiveCandidateRun"];
export type LiveCandidateRunPayload = components["schemas"]["LiveCandidateRunPayload"];
export type LiveCandidateDetail = components["schemas"]["LiveCandidateDetail"];
export type LiveCandidateToolDisposition =
  components["schemas"]["LiveCandidateToolDisposition"];
export type LiveCandidatePromoteResult = components["schemas"]["LiveCandidatePromoteResult"];
export type LiveCandidateVersionChoice = components["schemas"]["LiveCandidateVersionChoice"];

export async function fetchCandidateRun(runId: string): Promise<LiveCandidateRun> {
  const { data } = await apiGet(
    buildPath("/mandate-candidate-runs/{run_id}", { run_id: runId }),
  );
  return data;
}

export async function fetchCandidate(candidateId: string): Promise<LiveCandidateDetail> {
  const { data } = await apiGet(
    buildPath("/mandate-candidates/{candidate_id}", { candidate_id: candidateId }),
  );
  return data;
}

export async function recordCandidateAgreement(
  runId: string,
  agreement: "agree" | "disagree",
): Promise<LiveCandidateRun> {
  const { data } = await apiPost(
    buildPath("/mandate-candidate-runs/{run_id}/agreement", { run_id: runId }),
    { agreement },
  );
  return data.run;
}

export async function promoteCandidate(
  candidateId: string,
  versionId?: string | null,
): Promise<LiveCandidatePromoteResult> {
  const { data } = await apiPost(
    buildPath("/mandate-candidates/{candidate_id}/promote", { candidate_id: candidateId }),
    versionId ? { version_id: versionId } : {},
  );
  return data;
}

export async function putBackCandidate(candidateId: string): Promise<LiveCandidate> {
  const { data } = await apiPost(
    buildPath("/mandate-candidates/{candidate_id}/put-back", { candidate_id: candidateId }),
    undefined,
  );
  return data;
}

export async function discardCandidate(candidateId: string): Promise<LiveCandidate> {
  const { data } = await apiPost(
    buildPath("/mandate-candidates/{candidate_id}/discard", { candidate_id: candidateId }),
    {},
  );
  return data;
}
