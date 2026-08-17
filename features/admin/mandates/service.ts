"use client";

/**
 * Mandates admin service — direct supabase reads/writes on
 * agent.slot_definition / agent.slot_binding.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md
 *
 * Writes ride RLS: super admins hold editor on system-org rows via
 * iam.has_access (verified live 2026-08-07) — no bespoke RPC layer.
 */

import { createClient } from "@/utils/supabase/client";
import { invalidateMandateCache } from "@/features/agents/mandates/service";
import {
  versionSnapshotRowToAgentDefinition,
  type AgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/converters";
import type {
  AgentDefinition,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type { Database } from "@/types/database.types";
import { isJsonObject, toJsonRecord, type JsonObject } from "@/types/json";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

/** Mandate/exemplar rows are platform rows owned by the system org. */
const SYSTEM_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

export type MandateDefinitionRow =
  Database["agent"]["Tables"]["slot_definition"]["Row"];
export type MandateBindingRow = Database["agent"]["Tables"]["slot_binding"]["Row"];
export type MandateDefinitionUpdate =
  Database["agent"]["Tables"]["slot_definition"]["Update"];

export interface MandateAgentInfo {
  id: string;
  name: string;
  /** Current master version counter (agent.definition.version). */
  version: number | null;
  isArchived: boolean;
  /** 'builtin' = system agent. Anything else pinned as a mandate DEFAULT is a
   * defect — surface it loudly in the console. */
  agentType: string | null;
}

export interface MandateVersionInfo {
  id: string;
  agentId: string | null;
  versionNumber: number;
  name: string | null;
}

export interface MandateConsoleData {
  mandates: MandateDefinitionRow[];
  /** agent.definition rows referenced by any mandate default or binding. */
  agentsById: Record<string, MandateAgentInfo>;
  /** agent.definition_version rows referenced by any pinned default/binding. */
  versionsById: Record<string, MandateVersionInfo>;
  bindingsByMandateId: Record<string, MandateBindingRow[]>;
}

export async function fetchMandateConsoleData(): Promise<MandateConsoleData> {
  const supabase = createClient();

  const [mandatesRes, bindingsRes] = await Promise.all([
    supabase
      .schema("agent")
      .from("slot_definition")
      .select("*")
      .is("deleted_at", null)
      .order("slot_key"),
    supabase
      .schema("agent")
      .from("slot_binding")
      .select("*")
      .is("deleted_at", null)
      .order("created_at"),
  ]);
  if (mandatesRes.error) throw mandatesRes.error;
  if (bindingsRes.error) throw bindingsRes.error;
  const mandates = mandatesRes.data ?? [];
  const bindings = bindingsRes.data ?? [];

  const agentIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const mandate of mandates) {
    if (mandate.default_agent_id) agentIds.add(mandate.default_agent_id);
    if (mandate.default_agent_version_id)
      versionIds.add(mandate.default_agent_version_id);
  }
  for (const binding of bindings) {
    if (binding.agent_id) agentIds.add(binding.agent_id);
    if (binding.agent_version_id) versionIds.add(binding.agent_version_id);
  }

  const versionsById: Record<string, MandateVersionInfo> = {};
  if (versionIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("id, agent_id, version_number, name")
      .in("id", [...versionIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      versionsById[row.id] = {
        id: row.id,
        agentId: row.agent_id,
        versionNumber: row.version_number,
        name: row.name,
      };
      if (row.agent_id) agentIds.add(row.agent_id);
    }
  }

  const agentsById: Record<string, MandateAgentInfo> = {};
  if (agentIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, name, version, is_archived, agent_type")
      .in("id", [...agentIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      agentsById[row.id] = {
        id: row.id,
        name: row.name ?? row.id,
        version: row.version,
        isArchived: Boolean(row.is_archived),
        agentType: row.agent_type,
      };
    }
  }

  const bindingsByMandateId: Record<string, MandateBindingRow[]> = {};
  for (const binding of bindings) {
    (bindingsByMandateId[binding.slot_id] ??= []).push(binding);
  }

  return { mandates, agentsById, versionsById, bindingsByMandateId };
}

export async function updateMandateDefinition(
  mandateId: string,
  patch: Pick<
    MandateDefinitionUpdate,
    | "default_agent_id"
    | "default_agent_version_id"
    | "use_latest"
    | "is_enabled"
    | "label"
    | "description"
  >,
): Promise<MandateDefinitionRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .update(patch)
    .eq("id", mandateId)
    .select("*")
    .single();
  if (error) throw error;
  // Every definition write notifies the mandate invalidation bus, so any mounted
  // consumer — the mandates console, useMandate resolvers, pickers — refreshes
  // no matter which surface performed the rebind (console buttons, the pin
  // editor, or the Linked Agent Sync window).
  invalidateMandateCache(data.slot_key);
  return data;
}

/**
 * Variable definitions of ONE saved version — what a version-pinned mandate
 * actually runs. `agx_get_execution_minimal` reads the live definition only,
 * so scaffolding a bench form from it would ask for the LATEST agent's
 * variables while the run uses the pinned version's.
 */
export async function fetchVersionVariableDefinitions(
  versionId: string,
): Promise<VariableDefinition[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("variable_definitions")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  const raw: unknown = data?.variable_definitions;
  if (!Array.isArray(raw)) return null;
  return raw.filter(isVariableDefinition);
}

/** The column is open JSONB. Only `name` is load-bearing for a bench form;
 * every other field is read defensively by the canonical input component. */
function isVariableDefinition(value: unknown): value is VariableDefinition {
  return isJsonObject(value) && typeof value.name === "string";
}

/** Version history for one agent — for picking a pin. */
export async function fetchAgentVersions(
  agentId: string,
): Promise<MandateVersionInfo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("id, agent_id, version_number, name")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    name: row.name,
  }));
}

