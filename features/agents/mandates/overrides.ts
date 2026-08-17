"use client";

/**
 * Agent-mandate override service — the user/org half of the Mandates system:
 * browse every live mandate, see the resolved agent (system default vs override,
 * with provenance), and create/edit/delete `agent.slot_binding` rows (agent
 * swap and/or settings-only `config_overrides`).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md
 *
 * READS ride RLS directly (mandate definitions are public; RLS scopes bindings
 * to rows the caller can see). WRITES go through the ONE bind path — aidream
 * PUT/DELETE /agent-slots/{slot_key}/binding — because binding is genuine
 * compute: the server contract-checks the candidate agent (required
 * variables/context slots + output_schema vs the mandate's required output
 * keys) at WRITE time and rejects with a 422 whose detail is shown to the
 * user VERBATIM. `compareStoredContract` (../contract-compare.ts) is the
 * instant client-side pre-flight (research's proven compareContracts
 * superset rule); the server check is the authority.
 */

import { createClient } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { Database, Json } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";
import { invalidateMandateCache } from "./service";

export type MandateDefinitionRow = Database["agent"]["Tables"]["slot_definition"]["Row"];
export type MandateBindingRow = Database["agent"]["Tables"]["slot_binding"]["Row"];

/** The mandate's stored contract — `{required_variables, required_context_slots,
 * required_output_keys}`, seeded from the default agent's declarations.
 * `requiredOutputKeys` is the mandate's OUTPUT promise: the keys any bound
 * agent's structured output must produce (contract-checked server-side at
 * bind time). */
export interface MandateContract {
  requiredVariables: string[];
  requiredContextSlots: string[];
  requiredOutputKeys: string[];
}

export function parseMandateContract(contract: Json): MandateContract {
  const out: MandateContract = {
    requiredVariables: [],
    requiredContextSlots: [],
    requiredOutputKeys: [],
  };
  if (!isJsonObject(contract)) return out;
  const vars = contract.required_variables;
  if (Array.isArray(vars)) {
    out.requiredVariables = vars.filter((v): v is string => typeof v === "string");
  }
  const slots = contract.required_context_slots;
  if (Array.isArray(slots)) {
    out.requiredContextSlots = slots.filter((v): v is string => typeof v === "string");
  }
  const outputKeys = contract.required_output_keys;
  if (Array.isArray(outputKeys)) {
    out.requiredOutputKeys = outputKeys.filter(
      (v): v is string => typeof v === "string",
    );
  }
  return out;
}

export function isPlaceholderMandate(mandate: MandateDefinitionRow): boolean {
  return isJsonObject(mandate.metadata) && mandate.metadata.migration_status === "placeholder";
}

export interface MandateAgentSummary {
  id: string;
  name: string;
  isArchived: boolean;
  agentType: string | null;
}

export interface MandateOverridesData {
  /** Live (non-placeholder) mandates, ordered by slot_key. */
  mandates: MandateDefinitionRow[];
  /** Every binding RLS lets this caller see (their own + their orgs'). */
  bindings: MandateBindingRow[];
  /** agent.definition rows referenced by any default or binding (by-id lookups
   * — legal under the canonical-selection law). */
  agentsById: Record<string, MandateAgentSummary>;
  /** For version-pinned defaults: version id → owning agent id. */
  versionAgentIds: Record<string, string>;
}

export async function fetchMandateOverridesData(): Promise<MandateOverridesData> {
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

  const mandates = (mandatesRes.data ?? []).filter((s) => !isPlaceholderMandate(s));
  const bindings = bindingsRes.data ?? [];

  const agentIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const mandate of mandates) {
    if (mandate.default_agent_id) agentIds.add(mandate.default_agent_id);
    if (mandate.default_agent_version_id) versionIds.add(mandate.default_agent_version_id);
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

  const agentsById: Record<string, MandateAgentSummary> = {};
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

  return { mandates, bindings, agentsById, versionAgentIds };
}

/** Light single-mandate fetch for the inline consumer picker: the mandate row, the
 * system default agent's display name, and the caller's own user binding
 * (RLS returns only rows they can see). */
export interface MandatePickerData {
  mandate: MandateDefinitionRow;
  defaultAgentId: string | null;
  defaultAgentName: string;
  myBinding: MandateBindingRow | null;
}

export async function fetchMandatePickerData(
  mandateKey: string,
  userId: string,
): Promise<MandatePickerData> {
  const supabase = createClient();
  const { data: mandate, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select("*")
    .eq("slot_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw new Error(`mandate "${mandateKey}" not found — declare it server-side first`);
  }

  let defaultAgentId = mandate.default_agent_id;
  if (!defaultAgentId && mandate.default_agent_version_id) {
    const { data: version, error: versionError } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("agent_id")
      .eq("id", mandate.default_agent_version_id)
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
    .eq("slot_id", mandate.id)
    .eq("principal_type", "user")
    .eq("subject_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bindingError) throw bindingError;

  return {
    mandate,
    defaultAgentId,
    defaultAgentName,
    myBinding: binding ?? null,
  };
}

export interface MandateBindingInput {
  /** Swap the agent (floating — user-surface bindings never version-pin; the
   * client run path has no is_version channel). Null = settings-only. */
  agentId: string | null;
  /** LLMParams-shaped settings override (model, thinking_level, …). Null =
   * agent-swap-only. At least one of the two must be set. */
  configOverrides: JsonObject | null;
}

export interface MandateBindingPrincipalInput {
  principalType: "user" | "org";
  /** The org being bound — REQUIRED for org principals (the caller must
   * administer it; the server verifies). Omit for user bindings: callApi
   * injects the ambient organization_id, which is incidental there (a user
   * binding keys on the USER — access never depends on the active org). */
  organizationId?: string;
}

/** Create or update the principal's binding for a mandate through the ONE bind
 * path (aidream PUT, contract-enforced server-side). Throws with the server's
 * 422 detail verbatim on a contract violation. */
export async function putMandateBinding(
  dispatch: AppDispatch,
  mandateKey: string,
  principal: MandateBindingPrincipalInput,
  input: MandateBindingInput & { isEnabled?: boolean },
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/binding",
      method: "PUT",
      pathParams: { slot_key: mandateKey },
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
  invalidateMandateCache(mandateKey);
}

/** Remove the principal's binding — back to the layer below (org default or
 * system default). Idempotent. */
export async function removeMandateBinding(
  dispatch: AppDispatch,
  mandateKey: string,
  principal: MandateBindingPrincipalInput,
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/agent-slots/{slot_key}/binding",
      method: "DELETE",
      pathParams: { slot_key: mandateKey },
      body: {
        principal_type: principal.principalType,
        ...(principal.organizationId
          ? { organization_id: principal.organizationId }
          : {}),
      },
    }),
  );
  if (result.error) throw new Error(result.error.message);
  invalidateMandateCache(mandateKey);
}
