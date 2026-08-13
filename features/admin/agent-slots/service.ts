"use client";

/**
 * Agent Slots admin service — direct supabase reads/writes on
 * agent.slot_definition / agent.slot_binding.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md
 *
 * Writes ride RLS: super admins hold editor on system-org rows via
 * iam.has_access (verified live 2026-08-07) — no bespoke RPC layer.
 */

import { createClient } from "@/utils/supabase/client";
import { invalidateClientSlotCache } from "@/features/agents/slots/service";
import {
  versionSnapshotRowToAgentDefinition,
  type AgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/converters";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { Database } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import type {
  AdminOrganizationRow,
  AdminUserRow,
} from "@/features/admin/users/types";

/** Slot/exemplar rows are platform rows owned by the system org. */
const SYSTEM_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

export type SlotDefinitionRow =
  Database["agent"]["Tables"]["slot_definition"]["Row"];
export type SlotBindingRow = Database["agent"]["Tables"]["slot_binding"]["Row"];
export type SlotDefinitionUpdate =
  Database["agent"]["Tables"]["slot_definition"]["Update"];

export interface SlotAgentInfo {
  id: string;
  name: string;
  /** Current master version counter (agent.definition.version). */
  version: number | null;
  isArchived: boolean;
  /** 'builtin' = system agent. Anything else pinned as a slot DEFAULT is a
   * defect — surface it loudly in the console. */
  agentType: string | null;
}

export interface SlotVersionInfo {
  id: string;
  agentId: string | null;
  versionNumber: number;
  name: string | null;
}

export interface SlotConsoleData {
  slots: SlotDefinitionRow[];
  /** agent.definition rows referenced by any slot default or binding. */
  agentsById: Record<string, SlotAgentInfo>;
  /** agent.definition_version rows referenced by any pinned default/binding. */
  versionsById: Record<string, SlotVersionInfo>;
  bindingsBySlotId: Record<string, SlotBindingRow[]>;
}

export async function fetchSlotConsoleData(): Promise<SlotConsoleData> {
  const supabase = createClient();

  const [slotsRes, bindingsRes] = await Promise.all([
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
  if (slotsRes.error) throw slotsRes.error;
  if (bindingsRes.error) throw bindingsRes.error;
  const slots = slotsRes.data ?? [];
  const bindings = bindingsRes.data ?? [];

  const agentIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const slot of slots) {
    if (slot.default_agent_id) agentIds.add(slot.default_agent_id);
    if (slot.default_agent_version_id)
      versionIds.add(slot.default_agent_version_id);
  }
  for (const binding of bindings) {
    if (binding.agent_id) agentIds.add(binding.agent_id);
    if (binding.agent_version_id) versionIds.add(binding.agent_version_id);
  }

  const versionsById: Record<string, SlotVersionInfo> = {};
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

  const agentsById: Record<string, SlotAgentInfo> = {};
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

  const bindingsBySlotId: Record<string, SlotBindingRow[]> = {};
  for (const binding of bindings) {
    (bindingsBySlotId[binding.slot_id] ??= []).push(binding);
  }

  return { slots, agentsById, versionsById, bindingsBySlotId };
}

export async function updateSlotDefinition(
  slotId: string,
  patch: Pick<
    SlotDefinitionUpdate,
    | "default_agent_id"
    | "default_agent_version_id"
    | "use_latest"
    | "is_enabled"
    | "label"
    | "description"
  >,
): Promise<SlotDefinitionRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .update(patch)
    .eq("id", slotId)
    .select("*")
    .single();
  if (error) throw error;
  // Every definition write notifies the slot invalidation bus, so any mounted
  // consumer — the slots console, useAgentSlot resolvers, pickers — refreshes
  // no matter which surface performed the repin (console buttons, the pin
  // editor, or the Linked Agent Sync window).
  invalidateClientSlotCache(data.slot_key);
  return data;
}

/** Version history for one agent — for picking a pin. */
export async function fetchAgentVersions(
  agentId: string,
): Promise<SlotVersionInfo[]> {
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
 * Resolve WHO a slot's pin points at even when the agent row is outside the
 * admin's RLS scope (another user's personal agent). Server-side super-admin
 * lookup — the sanctioned Next admin-route exception, same family as
 * `/api/admin/users` above. Never render the raw id instead of calling this.
 */
