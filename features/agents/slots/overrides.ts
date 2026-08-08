"use client";

/**
 * Agent-slot override service — the user/org half of the Agent Slots system:
 * browse every live slot, see the resolved agent (system default vs override,
 * with provenance), and create/edit/delete `agent.slot_binding` rows (agent
 * swap and/or settings-only `config_overrides`).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md
 *
 * Writes ride RLS directly (entity variant — the caller owns their user
 * binding; org admins hold editor on org rows via iam.has_access).
 *
 * 🚨 KNOWN GAP (loud, tracked in aidream docs/handoffs/content-ir-agent-slots.md
 * item 4): the aidream BIND ENDPOINT with server-side contract enforcement is
 * not live yet — aidream exposes only POST /agent-slots/{key}/test. Until it
 * ships, this surface enforces the slot contract CLIENT-side only
 * (checkSlotContract below, the proven compareContracts superset rule). When
 * the endpoint lands, route creates/updates through it and keep this check as
 * the instant pre-flight.
 */

import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import { isJsonObject, type JsonValue } from "@/types/json";
import { invalidateClientSlotCache } from "./service";

export type SlotDefinitionRow = Database["agent"]["Tables"]["slot_definition"]["Row"];
export type SlotBindingRow = Database["agent"]["Tables"]["slot_binding"]["Row"];

/** The slot's stored contract — `{required_variables, required_context_slots}`,
 * seeded from the default agent's declarations. */
export interface SlotContract {
  requiredVariables: string[];
  requiredContextSlots: string[];
}

export function parseSlotContract(contract: Json): SlotContract {
  const out: SlotContract = { requiredVariables: [], requiredContextSlots: [] };
  if (!isJsonObject(contract)) return out;
  const vars = contract.required_variables;
  if (Array.isArray(vars)) {
    out.requiredVariables = vars.filter((v): v is string => typeof v === "string");
  }
  const slots = contract.required_context_slots;
  if (Array.isArray(slots)) {
    out.requiredContextSlots = slots.filter((v): v is string => typeof v === "string");
  }
  return out;
}

/** Result of the client-side bind pre-flight — the research-proven superset
 * rule (`compareContracts`) applied to a slot's stored contract. */
export interface SlotContractCheck {
  matchedVariables: string[];
  missingVariables: string[];
  matchedSlots: string[];
  missingSlots: string[];
  passing: boolean;
}

export function checkSlotContract(
  contract: SlotContract,
  candidate: { variableNames: string[]; contextSlotKeys: string[] },
): SlotContractCheck {
  const candVars = new Set(candidate.variableNames);
  const candSlots = new Set(candidate.contextSlotKeys);
  const matchedVariables = contract.requiredVariables.filter((v) => candVars.has(v));
  const missingVariables = contract.requiredVariables.filter((v) => !candVars.has(v));
  const matchedSlots = contract.requiredContextSlots.filter((s) => candSlots.has(s));
  const missingSlots = contract.requiredContextSlots.filter((s) => !candSlots.has(s));
  return {
    matchedVariables,
    missingVariables,
    matchedSlots,
    missingSlots,
    passing: missingVariables.length === 0 && missingSlots.length === 0,
  };
}

export function isPlaceholderSlot(slot: SlotDefinitionRow): boolean {
  return isJsonObject(slot.metadata) && slot.metadata.migration_status === "placeholder";
}

export interface SlotAgentSummary {
  id: string;
  name: string;
  isArchived: boolean;
  agentType: string | null;
}

export interface SlotOverridesData {
  /** Live (non-placeholder) slots, ordered by slot_key. */
  slots: SlotDefinitionRow[];
  /** Every binding RLS lets this caller see (their own + their orgs'). */
  bindings: SlotBindingRow[];
  /** agent.definition rows referenced by any default or binding (by-id lookups
   * — legal under the canonical-selection law). */
  agentsById: Record<string, SlotAgentSummary>;
  /** For version-pinned defaults: version id → owning agent id. */
  versionAgentIds: Record<string, string>;
}