/**
 * Full saved-version snapshot as an `AgentDefinition` — for the drawer's
 * inline "what changed between the pinned version and latest" comparison.
 * Same RPC + converter the version-history pages use; returns null when the
 * requested version number has no saved snapshot.
 */
export async function fetchVersionSnapshotDefinition(
  agentId: string,
  versionNumber: number,
): Promise<AgentDefinition | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
    p_agent_id: agentId,
    p_version_number: versionNumber,
  });
  if (error) throw error;
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw) return null;
  return versionSnapshotRowToAgentDefinition(
    agentId,
    raw as unknown as AgentVersionSnapshot,
  );
}

// ── Out-of-scope pinned-agent identity (admin lookup) ────────────────────────

/** Identity of a pinned agent the admin's RLS scope cannot read directly. */
export interface PinnedAgentIdentity {
  id: string;
  name: string;
  agentType: string | null;
  isArchived: boolean;
  /** Master version counter, when known. */
  version: number | null;
  /** Set when the row is soft-deleted — the pin is pointing at a dead record. */
  deletedAt: string | null;
  /** Owner of a personal agent, best effort. */
  ownerEmail: string | null;
}

export interface PinnedAgentIdentityResult {
  /** null = the pinned row no longer exists at all. */
  agent: PinnedAgentIdentity | null;
  /** Version number behind a version pin, when the pin stores a version id. */
  pinnedVersionNumber: number | null;
  /** The builtin system twin in the agent's lineage, when one exists. */
  systemTwin: { id: string; name: string } | null;
}

function parsePinnedAgentIdentity(payload: unknown): PinnedAgentIdentityResult {
  if (!isJsonObject(payload)) {
    throw new Error("The pinned-agent lookup returned an invalid response.");
  }
  const rawAgent = payload.agent;
  let agent: PinnedAgentIdentity | null = null;
  if (isJsonObject(rawAgent) && typeof rawAgent.id === "string") {
    agent = {
      id: rawAgent.id,
      name: typeof rawAgent.name === "string" ? rawAgent.name : rawAgent.id,
      agentType:
        typeof rawAgent.agent_type === "string" ? rawAgent.agent_type : null,
      isArchived: rawAgent.is_archived === true,
      version: typeof rawAgent.version === "number" ? rawAgent.version : null,
      deletedAt:
        typeof rawAgent.deleted_at === "string" ? rawAgent.deleted_at : null,
      ownerEmail:
        typeof rawAgent.owner_email === "string" ? rawAgent.owner_email : null,
    };
  }
  const rawTwin = payload.system_twin;
  const systemTwin =
    isJsonObject(rawTwin) &&
    typeof rawTwin.id === "string" &&
    typeof rawTwin.name === "string"
      ? { id: rawTwin.id, name: rawTwin.name }
      : null;
  return {
    agent,
    pinnedVersionNumber:
      typeof payload.pinned_version_number === "number"
        ? payload.pinned_version_number
        : null,
    systemTwin,
  };
}