export async function fetchPinnedAgentIdentity(
  slot: SlotDefinitionRow,
): Promise<PinnedAgentIdentityResult> {
  const params = new URLSearchParams();
  // Pass BOTH identifiers when present: agent_id resolves the identity, and
  // agent_version_id lets the route resolve the pinned version number — a
  // version-pinned unresolved pin must not lose its pinned-version badge.
  if (slot.default_agent_id) {
    params.set("agent_id", slot.default_agent_id);
  }
  if (slot.default_agent_version_id) {
    params.set("agent_version_id", slot.default_agent_version_id);
  }
  if ([...params.keys()].length === 0) {
    return { agent: null, pinnedVersionNumber: null, systemTwin: null };
  }
  const response = await fetch(
    `/api/admin/agent-slots/agent-identity?${params.toString()}`,
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
export interface SlotAgentOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

// ── Test bench (exemplars + candidate runs) ──────────────────────────────────

export type SlotExemplarRow =
  Database["agent"]["Tables"]["slot_exemplar"]["Row"];

export async function fetchSlotExemplars(
  slotId: string,
): Promise<SlotExemplarRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .select("*")
    .eq("slot_id", slotId)
    .is("deleted_at", null)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createSlotExemplar(input: {
  slotId: string;
  label: string;
  variables: JsonObject;
  userInput?: string | null;
}): Promise<SlotExemplarRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .insert({
      slot_id: input.slotId,
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

export async function deleteSlotExemplar(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** All bench transport shapes come from aidream's generated OpenAPI contract. */
export type SlotTestCandidate = components["schemas"]["SlotCandidate"];
export type SlotTestBatchRequest =
  components["schemas"]["SlotTestBatchRequest"];
export type SlotTestBatchResponse =
  components["schemas"]["SlotTestBatchResponse"];
export type SlotTestResponse = components["schemas"]["SlotTestResult"];
export type SlotTestPrincipal = components["schemas"]["SlotTestPrincipal"];

/** Run the owner bench in one server batch. `callApi` supplies auth, selected
 * backend, diagnostics, and the generated request contract. */
export async function runSlotTests(
  dispatch: AppDispatch,
  slotKey: string,
  request: SlotTestBatchRequest,
): Promise<SlotTestBatchResponse> {
  const response = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/tests",
      method: "POST",
      pathParams: { slot_key: slotKey },
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
  if (!isSlotTestBatchResponse(response.data)) {
    throw new Error("Agent slot bench returned an invalid batch response.");
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

/** Runtime boundary for generated test results stored inside open JSONB. */
export function isSlotTestResult(value: unknown): value is SlotTestResponse {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    typeof value.slot_key === "string" &&
    typeof value.exemplar_id === "string" &&
    typeof value.candidate_id === "string" &&
    typeof value.candidate_label === "string" &&
    typeof value.provenance === "string" &&
    typeof value.is_version === "boolean" &&
    typeof value.output === "string" &&
    typeof value.duration_ms === "number" &&
    isStructuralVerdict(value.structural)
  );
}

function isSlotTestBatchResponse(
  value: unknown,
): value is SlotTestBatchResponse {
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
      entry.results.every(isSlotTestResult),
  );
}

/** Persisted histories are newest first. Malformed legacy entries are ignored
 * loudly instead of crashing the entire owner bench. */
export function parseSlotTestHistory(metadata: unknown): SlotTestResponse[] {
  if (!isJsonObject(metadata)) {
    console.error("[agent-slots] exemplar metadata is not an object");
    return [];
  }
  const raw = metadata.test_bench_results;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    console.error("[agent-slots] metadata.test_bench_results is not an array");
    return [];
  }
  const parsed: SlotTestResponse[] = [];
  for (const entry of raw) {
    if (isSlotTestResult(entry)) parsed.push(entry);
  }
  if (parsed.length !== raw.length) {
    console.error(
      `[agent-slots] ignored ${raw.length - parsed.length} malformed persisted bench result(s)`,
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
): Promise<SlotExemplarRow> {
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
export async function saveSlotTestVerdictNote(
  exemplarId: string,
  resultId: string,
  verdictNote: string,
): Promise<SlotExemplarRow> {
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
export async function promoteSlotTestResult(
  exemplarId: string,
  result: SlotTestResponse,
): Promise<SlotExemplarRow> {
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

export interface SlotBenchPrincipalDirectory {
  users: AdminUserRow[];
  organizations: AdminOrganizationRow[];
}

/** Reuse the admin's canonical account/org directories; these Next-only
 * secret-token reads are the intentional exception to direct Supabase data. */
export async function fetchSlotBenchPrincipalDirectory(): Promise<SlotBenchPrincipalDirectory> {
  const [usersResponse, organizationsResponse] = await Promise.all([
    fetch("/api/admin/users", { cache: "no-store" }),
    fetch("/api/admin/users/organizations", { cache: "no-store" }),
  ]);
  const usersPayload: unknown = await usersResponse.json();
  const organizationsPayload: unknown = await organizationsResponse.json();
  if (!usersResponse.ok) throw new Error("Failed to load the user directory.");
  if (!organizationsResponse.ok) {
    throw new Error("Failed to load the organization directory.");
  }
  if (
    !isJsonObject(usersPayload) ||
    !Array.isArray(usersPayload.users) ||
    !isJsonObject(organizationsPayload) ||
    !isJsonObject(organizationsPayload.directory) ||
    !Array.isArray(organizationsPayload.directory.organizations)
  ) {
    throw new Error("The principal directory returned an invalid response.");
  }
  const users: AdminUserRow[] = [];
  for (const user of usersPayload.users) {
    if (isAdminUserRow(user)) users.push(user);
  }
  const organizations: AdminOrganizationRow[] = [];
  for (const organization of organizationsPayload.directory.organizations) {
    if (isAdminOrganizationRow(organization)) {
      organizations.push(organization);
    }
  }
  return { users, organizations };
}

function isAdminUserRow(value: unknown): value is AdminUserRow {
  return (
    isJsonObject(value) &&
    typeof value.id === "string" &&
    (typeof value.email === "string" || value.email === null) &&
    Array.isArray(value.organizations)
  );
}

function isAdminOrganizationRow(value: unknown): value is AdminOrganizationRow {
  return (
    isJsonObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

/** Resolve the slot's default agent even when the pin stores only a version. */
export async function resolveSlotDefaultAgentId(
  slot: SlotDefinitionRow,
): Promise<string | null> {
  if (slot.default_agent_id) return slot.default_agent_id;
  if (!slot.default_agent_version_id) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("agent_id")
    .eq("id", slot.default_agent_version_id)
    .single();
  if (error) throw error;
  return data.agent_id;
}