export async function fetchSlotOverridesData(): Promise<SlotOverridesData> {
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

  const slots = (slotsRes.data ?? []).filter((s) => !isPlaceholderSlot(s));
  const bindings = bindingsRes.data ?? [];

  const agentIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const slot of slots) {
    if (slot.default_agent_id) agentIds.add(slot.default_agent_id);
    if (slot.default_agent_version_id) versionIds.add(slot.default_agent_version_id);
  }
  for (const binding of bindings) {
    if (binding.agent_id) agentIds.add(binding.agent_id);
  }

  const versionAgentIds: Record<string, string> = {};
  if (versionIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("id, agent_id")
      .in("id", [...versionIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.agent_id) {
        versionAgentIds[row.id] = row.agent_id;
        agentIds.add(row.agent_id);
      }
    }
  }

  const agentsById: Record<string, SlotAgentSummary> = {};
  if (agentIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, name, is_archived, agent_type")
      .in("id", [...agentIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      agentsById[row.id] = {
        id: row.id,
        name: row.name ?? row.id,
        isArchived: Boolean(row.is_archived),
        agentType: row.agent_type,
      };
    }
  }

  return { slots, bindings, agentsById, versionAgentIds };
}

export interface SlotBindingInput {
  /** Swap the agent (floating — user-surface bindings never version-pin; the
   * client run path has no is_version channel). Null = settings-only. */
  agentId: string | null;
  /** LLMParams-shaped settings override (model, thinking_level, …). Null =
   * agent-swap-only. At least one of the two must be set (DB check). */
  configOverrides: Record<string, JsonValue> | null;
}

export async function createUserSlotBinding(
  slot: SlotDefinitionRow,
  userId: string,
  input: SlotBindingInput,
): Promise<SlotBindingRow> {
  const supabase = createClient();
  // organization_id is stamped by the platform org-default trigger for
  // authenticated writes (a user binding keys on the USER; its org column is
  // incidental). Org bindings pass the target org explicitly instead.
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_binding")
    .insert({
      slot_id: slot.id,
      principal_type: "user",
      subject_user_id: userId,
      agent_id: input.agentId,
      use_latest: input.agentId != null,
      config_overrides: input.configOverrides,
      visibility: "personal",
    } as Database["agent"]["Tables"]["slot_binding"]["Insert"])
    .select("*")
    .single();
  if (error) throw error;
  invalidateClientSlotCache(slot.slot_key);
  return data;
}

export async function createOrgSlotBinding(
  slot: SlotDefinitionRow,
  organizationId: string,
  input: SlotBindingInput,
): Promise<SlotBindingRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_binding")
    .insert({
      slot_id: slot.id,
      principal_type: "org",
      organization_id: organizationId,
      agent_id: input.agentId,
      use_latest: input.agentId != null,
      config_overrides: input.configOverrides,
      visibility: "internal",
    })
    .select("*")
    .single();
  if (error) throw error;
  invalidateClientSlotCache(slot.slot_key);
  return data;
}

export async function updateSlotBinding(
  bindingId: string,
  slotKey: string,
  input: SlotBindingInput & { isEnabled?: boolean },
): Promise<SlotBindingRow> {
  const supabase = createClient();
  const patch: Database["agent"]["Tables"]["slot_binding"]["Update"] = {
    agent_id: input.agentId,
    use_latest: input.agentId != null,
    config_overrides: input.configOverrides,
  };
  if (input.isEnabled != null) patch.is_enabled = input.isEnabled;
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_binding")
    .update(patch)
    .eq("id", bindingId)
    .select("*")
    .single();
  if (error) throw error;
  invalidateClientSlotCache(slotKey);
  return data;
}

export async function deleteSlotBinding(bindingId: string, slotKey: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("slot_binding")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", bindingId);
  if (error) throw error;
  invalidateClientSlotCache(slotKey);
}