/**
 * Resolve WHO a mandate's pin points at even when the agent row is outside the
 * admin's RLS scope (another user's personal agent). Server-side super-admin
 * lookup — the sanctioned Next admin-route exception, same family as
 * `/api/admin/users` above. Never render the raw id instead of calling this.
 */
export async function fetchPinnedAgentIdentity(
  mandate: MandateDefinitionRow,
): Promise<PinnedAgentIdentityResult> {
  const params = new URLSearchParams();
  // Pass BOTH identifiers when present: agent_id resolves the identity, and
  // agent_version_id lets the route resolve the pinned version number — a
  // version-pinned unresolved pin must not lose its pinned-version badge.
  if (mandate.default_agent_id) {
    params.set("agent_id", mandate.default_agent_id);
  }
  if (mandate.default_agent_version_id) {
    params.set("agent_version_id", mandate.default_agent_version_id);
  }
  if ([...params.keys()].length === 0) {
    return { agent: null, pinnedVersionNumber: null, systemTwin: null };
  }
  const response = await fetch(
    `/api/admin/mandates/agent-identity?${params.toString()}`,
    { cache: "no-store" },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isJsonObject(payload) && typeof payload.error === "string"
        ? payload.error
        : "Failed to resolve the pinned agent.";
    throw new Error(message);
  }
  return parsePinnedAgentIdentity(payload);
}

/** Picker option shape. Options come from the canonical Redux agent slice
 * (`selectBuiltinAgents`) — NEVER from a raw table query. See FEATURE.md. */
export interface MandateAgentOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

// ── Test bench (exemplars + candidate runs) ──────────────────────────────────

export type MandateExemplarRow =
  Database["agent"]["Tables"]["slot_exemplar"]["Row"];

