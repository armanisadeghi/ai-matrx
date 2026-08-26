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
import type { components } from "@/types/python-generated/api-types";
import { isJsonObject, toJsonRecord } from "@/types/json";

export type { ProofAttestation, ProofCheckStatus, ProofResultKind };

/** Registered kind slugs, so call sites never spell one by hand. */
export const PROOF_ATTESTATION_KIND = "proof_attestation" as const;
export const PROOF_CHECK_STATUS_KIND = "proof_check_status" as const;

/** How a caller asks for a run. `auto` lets the gate decide — the default. */
export type ProofRunMode = "auto" | "live" | "replay";

export type ProofChecksResponse = components["schemas"]["ProofChecksResponse"];

/** One row of run history — the list view, without the proof bodies. */
export type ProofRunSummary = components["schemas"]["ProofRunSummary"];

/** One run with its proofs. `proofs` is a `proof_result` array on the wire. */
export type ProofRunDetail = components["schemas"]["ProofRunDetail"];

export type ProofRunsResponse = components["schemas"]["ProofRunsResponse"];

function proofResultFromWire(
  value: Record<string, unknown>,
): ProofResultKind {
  const status =
    value.status === "passed" ||
    value.status === "failed" ||
    value.status === "skipped"
      ? value.status
      : undefined;
  return {
    __kind: "proof_result",
    id: typeof value.id === "string" ? value.id : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    detail: typeof value.detail === "string" ? value.detail : undefined,
    status,
    observed: isJsonObject(value.observed)
      ? toJsonRecord(value.observed)
      : undefined,
    required: typeof value.required === "boolean" ? value.required : undefined,
  };
}

/**
 * Rebuilds the `proof_attestation` kind payload from a stored run row, so the
 * history detail renders through the SAME kind component as a live run instead
 * of a second, drifting readout (THE CANONICAL COMPONENT LAW).
 */
export function attestationFromRun(run: ProofRunDetail): ProofAttestation {
  const proofs = (run.proofs ?? []).map(proofResultFromWire);
  const count = (status: string) =>
    proofs.filter((p) => p.status === status).length;
  const mode =
    run.mode === "live" || run.mode === "replay" ? run.mode : undefined;
  return {
    __kind: "proof_attestation",
    verdict:
      run.verdict === "pass" || run.verdict === "fail"
        ? run.verdict
        : "inconclusive",
    strength: mode === "live" ? "live_receipts" : "replay_only",
    mode,
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

// ---------------------------------------------------------------------------
// Saved scenarios — verification authored in the UI, no deploy
//
// These endpoints are newer than this repo's OpenAPI snapshot, so their shapes
// are declared here and will be superseded by `components["schemas"][...]` on
// the next `pnpm update-api-types` (the server is the author of both).
// ---------------------------------------------------------------------------

/** The rule vocabulary the expectation engine implements. */
export type ExpectationRule =
  | "contains_marker"
  | "excludes_marker"
  | "routes_exist"
  | "path_present"
  | "path_absent"
  | "path_equals"
  | "min_items"
  | "max_items"
  | "matches"
  | "judge";

/** One typed rule about the agent's output. */
export interface Expectation {
  id: string;
  rule: ExpectationRule;
  title?: string;
  /** Why this rule proves work happened — shown on the pass AND the fail. */
  proves?: string;
  /** Dotted path into the artifact; empty means the whole output as text. */
  path?: string;
  /** Marker NAME (not its value) — resolved per run from `{{marker:NAME}}`. */
  marker?: string;
  value?: unknown;
  count?: number;
  rubric?: string;
  required?: boolean;
}

export interface ProofScenario {
  slug: string;
  label: string;
  description: string;
  mandate_key: string;
  variables: Record<string, unknown>;
  allowed_routes: string[];
  expectations: Expectation[];
  user_input: string | null;
  is_active: boolean;
  live_every_seconds: number;
  max_cost_usd: number;
  /** The check slug this scenario runs as — `scenario:<slug>`. */
  check_slug: string;
}

export interface ScenariosResponse {
  scenarios: ProofScenario[];
}

/** One offered value a mandate's call site really delivers. */
export interface MandateOfferedValue {
  name: string;
  kind: string;
  guaranteed: boolean;
  description: string;
}

export interface MandateOption {
  mandate_key: string;
  label: string;
  description: string;
  output_kind: string | null;
  required_output_keys: string[];
  accepts_user_input: boolean;
  provision: string | null;
  offered_values: MandateOfferedValue[];
}

export interface ExpectationRuleHelp {
  rule: ExpectationRule;
  label: string;
  needs: string[];
  help: string;
}

export interface MandateCatalogResponse {
  mandates: MandateOption[];
  rules: ExpectationRuleHelp[];
}

/** A blank scenario, pre-filled with the shape a good one has. */
export function emptyScenario(): ProofScenario {
  return {
    slug: "",
    label: "",
    description: "",
    mandate_key: "",
    variables: {},
    allowed_routes: [],
    expectations: [],
    user_input: null,
    is_active: true,
    live_every_seconds: 21600,
    max_cost_usd: 0.75,
    check_slug: "",
  };
}
