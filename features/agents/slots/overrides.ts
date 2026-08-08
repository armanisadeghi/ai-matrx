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
 * READS ride RLS directly (slot definitions are public; RLS scopes bindings
 * to rows the caller can see). WRITES go through the ONE bind path — aidream
 * PUT/DELETE /agent-slots/{slot_key}/binding — because binding is genuine
 * compute: the server contract-checks the candidate agent (required
 * variables/context slots + output_schema vs the slot's required output
 * keys) at WRITE time and rejects with a 422 whose detail is shown to the
 * user VERBATIM. `checkSlotContract` below is the instant client-side
 * pre-flight (research's proven compareContracts superset rule); the server
 * check is the authority.
 */

import { createClient } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
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

/** Light single-slot fetch for the inline consumer picker: the slot row, the
 * system default agent's display name, and the caller's own user binding
 * (RLS returns only rows they can see). */
export interface SlotPickerData {
  slot: SlotDefinitionRow;
  defaultAgentId: string | null;
  defaultAgentName: string;
  myBinding: SlotBindingRow | null;
}

export async function fetchSlotPickerData(
  slotKey: string,
  userId: string,
): Promise<SlotPickerData> {
  const supabase = createClient();
  const { data: slot, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select("*")
    .eq("slot_key", slotKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!slot) {
    throw new Error(`agent slot "${slotKey}" not found — declare it server-side first`);
  }

  let defaultAgentId = slot.default_agent_id;
  if (!defaultAgentId && slot.default_agent_version_id) {
    const { data: version, error: versionError } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("agent_id")
      .eq("id", slot.default_agent_version_id)
      .maybeSingle();
    if (versionError) throw versionError;
    defaultAgentId = version?.agent_id ?? null;
  }

  let defaultAgentName = "(no default agent)";
  if (defaultAgentId) {
    // By-id lookup — legal under the canonical-selection law.
    const { data: agent, error: agentError } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, name")
      .eq("id", defaultAgentId)
      .maybeSingle();
    if (agentError) throw agentError;
    defaultAgentName = agent?.name ?? "(unknown agent)";
  }

  const { data: binding, error: bindingError } = await supabase
    .schema("agent")
    .from("slot_binding")
    .select("*")
    .eq("slot_id", slot.id)
    .eq("principal_type", "user")
    .eq("subject_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bindingError) throw bindingError;

  return {
    slot,
    defaultAgentId,
    defaultAgentName,
    myBinding: binding ?? null,
  };
}

export interface SlotBindingInput {
  /** Swap the agent (floating — user-surface bindings never version-pin; the
   * client run path has no is_version channel). Null = settings-only. */
  agentId: string | null;
  /** LLMParams-shaped settings override (model, thinking_level, …). Null =
   * agent-swap-only. At least one of the two must be set. */
  configOverrides: Record<string, JsonValue> | null;
}

export interface SlotBindingPrincipalInput {
  principalType: "user" | "org";
  /** The org being bound — REQUIRED for org principals (the caller must
   * administer it; the server verifies). Omit for user bindings: callApi
   * injects the ambient organization_id, which is incidental there (a user
   * binding keys on the USER — access never depends on the active org). */
  organizationId?: string;
}

/** Create or update the principal's binding for a slot through the ONE bind
 * path (aidream PUT, contract-enforced server-side). Throws with the server's
 * 422 detail verbatim on a contract violation. */
export async function putSlotBinding(
  dispatch: AppDispatch,
  slotKey: string,
  principal: SlotBindingPrincipalInput,
  input: SlotBindingInput & { isEnabled?: boolean },
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/binding",
      method: "PUT",
      pathParams: { slot_key: slotKey },
      body: {
        principal_type: principal.principalType,
        agent_id: input.agentId,
        agent_version_id: null,
        use_latest: input.agentId != null,
        config_overrides: input.configOverrides,
        is_enabled: input.isEnabled ?? true,
        ...(principal.organizationId
          ? { organization_id: principal.organizationId }
          : {}),
      },
    }),
  );
  if (result.error) throw new Error(result.error.message);
  invalidateClientSlotCache(slotKey);
}

/** Remove the principal's binding — back to the layer below (org default or
 * system default). Idempotent. */
export async function removeSlotBinding(
  dispatch: AppDispatch,
  slotKey: string,
  principal: SlotBindingPrincipalInput,
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/binding",
      method: "DELETE",
      pathParams: { slot_key: slotKey },
      body: {
        principal_type: principal.principalType,
        ...(principal.organizationId
          ? { organization_id: principal.organizationId }
          : {}),
      },
    }),
  );
  if (result.error) throw new Error(result.error.message);
  invalidateClientSlotCache(slotKey);
}