export async function fetchMandateExemplars(
  mandateId: string,
): Promise<MandateExemplarRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .select("*")
    .eq("slot_id", mandateId)
    .is("deleted_at", null)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createMandateExemplar(input: {
  mandateId: string;
  label: string;
  variables: JsonObject;
  userInput?: string | null;
}): Promise<MandateExemplarRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .insert({
      slot_id: input.mandateId,
      label: input.label,
      variables: input.variables,
      user_input: input.userInput ?? null,
      source: "manual",
      visibility: "internal",
      organization_id: SYSTEM_ORGANIZATION_ID,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Save one ad-hoc bench run as a brand-new test case: the inputs that produced
 * it become the exemplar, and the run itself becomes the reference — in ONE
 * insert, so a cold mandate goes from "cannot be benched" to "has a bar to beat"
 * in a single click.
 *
 * The run is written into `metadata.test_bench_results` in the SAME shape the
 * server persists (`MandateTestResult`), carrying its new `exemplar_id` and a
 * `promoted_to_reference_at` stamp — so it reads identically to a promoted
 * batch result in the history list and in the server's promote endpoint.
 */
export async function saveAdHocResultAsExemplar(input: {
  mandateId: string;
  label: string;
  variables: JsonObject;
  userInput?: string | null;
  result: MandateTestResponse;
}): Promise<MandateExemplarRow> {
  if (input.result.error) {
    throw new Error(
      "This run failed, so it cannot become a test case's reference output.",
    );
  }
  // Same bar the server's promote endpoint enforces — an empty reference is
  // not a bar anything can be judged against.
  if (!input.result.output) {
    throw new Error(
      "This run produced no output, so there is nothing to keep as the reference.",
    );
  }
  const supabase = createClient();
  const exemplarId = crypto.randomUUID();
  const promotedAt = new Date().toISOString();
  const persistedResult: JsonObject = {
    ...structuredCloneJson(input.result),
    exemplar_id: exemplarId,
    promoted_to_reference_at: promotedAt,
  };
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .insert({
      id: exemplarId,
      slot_id: input.mandateId,
      label: input.label,
      variables: input.variables,
      user_input: input.userInput ?? null,
      source: "manual",
      visibility: "internal",
      organization_id: SYSTEM_ORGANIZATION_ID,
      reference_output: input.result.output ?? "",
      reference_artifact: input.result.artifact ?? null,
      captured_agent_id:
        input.result.definition_agent_id ?? input.result.agent_id ?? null,
      captured_model_id: input.result.model_id ?? null,
      metadata: { test_bench_results: [persistedResult] },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** JSON round-trip so a generated response object lands in JSONB as data. */
function structuredCloneJson(value: unknown): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonObject(parsed)) {
    throw new Error("This run could not be serialized into a test case.");
  }
  return parsed;
}

export async function deleteMandateExemplar(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** All bench transport shapes come from aidream's generated OpenAPI contract. */
export type MandateTestCandidate = components["schemas"]["SlotCandidate"];
export type MandateTestBatchRequest =
  components["schemas"]["SlotTestBatchRequest"];
export type MandateTestBatchResponse =
  components["schemas"]["SlotTestBatchResponse"];
export type MandateTestResponse = components["schemas"]["SlotTestResult"];
export type MandateTestRequest = components["schemas"]["SlotTestRequest"];
export type MandateCodeTruth = components["schemas"]["SlotCodeTruth"];
export type MandateCodeTruthReport =
  components["schemas"]["SlotCodeTruthReport"];
export type MandateVariableVerdictRequest =
  components["schemas"]["SlotVariableVerdictRequest"];
export type MandateVariableResolution =
  components["schemas"]["VariableResolution"];
export type MandateVariableVerdict = components["schemas"]["VariableVerdict"];

const CODE_TRUTH_DRIFT = new Set(["code_only", "db_only", "diff", "match"]);
const CODE_TRUTH_RESOLUTION = new Set([
  "code_declaration_found",
  "code_exists_but_import_failed",
  "no_code_declaration_found",
]);

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Runtime validation at the Python boundary; the target type remains the
 * generated OpenAPI alias above, never a local response mirror. */
function isMandateCodeTruthReport(value: unknown): value is MandateCodeTruthReport {
  if (!isJsonObject(value)) return false;
  if (
    !Array.isArray(value.mandates) ||
    !isStringArray(value.import_failures) ||
    !isJsonObject(value.counts)
  ) {
    return false;
  }
  return value.mandates.every((mandate) => {
    if (!isJsonObject(mandate)) return false;
    if (
      typeof mandate.slot_key !== "string" ||
      typeof mandate.resolution !== "string" ||
      !CODE_TRUTH_RESOLUTION.has(mandate.resolution) ||
      typeof mandate.drift !== "string" ||
      !CODE_TRUTH_DRIFT.has(mandate.drift) ||
      !isStringArray(mandate.code_variables) ||
      !isStringArray(mandate.db_required_variables) ||
      !isStringArray(mandate.code_only_variables) ||
      !isStringArray(mandate.db_only_variables)
    ) {
      return false;
    }
    if (
      mandate.bound_agent_drift != null &&
      (typeof mandate.bound_agent_drift !== "string" ||
        !CODE_TRUTH_DRIFT.has(mandate.bound_agent_drift))
    ) {
      return false;
    }
    if (mandate.inputs != null) {
      if (
        !Array.isArray(mandate.inputs) ||
        !mandate.inputs.every(
          (field) =>
            isJsonObject(field) &&
            typeof field.name === "string" &&
            typeof field.mapped_name === "string" &&
            typeof field.type === "string" &&
            typeof field.required === "boolean",
        )
      ) {
        return false;
      }
    }
    if (mandate.call_sites != null) {
      if (
        !Array.isArray(mandate.call_sites) ||
        !mandate.call_sites.every(
          (site) =>
            isJsonObject(site) &&
            typeof site.source_file === "string" &&
            typeof site.line === "number" &&
            typeof site.passes_user_input === "boolean",
        )
      ) {
        return false;
      }
    }
    if (
      mandate.bound_agent != null &&
      (!isJsonObject(mandate.bound_agent) ||
        typeof mandate.bound_agent.id !== "string" ||
        typeof mandate.bound_agent.name !== "string" ||
        !isStringArray(mandate.bound_agent.declared_variables))
    ) {
      return false;
    }
    return true;
  });
}

/** Live code declarations from aidream's in-process NamedAgent registry.
 * This is compute/source inspection, so it correctly goes to aidream through
 * the typed client; `agent.slot_definition.contract` is only a drifted cache. */
export async function fetchMandateCodeTruthReport(
  dispatch: AppDispatch,
): Promise<MandateCodeTruthReport> {
  const response = await dispatch(
    callApi({
      path: "/agent-slots/code-truth",
      method: "GET",
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isMandateCodeTruthReport(response.data)) {
    throw new Error("Agent mandate code-truth returned an invalid report.");
  }
  return response.data;
}

/** A representative value with the code field's real type. The verdict API
 * judges availability, mapping, and type compatibility; it never needs or
 * receives a user's live value just to explain the wiring. */
function representativeCodeValue(
  field: components["schemas"]["CodeTruthField"],
): components["schemas"]["JsonValue"] {
  if (field.default_value !== undefined && field.default_value !== null) {
    return field.default_value;
  }
  const type = field.type.toLowerCase();
  if (type.includes("bool")) return true;
  if (
    type.includes("int") ||
    type.includes("float") ||
    type.includes("decimal") ||
    type.includes("number")
  ) {
    return 1;
  }
  if (type.includes("list") || type.includes("set") || type.includes("tuple")) {
    return [];
  }
  if (type.includes("dict") || type.includes("mapping")) return {};
  return "example value";
}

/** Ask aidream how the live code-side fields flow into the currently resolved
 * agent. Keys use `mapped_name`, matching NamedAgent.prepare_variables after
 * the class's real `variable_map` has been applied. */
export async function fetchMandateVariableVerdicts(
  dispatch: AppDispatch,
  codeTruth: MandateCodeTruth,
): Promise<MandateVariableResolution> {
  const codeValues: MandateVariableVerdictRequest["code_values"] = {};
  for (const field of codeTruth.inputs ?? []) {
    codeValues[field.mapped_name] = representativeCodeValue(field);
  }
  const body: MandateVariableVerdictRequest = { code_values: codeValues };
  const response = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/variable-verdicts",
      method: "POST",
      pathParams: { slot_key: codeTruth.slot_key },
      body,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!response.data) {
    throw new Error(
      `Agent mandate ${codeTruth.slot_key} returned no variable verdicts.`,
    );
  }
  return response.data;
}

/** Run the owner bench in one server batch. `callApi` supplies auth, selected
 * backend, diagnostics, and the generated request contract. */
export async function runMandateTests(
  dispatch: AppDispatch,
  mandateKey: string,
  request: MandateTestBatchRequest,
): Promise<MandateTestBatchResponse> {
  const response = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/tests",
      method: "POST",
      pathParams: { slot_key: mandateKey },
      body: request,
      // Batch responses do not send headers until every exemplar/candidate
      // cell has completed. Four exemplars × three columns already exceeds
      // 90 seconds in production, so the connection deadline must cover the
      // bounded batch rather than the duration of one agent run.
      connectTimeoutMs: 10 * 60_000,
      totalTimeoutMs: null,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isMandateTestBatchResponse(response.data)) {
    throw new Error("Agent mandate bench returned an invalid batch response.");
  }
  return response.data;
}

/**
 * Run ONE candidate against inputs typed right now, with no stored test case —
 * the "Try it now" path that makes a cold mandate (no exemplars) benchable at all.
 * The server persists nothing for an ad-hoc run; `saveAdHocResultAsExemplar`
 * turns a good one into the mandate's first real test case.
 */
export async function runMandateAdHocTest(
  dispatch: AppDispatch,
  mandateKey: string,
  input: {
    variables: JsonObject;
    userInput?: string | null;
    candidate?: MandateTestCandidate;
  },
): Promise<MandateTestResponse> {
  const body: MandateTestRequest = {
    variables: toJsonRecord(input.variables),
    user_input: input.userInput?.trim() ? input.userInput : null,
    candidate: input.candidate,
  };
  const response = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/test",
      method: "POST",
      pathParams: { slot_key: mandateKey },
      body,
      // One agent run, not a batch — but a slow model on a long prompt still
      // outruns the default connect deadline, and this endpoint sends no
      // headers until the run has finished.
      connectTimeoutMs: 5 * 60_000,
      totalTimeoutMs: null,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isMandateTestResult(response.data)) {
    throw new Error("Agent mandate bench returned an invalid run result.");
  }
  return response.data;
}

function isStructuralVerdict(value: unknown): boolean {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.checked === "boolean" &&
    Array.isArray(value.errors) &&
    value.errors.every((entry) => typeof entry === "string")
  );
}

/** Runtime boundary for generated test results stored inside open JSONB.
 * `exemplar_id` is null on an AD-HOC run (a "Try it now" run that has no
 * stored test case yet) and a string on every persisted one. */
export function isMandateTestResult(value: unknown): value is MandateTestResponse {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    typeof value.slot_key === "string" &&
    (typeof value.exemplar_id === "string" || value.exemplar_id == null) &&
    typeof value.candidate_id === "string" &&
    typeof value.candidate_label === "string" &&
    typeof value.provenance === "string" &&
    typeof value.is_version === "boolean" &&
    typeof value.output === "string" &&
    typeof value.duration_ms === "number" &&
    isStructuralVerdict(value.structural)
  );
}

function isMandateTestBatchResponse(
  value: unknown,
): value is MandateTestBatchResponse {
  if (!isJsonObject(value)) return false;
  if (
    typeof value.slot_key !== "string" ||
    typeof value.exemplar_count !== "number" ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.exemplars)
  ) {
    return false;
  }
  return value.exemplars.every(
    (entry) =>
      isJsonObject(entry) &&
      typeof entry.exemplar_id === "string" &&
      typeof entry.exemplar_label === "string" &&
      Array.isArray(entry.results) &&
      entry.results.every(isMandateTestResult),
  );
}

