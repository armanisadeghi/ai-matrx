"use client";

// features/mandates/candidate-dialog/api.ts
//
// THE LIVE-CANDIDATE DOORS, as the list tab, the set dialog and the impact /
// bench buttons call them (Mandate Candidates, PLAN §2.4; aidream
// `aidream/api/routers/mandate_candidates.py`). Types are the generated
// `LiveCandidate*` schemas — never re-declared here.
//
// A refusal is a RESULT (P9): every door refuses with a stable code and a
// sentence written for a person (`mandate_refusal` envelope → `user_message`).
// `LiveCandidateRefusal` carries both so a screen keeps the sentence in place
// instead of flashing it in a toast.

import { callApi } from "@/lib/api/call-api";
import { serverRefusal } from "@/lib/progress/failureSentence";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@ai-matrx/agents/generated/api-types";
import { refusalCode } from "@/features/mandates/test-run";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";

export type LiveCandidate = components["schemas"]["LiveCandidate"];
export type LiveCandidateRun = components["schemas"]["LiveCandidateRun"];
export type LiveCandidatesResponse = components["schemas"]["LiveCandidatesResponse"];
export type LiveCandidateDetail = components["schemas"]["LiveCandidateDetail"];
export type LiveCandidateForecast = components["schemas"]["LiveCandidateForecast"];
export type LiveCandidateSetRequest = components["schemas"]["LiveCandidateSetRequest"];
export type LiveCandidatePromoteResult = components["schemas"]["LiveCandidatePromoteResult"];
export type CandidateRung = LiveCandidateSetRequest["rung"];

/** The doors the taps cover (PLAN §2.3); any other forecast key is uncovered (§4). */
export const COVERED_DOORS: readonly string[] = [
  "chat_start",
  "run_mandate",
  "batch_submit",
  "run_mandated",
  "workflow_step",
];

export class LiveCandidateRefusal extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, status: number | null, code: string | null) {
    super(message);
    this.name = "LiveCandidateRefusal";
    this.status = status;
    this.code = code;
  }
}

/**
 * The sentence a screen prints for any failure of these doors — the server's
 * own words through the one failure-sentence rule (no trace id, no machine
 * text). No remedy is appended: each refusal already says what to do.
 */
export function candidateFailureSentence(error: unknown): string {
  return serverRefusal(error, { remedy: "" }).text;
}

function refusalOf(
  error: { message: string; status?: number; code?: string; serverDetail?: unknown },
): LiveCandidateRefusal {
  return new LiveCandidateRefusal(
    error.message,
    error.status ?? null,
    error.code ?? refusalCode(error.serverDetail),
  );
}

/** Refusals these doors write on purpose — handled on screen, never a system_error. */
const EXPECTED = [403, 404, 409, 422] as const;

export async function fetchLiveCandidates(
  dispatch: AppDispatch,
  mandateKey: AnyMandateKey,
): Promise<LiveCandidatesResponse> {
  const response = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/candidates",
      method: "GET",
      pathParams: { mandate_key: mandateKey },
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidatesResponse;
}

export async function setLiveCandidate(
  dispatch: AppDispatch,
  mandateKey: AnyMandateKey,
  body: LiveCandidateSetRequest,
): Promise<components["schemas"]["LiveCandidate"]> {
  const response = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/candidates",
      method: "POST",
      pathParams: { mandate_key: mandateKey },
      body,
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidate;
}

export async function fetchLiveCandidate(
  dispatch: AppDispatch,
  candidateId: string,
): Promise<LiveCandidateDetail> {
  const response = await dispatch(
    callApi({
      path: "/mandate-candidates/{candidate_id}",
      method: "GET",
      pathParams: { candidate_id: candidateId },
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidateDetail;
}

export async function promoteLiveCandidate(
  dispatch: AppDispatch,
  candidateId: string,
  body: { note?: string | null; version_id?: string | null } = {},
): Promise<LiveCandidatePromoteResult> {
  const response = await dispatch(
    callApi({
      path: "/mandate-candidates/{candidate_id}/promote",
      method: "POST",
      pathParams: { candidate_id: candidateId },
      body,
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidatePromoteResult;
}

export async function putBackLiveCandidate(
  dispatch: AppDispatch,
  candidateId: string,
): Promise<LiveCandidate> {
  const response = await dispatch(
    callApi({
      path: "/mandate-candidates/{candidate_id}/put-back",
      method: "POST",
      pathParams: { candidate_id: candidateId },
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidate;
}

export async function discardLiveCandidate(
  dispatch: AppDispatch,
  candidateId: string,
  note?: string | null,
): Promise<LiveCandidate> {
  const response = await dispatch(
    callApi({
      path: "/mandate-candidates/{candidate_id}/discard",
      method: "POST",
      pathParams: { candidate_id: candidateId },
      body: { note: note ?? null },
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (response.error) throw refusalOf(response.error);
  return response.data as LiveCandidate;
}
