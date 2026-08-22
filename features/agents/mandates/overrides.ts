"use client";

/**
 * Agent-mandate override service — the user/org half of the Mandates system:
 * browse every live mandate, see the resolved agent (system default vs override,
 * with provenance), and create/edit/delete `agent.mandate_binding` rows (agent
 * swap and/or settings-only `config_overrides`).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md
 *
 * READS ride RLS directly (mandate definitions are public; RLS scopes bindings
 * to rows the caller can see). WRITES go through the ONE bind path — aidream
 * PUT/DELETE /mandates/{mandate_key}/binding — because binding is genuine
 * compute: the server contract-checks the candidate agent (required
 * variables/context policies + output_schema vs the mandate's required output
 * keys) at WRITE time and rejects with a 422 whose detail is shown to the
 * user VERBATIM. `compareStoredContract` (../contract-compare.ts) is the
 * instant client-side pre-flight (research's proven compareContracts
 * superset rule); the server check is the authority.
 */

import { createClient } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { AppDispatch } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { invalidateMandateCache } from "./service";
import type { ConsumptionMap } from "./provision-shapes";

export type MandateDefinitionRow = Database["agent"]["Tables"]["mandate"]["Row"];
export type MandateBindingRow = Database["agent"]["Tables"]["mandate_binding"]["Row"];

// The mandate's stored contract — `{required_variables,
// required_context_policies, required_output_keys, spill_variables}`, seeded
// from the default agent's declarations. `requiredOutputKeys` is the mandate's
// OUTPUT promise (contract-checked server-side at bind time);
// `requiredVariables` is its INPUT precondition, enforced at bind time by the
// server AND at run time by `missingRequiredVariables` (disease D4).
// The contract shape + parser live in the leaf module `contract.ts` so both
// this file and `service.ts` (which resolveMandate needs it in) can read it
// without an import cycle. Re-exported here for every existing consumer.
export {
  parseMandateContract,
  missingRequiredVariables,
  missingVariablesMessage,
  EMPTY_MANDATE_CONTRACT,
  type MandateContract,
} from "./contract";

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
  /** Live (non-placeholder) mandates, ordered by mandate_key. */
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
      .from("mandate")
      .select("*")
      .is("deleted_at", null)
      .order("mandate_key"),
    supabase
      .schema("agent")
      .from("mandate_binding")
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
    .from("mandate")
    .select("*")
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw recordUnavailable({
      entity: "mandate",
      reason: "unknown",
      recordId: mandateKey,
      relation: "agent.mandate",
    });
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
    .from("mandate_binding")
    .select("*")
    .eq("mandate_id", mandate.id)
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
   * agent-swap-only. At least one of agent/settings/consumption must be set. */
  configOverrides: JsonObject | null;
  /** Holder neutrality (Wave 1): 'agent' | 'workflow'. Only agent Holders
   * execute today — a 'workflow' binding stores but refuses at run time.
   * Omitted = 'agent'. */
  holderType?: "agent" | "workflow";
  /**
   * The consumption map — which of the mandate's OFFERED values this Holder
   * consumes and through which channel (`features/agents/mandates/
   * provision-shapes.ts`). ⚠️ The server REPLACES the stored map with what is
   * sent (omitted/undefined → wiped), so an editor that owns other fields must
   * always re-send the current full map. Validated server-side at write time
   * (422 verbatim): everything consumed must be offered; optional values need
   * `when_absent`; structured kinds may only ride context.
   */
  consumptionMap?: ConsumptionMap | null;
}

/**
 * Wave-1 fields of the bind PUT body. The generated
 * `MandateBindingRequest` (types/python-generated/api-types.ts) predates them
 * — production's OpenAPI has not shipped the aidream branch yet. Mirrors
 * `aidream/api/routers/mandate_bindings.py::MandateBindingRequest`; replace
 * with the generated shape on the next `pnpm sync-types` after deploy.
 */
interface MandateBindingRequestWave1Fields {
  holder_type?: "agent" | "workflow";
  consumption_map?: Record<string, JsonObject> | null;
}

export interface MandateBindingPrincipalInput {
  principalType: "user" | "org";
  /** The org being bound — REQUIRED for org principals (the caller must
   * administer it; the server verifies). Omit for user bindings: callApi
   * injects the ambient organization_id, which is incidental there (a user
   * binding keys on the USER — access never depends on the active org). */
  organizationId?: string;
}

/** Wire form of one consumption entry — JSON-safe, undefined members stripped
 * (the strict API payload carries no `undefined`). */
function consumptionMapForApi(
  map: ConsumptionMap,
): Record<string, JsonObject> {
  const out: Record<string, JsonObject> = {};
  for (const [name, entry] of Object.entries(map)) {
    const wire: JsonObject = {
      mapType: entry.mapType,
      target: entry.target,
      deliver: entry.deliver ?? "variable",
    };
    if (entry.required === true) wire.required = true;
    if (entry.when_absent) wire.when_absent = entry.when_absent;
    if (entry.default !== undefined) wire.default = entry.default as JsonValue;
    out[name] = wire;
  }
  return out;
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
  // Wave-1 fields ride beside the generated body shape until sync-types
  // catches up (see MandateBindingRequestWave1Fields). The deployed server's
  // request model ignores unknown fields, so sending them is forward-safe.
  const wave1: MandateBindingRequestWave1Fields = {
    ...(input.holderType ? { holder_type: input.holderType } : {}),
    ...(input.consumptionMap !== undefined
      ? {
          consumption_map:
            input.consumptionMap === null
              ? null
              : consumptionMapForApi(input.consumptionMap),
        }
      : {}),
  };
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/binding",
      method: "PUT",
      pathParams: { mandate_key: mandateKey },
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
        ...wave1,
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
      path: "/mandates/{mandate_key}/binding",
      method: "DELETE",
      pathParams: { mandate_key: mandateKey },
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