/** Persisted histories are newest first. Malformed legacy entries are ignored
 * loudly instead of crashing the entire owner bench. */
export function parseMandateTestHistory(metadata: unknown): MandateTestResponse[] {
  if (!isJsonObject(metadata)) {
    console.error("[mandates] exemplar metadata is not an object");
    return [];
  }
  const raw = metadata.test_bench_results;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    console.error("[mandates] metadata.test_bench_results is not an array");
    return [];
  }
  const parsed: MandateTestResponse[] = [];
  for (const entry of raw) {
    if (isMandateTestResult(entry)) parsed.push(entry);
  }
  if (parsed.length !== raw.length) {
    console.error(
      `[mandates] ignored ${raw.length - parsed.length} malformed persisted bench result(s)`,
    );
  }
  return parsed.sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

function metadataWithUpdatedResult(
  metadata: unknown,
  resultId: string,
  patch: JsonObject,
): JsonObject {
  if (!isJsonObject(metadata)) {
    throw new Error("Exemplar metadata is malformed; result was not changed.");
  }
  const raw = metadata.test_bench_results;
  if (!Array.isArray(raw)) {
    throw new Error("This exemplar has no persisted bench history.");
  }
  let found = false;
  const next = raw.map((entry) => {
    if (!isJsonObject(entry) || entry.id !== resultId) return entry;
    found = true;
    return { ...entry, ...patch };
  });
  if (!found) throw new Error(`Bench result ${resultId} was not found.`);
  return { ...metadata, test_bench_results: next };
}

