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
import { parseCallApiError } from "@/lib/api/errors";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { AppDispatch } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { invalidateMandateCache } from "./service";
import type { ConsumptionMap } from "./provision-shapes";
import {
  mandateBindings,
  mandateDefinitions,
  holderOfBinding,
  holderOfMandate,
  type MandateBindingRow,
  type MandateDefinitionRow,
} from "@/lib/supabase/mandateStorage";

export type { MandateBindingRow, MandateDefinitionRow };

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
    mandateDefinitions(supabase)
      .select("*")
      .is("deleted_at", null)
      .order("mandate_key"),
    mandateBindings(supabase)
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
    const holder = holderOfMandate(mandate);
    if (holder.holderId) agentIds.add(holder.holderId);
    if (holder.versionId) versionIds.add(holder.versionId);
  }
  for (const binding of bindings) {
    const holder = holderOfBinding(binding);
    if (holder.holderId) agentIds.add(holder.holderId);
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
  const { data: mandate, error } = await mandateDefinitions(supabase)
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

  const systemHolder = holderOfMandate(mandate);
  let defaultAgentId = systemHolder.holderId;
  if (!defaultAgentId && systemHolder.versionId) {
    const { data: version, error: versionError } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("agent_id")
      .eq("id", systemHolder.versionId)
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

  const { data: binding, error: bindingError } = await mandateBindings(supabase)
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
  /** Swap the agent. Null = settings-only binding. */
  agentId: string | null;
  /**
   * VERSION PINNING (Arman's rule 6, 2026-08-26): pin the binding to a
   * definition_version snapshot instead of floating on the master. Exactly one
   * of agentId / agentVersionId may be set (the server 422s on both). Pinned
   * bindings resolve correctly server-side today; the CLIENT run path's
   * version channel is D1 follow-through — until it lands, a pinned binding on
   * a client-resolved mandate refuses loudly at resolve time (never silently).
   */
  agentVersionId?: string | null;
  /** Explicit float choice. Defaults to agentId != null (the old derived
   * behavior) so existing call sites keep their semantics. */
  useLatest?: boolean;
  /** LLMParams-shaped settings override (model, thinking_level, …). Null =
   * agent-swap-only. At least one of agent/settings/consumption must be set. */
  configOverrides: JsonObject | null;
  /**
   * WHICH KIND OF HOLDER fulfils the job. Both execute end to end: an agent
   * Holder runs the agent; a workflow Holder runs the workflow as a child run
   * and returns the deliverable whose kind is the Mandate's output kind.
   * Omitted = 'agent'.
   */
  holderType?: "agent" | "workflow";
  /**
   * The workflow Holder's identity — ALWAYS a `workflow.definition` id, never
   * a version id (`bindings.py`). Set only with `holderType: "workflow"`; the
   * server 422s if it arrives beside `agentId`/`agentVersionId`.
   */
  holderId?: string | null;
  /** Optional pin to one `workflow.definition_version`. Omit to follow the
   * live definition. */
  holderVersionId?: string | null;
  /**
   * The consumption map — which of the mandate's OFFERED values this Holder
   * consumes and through which channel (`features/mandates/
   * provision-shapes.ts`). ⚠️ The server REPLACES the stored map with what is
   * sent (omitted/undefined → wiped), so an editor that owns other fields must
   * always re-send the current full map. Validated server-side at write time
   * (422 verbatim): everything consumed must be offered; optional values need
   * `when_absent`; structured kinds may only ride context.
   */
  consumptionMap?: ConsumptionMap | null;
  /**
   * P14 — "run instantly". `true` only when the mapping leaves NOTHING to ask
   * (`evaluateBindingAutoRun` over the draft), `false` when the person turned
   * it off, `null`/omitted when this binding has no opinion and the layer below
   * decides. The server re-checks it and refuses an ineligible `true` down to
   * `false` — the promise is a fact about the mapping, never a preference, on
   * both sides of the wire.
   */
  autoRun?: boolean | null;
}

export interface MandateBindingPrincipalInput {
  /**
   * WHICH RUNG OF THE LADDER — global → org → user (Arman, 2026-08-27).
   *
   * `global` is THE SYSTEM RUNG, added 2026-08-31. Consumption is per-binding
   * by THE-MODEL law, and this table could only ever be written for a user or
   * an org, so the rung that serves EVERYBODY — whose Holder identity lives on
   * `mandate.definition.default_holder_*` — had nowhere to put its consumption
   * map or its settings overrides, and the system rung was the one rung that
   * could not go through the binding machinery at all. One row per mandate,
   * super-admin only (the server gates it and 403s with the reason).
   */
  principalType: "user" | "org" | "global";
  /** The org being bound — REQUIRED for org principals (the caller must
   * administer it; the server verifies). Omit for user bindings: callApi
   * injects the ambient organization_id, which is incidental there (a user
   * binding keys on the USER — access never depends on the active org).
   * Ignored for `global`: the server stamps the MANDATE's own org, because the
   * column is NOT NULL and the row is not scoped to any tenant. */
  organizationId?: string;
}

/** Wire form of one consumption entry — JSON-safe, undefined members stripped
 * (the strict API payload carries no `undefined`). */
function consumptionMapForApi(
  map: ConsumptionMap,
): Record<string, JsonObject | JsonObject[]> {
  const out: Record<string, JsonObject | JsonObject[]> = {};
  for (const [name, sources] of Object.entries(map)) {
    const wires = sources.map((entry) => {
      const deliver = entry.deliver ?? "variable";
      // THE THREE STORED SOURCES, each emitting only the fields its own branch
      // owns — a `target` on a prompt or a `prompt` on a literal would be a
      // field with no reader, and the server's discriminated union refuses it.
      if (entry.mapType === "direct_value") {
        return {
          mapType: "direct_value",
          target: entry.target as JsonValue,
          deliver,
        } satisfies JsonObject;
      }
      if (entry.mapType === "prompt_user") {
        const wire: JsonObject = {
          mapType: "prompt_user",
          prompt: entry.prompt,
          deliver,
        };
        if (entry.required === true) wire.required = true;
        if (entry.defaultValue !== undefined && entry.defaultValue !== null) {
          wire.defaultValue = entry.defaultValue as JsonValue;
        }
        return wire;
      }
      const wire: JsonObject = {
        mapType: entry.mapType,
        target: entry.target,
        deliver,
      };
      if (entry.required === true) wire.required = true;
      if (entry.when_absent) wire.when_absent = entry.when_absent;
      if (entry.default !== undefined) wire.default = entry.default as JsonValue;
      return wire;
    });
    if (wires.length === 0) continue;
    // 🚨 D18.2 ON THE WIRE. A target with SEVERAL sources travels as an ordered
    // list — the server concatenates them with a blank line, in this order. A
    // target with ONE source keeps travelling as a bare object, so re-saving a
    // binding written before 2026-08-31 rewrites it byte-identically instead of
    // silently changing its stored shape. The server reads both.
    out[name] = wires.length === 1 ? wires[0] : wires;
  }
  return out;
}

/**
 * 🚨 THE BIND GATE'S WORDS REACH THE PERSON (found live 2026-08-31, first real
 * save through the one binding UI).
 *
 * `parseCallApiError` splits a backend error into `detail` (the server's own
 * sentence) and `userMessage` (a generic safe fallback — for a 422 that is
 * literally "Invalid request. Please check your input and try again."). Both
 * mandate write paths threw `userMessage`, so the gate's precise refusal —
 * *"'page_text': offered value 'task_overview' is OPTIONAL — declare
 * when_absent ('skip' | 'use_default' | 'fail') so absence is a decision, not a
 * surprise"* — was thrown away and the author was told nothing they could act
 * on. That is the exact defect the 2026-08-22 fix in this file was meant to end;
 * it only ever reached `error.message`, never the split body.
 *
 * A `validation_error` detail is authored prose about the caller's own input,
 * so it IS the copy. Anything else keeps the safe generic.
 */
/**
 * 🚨 THE ORG-CONTEXT REFUSAL, IN WORDS A PERSON CAN ACT ON (V1 finding R2-3,
 * round 2, 2026-08-31).
 *
 * The org rung's picker offers every organization the person belongs to, and
 * writing to one that is not the session's active workspace used to be refused
 * with the transport's own internal sentence — *"Request body organization_id
 * must match the request context organization."* — printed on the page and in
 * a toast. Nine organizations offered, eight of them dead, and the screen said
 * nothing a Subject Matter Expert could use.
 *
 * The write itself now carries the chosen organization's context
 * (`scopeOverrides`, below), so this should be unreachable. It is kept because
 * "unreachable" is a claim, and if the transport ever refuses again the person
 * must get a cause and a remedy rather than a sentence about request contexts.
 */
const ORGANIZATION_CONTEXT_CODES = new Set([
  "organization_context_mismatch",
  "organization_context_required",
  "organization_context_invalid",
]);

function organizationContextRefusal(error: { code?: string }): string | null {
  if (!error.code || !ORGANIZATION_CONTEXT_CODES.has(error.code)) return null;
  return error.code === "organization_context_required"
    ? "No organization is selected, so there is no context to write this answer in. Nothing was written. Pick a workspace in the header and save again."
    : "This answer is for a different organization than the workspace you have selected, and the write could not be sent in that organization's context. Nothing was written. Switch your workspace to that organization in the header and save again.";
}

function bindGateMessage(error: {
  message: string;
  status?: number;
  code?: string;
  serverDetail?: unknown;
}): string {
  const organizationRefusal = organizationContextRefusal(error);
  if (organizationRefusal) return organizationRefusal;
  const parsed = parseCallApiError(error);
  if (parsed.code === "validation_error" && parsed.detail.trim().length > 0) {
    return parsed.detail;
  }
  /**
   * 🚨 A 403's DETAIL IS AUTHORED PROSE TOO (V1 R2-3, verified live 2026-08-31).
   *
   * The org rung refused with *"You do not have permission to access this
   * resource."* — `api/errors.py`'s generic sentence for the STATUS. The server
   * had actually said *"organization admin required to set an org-wide
   * override"*, which names the cause and implies the remedy, and this function
   * threw it away because only `validation_error` was allowed to keep its
   * detail. Same class as G5 in this wave: the reason was on the wire and the
   * client replaced it with a placeholder.
   *
   * An authorization refusal is, like a 422, a sentence about the CALLER'S own
   * situation — it is the copy. Only a detail the server actually authored is
   * kept: `parseCallApiError` leaves `detail` empty when the body carried none,
   * and then the generic still stands.
   */
  if (parsed.status === 403 && parsed.detail.trim().length > 0) {
    return parsed.detail;
  }
  return parsed.userMessage;
}

/**
 * WHAT THE WRITE ACTUALLY DID, in the SERVER'S OWN WORDS.
 *
 * 🚨 A 200 is not agreement. `set_binding` refuses, downgrades and reshapes
 * things the caller asked for — the auto-run promise refused down to `false`
 * being the loud one — and until aidream v0.2.456 the only record of that was a
 * `logger.warning` the caller never heard. `BindingResult` now carries the
 * refusal back as prose (`notes`) plus one sentence saying where the row it
 * wrote actually answers (`applies_in`, which the row's `organization_id`
 * genuinely does NOT say). Both are rendered VERBATIM: the server is the
 * authority on what it stored, and a client paraphrase of a server refusal is
 * a second source of truth waiting to disagree.
 */
export interface BindingWriteReport {
  /** Every refusal/downgrade/reshape this write performed. Empty = the row
   * stored exactly what was sent. */
  notes: string[];
  /** Where the row that was just written answers. `null` when the server said
   * nothing — never a client-invented sentence. */
  appliesIn: string | null;
}

/** Read the write's own report off the response body. Defensive because a
 * server older than v0.2.456 answers without either field, and an absent
 * sentence must read as absent rather than as an empty promise. */
export function parseBindingWriteReport(raw: unknown): BindingWriteReport {
  const record = isJsonObject(raw) ? raw : {};
  const appliesIn =
    typeof record.applies_in === "string" && record.applies_in.trim().length > 0
      ? record.applies_in
      : null;
  return {
    notes: Array.isArray(record.notes)
      ? record.notes.filter(
          (note): note is string =>
            typeof note === "string" && note.trim().length > 0,
        )
      : [],
    appliesIn,
  };
}

/** Create or update the principal's binding for a mandate through the ONE bind
 * path (aidream PUT, contract-enforced server-side). Throws with the server's
 * 422 detail verbatim on a contract violation. Returns the write's own report —
 * see `BindingWriteReport`; a caller with nowhere to print it may ignore it. */
export async function putMandateBinding(
  dispatch: AppDispatch,
  mandateKey: string,
  principal: MandateBindingPrincipalInput,
  input: MandateBindingInput & { isEnabled?: boolean },
): Promise<BindingWriteReport> {
  // The generated request model now carries every field the server accepts
  // (holder_type / holder_id / holder_version_id / consumption_map), so the
  // body is the contract itself — no side-channel object.
  //
  // A WORKFLOW Holder names `holder_id` and NOTHING agent-shaped: sending an
  // agent id beside it is a 422 by design, and the two identities must never
  // be smuggled through the same field.
  const isWorkflow = input.holderType === "workflow";
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/binding",
      method: "PUT",
      pathParams: { mandate_key: mandateKey },
      // An org binding is a write in THAT org's tenancy context, even when an
      // admin currently has a different workspace selected. Keep the body and
      // X-Organization-Id on one canonical value at the transport boundary.
      ...(principal.organizationId
        ? { scopeOverrides: { organization_id: principal.organizationId } }
        : {}),
      body: {
        principal_type: principal.principalType,
        holder_type: input.holderType ?? "agent",
        agent_id: isWorkflow ? null : input.agentId,
        agent_version_id: isWorkflow ? null : (input.agentVersionId ?? null),
        holder_id: isWorkflow ? (input.holderId ?? null) : null,
        auto_run: input.autoRun ?? null,
        holder_version_id: isWorkflow ? (input.holderVersionId ?? null) : null,
        use_latest: isWorkflow
          ? (input.useLatest ?? input.holderVersionId == null)
          : (input.useLatest ?? input.agentId != null),
        config_overrides: input.configOverrides,
        is_enabled: input.isEnabled ?? true,
        ...(input.consumptionMap !== undefined
          ? {
              consumption_map:
                input.consumptionMap === null
                  ? null
                  : consumptionMapForApi(input.consumptionMap),
            }
          : {}),
        ...(principal.organizationId
          ? { organization_id: principal.organizationId }
          : {}),
      },
    }),
  );
  // ONE parser for the server body: the contract gate answers 422 with the
  // exact mismatch in `detail`; `result.error.message` alone flattened it to a
  // generic "Invalid request" toast (found live 2026-08-22), and so did
  // `userMessage` (found live 2026-08-31) — see bindGateMessage.
  if (result.error) throw new Error(bindGateMessage(result.error));
  invalidateMandateCache(mandateKey);
  return parseBindingWriteReport(result.data);
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
      ...(principal.organizationId
        ? { scopeOverrides: { organization_id: principal.organizationId } }
        : {}),
      body: {
        principal_type: principal.principalType,
        ...(principal.organizationId
          ? { organization_id: principal.organizationId }
          : {}),
      },
    }),
  );
  // ONE parser for the server body: the contract gate answers 422 with the
  // exact mismatch in `detail`; `result.error.message` alone flattened it to a
  // generic "Invalid request" toast (found live 2026-08-22), and so did
  // `userMessage` (found live 2026-08-31) — see bindGateMessage.
  if (result.error) throw new Error(bindGateMessage(result.error));
  invalidateMandateCache(mandateKey);
}
