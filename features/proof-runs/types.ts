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

function proofResultFromWire(value: Record<string, unknown>): ProofResultKind {
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
// Saved scenarios — verification authored in the UI, no deploy.
// The server contract is now present in the generated OpenAPI artifact.
// ---------------------------------------------------------------------------

/** The rule vocabulary the expectation engine implements. */
export type ExpectationRule = components["schemas"]["Expectation"]["rule"];

/** One typed rule about the agent's output. */
export type Expectation = components["schemas"]["Expectation"];

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

export type ScenariosResponse = components["schemas"]["ScenariosResponse"];

export interface ProofScenariosResponse {
  scenarios: ProofScenario[];
}

/** One offered value a mandate's call site really delivers. */
export interface MandateOfferedValue {
  name: string;
  kind: string;
  guaranteed: boolean;
  description: string;
}

export type MandateOption = components["schemas"]["MandateOption"];

export interface ProofMandateOption {
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

export type MandateCatalogResponse =
  components["schemas"]["MandateCatalogResponse"];

export interface ProofMandateCatalogResponse {
  mandates: ProofMandateOption[];
  rules: ExpectationRuleHelp[];
}

function normalizeScenario(
  row: components["schemas"]["ScenarioRow"],
): ProofScenario {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    mandate_key: row.mandate_key,
    variables: row.variables ?? {},
    allowed_routes: row.allowed_routes ?? [],
    expectations: row.expectations ?? [],
    user_input: row.user_input ?? null,
    is_active: row.is_active ?? true,
    live_every_seconds: row.live_every_seconds ?? 21600,
    max_cost_usd: row.max_cost_usd ?? 0.75,
    check_slug: row.check_slug ?? `scenario:${row.slug}`,
  };
}

export function normalizeScenariosResponse(
  response: ScenariosResponse,
): ProofScenariosResponse {
  return { scenarios: (response.scenarios ?? []).map(normalizeScenario) };
}

export function normalizeSavedScenario(
  row: components["schemas"]["ScenarioRow"],
): ProofScenario {
  return normalizeScenario(row);
}

function normalizeOfferedValue(value: unknown): MandateOfferedValue | null {
  if (!isJsonObject(value)) return null;
  if (
    typeof value.name !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.guaranteed !== "boolean" ||
    typeof value.description !== "string"
  ) {
    return null;
  }
  return {
    name: value.name,
    kind: value.kind,
    guaranteed: value.guaranteed,
    description: value.description,
  };
}

function normalizeRule(value: unknown): ExpectationRule | null {
  switch (value) {
    case "contains_marker":
    case "excludes_marker":
    case "routes_exist":
    case "path_present":
    case "path_absent":
    case "path_equals":
    case "min_items":
    case "max_items":
    case "matches":
    case "judge":
      return value;
    default:
      return null;
  }
}

function normalizeRuleHelp(value: unknown): ExpectationRuleHelp | null {
  if (!isJsonObject(value)) return null;
  const rule = normalizeRule(value.rule);
  if (
    !rule ||
    typeof value.label !== "string" ||
    !Array.isArray(value.needs) ||
    !value.needs.every((entry) => typeof entry === "string") ||
    typeof value.help !== "string"
  ) {
    return null;
  }
  return { rule, label: value.label, needs: value.needs, help: value.help };
}

export function normalizeMandateCatalogResponse(
  response: MandateCatalogResponse,
): ProofMandateCatalogResponse {
  return {
    mandates: (response.mandates ?? []).map((mandate) => ({
      mandate_key: mandate.mandate_key,
      label: mandate.label,
      description: mandate.description ?? "",
      output_kind: mandate.output_kind ?? null,
      required_output_keys: mandate.required_output_keys ?? [],
      accepts_user_input: mandate.accepts_user_input ?? true,
      provision: mandate.provision ?? null,
      offered_values: (mandate.offered_values ?? [])
        .map(normalizeOfferedValue)
        .filter((value): value is MandateOfferedValue => value !== null),
    })),
    rules: (response.rules ?? [])
      .map(normalizeRuleHelp)
      .filter((value): value is ExpectationRuleHelp => value !== null),
  };
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