async function fetchExemplarForResultUpdate(
  exemplarId: string,
): Promise<MandateExemplarRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .select("*")
    .eq("id", exemplarId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

/** Verdict notes are owner judgment, so they update the exemplar directly. */
export async function saveMandateTestVerdictNote(
  exemplarId: string,
  resultId: string,
  verdictNote: string,
): Promise<MandateExemplarRow> {
  const current = await fetchExemplarForResultUpdate(exemplarId);
  const metadata = metadataWithUpdatedResult(current.metadata, resultId, {
    verdict_note: verdictNote.trim() || null,
  });
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .update({ metadata })
    .eq("id", exemplarId)
    .eq("updated_at", current.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "This exemplar changed while the verdict was saving. Reload and try again.",
    );
  }
  return data;
}

/** Promote one concrete run into the exemplar's owner-approved reference. */
export async function promoteMandateTestResult(
  exemplarId: string,
  result: MandateTestResponse,
): Promise<MandateExemplarRow> {
  if (!result.id) {
    throw new Error(
      "This result has no persisted identity and cannot be promoted.",
    );
  }
  const current = await fetchExemplarForResultUpdate(exemplarId);
  const promotedAt = new Date().toISOString();
  const metadata = metadataWithUpdatedResult(current.metadata, result.id, {
    promoted_to_reference_at: promotedAt,
  });
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .update({
      metadata,
      reference_output: result.output,
      reference_artifact: result.artifact ?? null,
      captured_agent_id: result.definition_agent_id ?? result.agent_id ?? null,
      captured_model_id: result.model_id ?? null,
    })
    .eq("id", exemplarId)
    .eq("updated_at", current.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "This exemplar changed while the reference was saving. Reload and try again.",
    );
  }
  return data;
}

/** Resolve the mandate's default agent even when the pin stores only a version. */
export async function resolveMandateDefaultAgentId(
  mandate: MandateDefinitionRow,
): Promise<string | null> {
  if (mandate.default_agent_id) return mandate.default_agent_id;
  if (!mandate.default_agent_version_id) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("agent_id")
    .eq("id", mandate.default_agent_version_id)
    .single();
  if (error) throw error;
  return data.agent_id;
}
