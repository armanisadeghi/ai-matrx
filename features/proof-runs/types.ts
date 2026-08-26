/**
 * features/proof-runs/types.ts
 *
 * The `/proof-runs` API contract (aidream `aidream/api/routers/proof_runs.py`).
 *
 * The PAYLOAD shapes are registered kinds and are NOT re-declared here — they
 * come from the generated artifact, which is the one source of truth for a
 * kind's fields (`pnpm shape:types`). What lives here is only what the kinds
 * do not cover: the request bodies and the row projections the run-history
 * table reads.
 */

import type {
  ProofAttestation,
  ProofCheckStatus,
  ProofResultKind,
} from "@/features/content-ir/kinds/generated/kinds.generated";

export type { ProofAttestation, ProofCheckStatus, ProofResultKind };

/** Registered kind slugs, so call sites never spell one by hand. */
export const PROOF_ATTESTATION_KIND = "proof_attestation" as const;
export const PROOF_CHECK_STATUS_KIND = "proof_check_status" as const;

/** How a caller asks for a run. `auto` lets the gate decide — the default. */
export type ProofRunMode = "auto" | "live" | "replay";

export interface ProofChecksResponse {
  checks: ProofCheckStatus[];
  month_to_date_usd: number;
  monthly_ceiling_usd: number;
}

/** One row of run history — the list view, without the proof bodies. */
export interface ProofRunSummary {
  id: string;
  check_id: string;
  check_slug: string;
  mode: "live" | "replay";
  trigger_source: string;
  status: string;
  verdict: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  cost_usd: number;
  total_tokens: number;
  provider_calls: number;
  summary: string;
  failure_reason: string | null;
}

/** One run with its proofs. `proofs` is a `proof_result` array on the wire. */
export interface ProofRunDetail extends ProofRunSummary {
  nonce: string;
  conversation_id: string | null;
  user_request_id: string | null;
  external_run_ref: string | null;
  replayed_from_run_id: string | null;
  recording_sha256: string | null;
  git_sha: string;
  environment: string;
  proofs: ProofResultKind[];
}

export interface ProofRunsResponse {
  runs: ProofRunSummary[];
}

/**
 * Rebuilds the `proof_attestation` kind payload from a stored run row, so the
 * history detail renders through the SAME kind component as a live run instead
 * of a second, drifting readout (THE CANONICAL COMPONENT LAW).
 */
export function attestationFromRun(run: ProofRunDetail): ProofAttestation {
  const proofs = run.proofs ?? [];
  const count = (status: string) =>
    proofs.filter((p) => p.status === status).length;
  return {
    __kind: "proof_attestation",
    verdict:
      run.verdict === "pass" || run.verdict === "fail"
        ? run.verdict
        : "inconclusive",
    strength: run.mode === "live" ? "live_receipts" : "replay_only",
    mode: run.mode,
    summary: run.summary,
    passed: count("passed"),
    failed: count("failed"),
    skipped: count("skipped"),
    cost_usd: run.cost_usd,
    total_tokens: run.total_tokens,
    provider_calls: run.provider_calls,
    conversation_id: run.conversation_id,
    user_request_id: run.user_request_id,
    proofs,
  };
}
