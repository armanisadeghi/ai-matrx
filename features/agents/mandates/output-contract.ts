/**
 * The OUTPUT half of a mandate's contract, client-side.
 *
 * WHY THIS EXISTS. `enforced_holder_contract` (aidream) strips the input side
 * for a provisioned mandate but keeps the output side **in force ALWAYS**. So a
 * binding whose agent does not produce the mandate's `required_output_keys` is
 * DROPPED at resolution and the system default runs — in either era. That is
 * the dominant rule now: **164 of 365 live mandates declare required output
 * keys, 161 of them provisioned.** `useBindingHealth` mirrored only the input
 * side, so every one of those failures rendered as a healthy "Yours".
 *
 * `outputSchemaKeys` is a line-for-line mirror of the server's `_schema_keys`
 * (`aidream/services/mandates/service.py`) — same `schema` unwrap, same
 * array-root→items step, same union of `required` + `properties`. If that
 * function changes, change this one in the same breath: a client verdict that
 * disagrees with the server is worse than no verdict, because it is believed.
 */

import { createClient } from "@/utils/supabase/client";
import { isJsonObject } from "@/types/json";

/**
 * The consumer-visible field names an agent's `output_schema` declares.
 * Mirrors aidream `_schema_keys` exactly.
 */
export function outputSchemaKeys(outputSchema: unknown): Set<string> {
  if (!isJsonObject(outputSchema)) return new Set();
  // Agents may store the JSON Schema under a `schema` wrapper or bare.
  let schema = isJsonObject(outputSchema.schema)
    ? outputSchema.schema
    : outputSchema;
  // An array-root structured output declares its fields on each ITEM. Checking
  // only the root would report a fully structured agent as schema-less.
  if (schema.type === "array" && isJsonObject(schema.items)) {
    schema = schema.items;
  }
  const keys = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === "string") keys.add(key);
    }
  }
  if (isJsonObject(schema.properties)) {
    for (const key of Object.keys(schema.properties)) keys.add(key);
  }
  return keys;
}

/**
 * Which required output keys the agent does NOT declare. Empty = passing.
 * An agent with NO structured schema at all fails every required key — the
 * server says so in exactly those terms ("declares no structured
 * output_schema, but this mandate's consumers require output keys …").
 */
export function missingOutputKeys(
  requiredOutputKeys: readonly string[],
  outputSchema: unknown,
): string[] {
  if (requiredOutputKeys.length === 0) return [];
  const declared = outputSchemaKeys(outputSchema);
  return requiredOutputKeys.filter((key) => !declared.has(key));
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

export function invalidateOutputSchemaCache(agentId?: string): void {
  if (agentId) cache.delete(agentId);
  else cache.clear();
}

/**
 * Batched BY-ID read of `output_schema` for the given agents.
 *
 * By-id, never a list read — the canonical-selection law bans blended
 * `agent.definition` list dumps and explicitly permits `.in("id", …)` (the
 * ESLint guard `matrx/no-raw-agent-list-query` encodes the same exemption).
 * No execution RPC carries `output_schema`: `agx_get_execution_minimal`
 * returns variables + context policies, `agx_get_execution_full` adds model /
 * settings / tools, and `agx_get_list_full` is identity only. Widening one of
 * those is the better long-term home; this read exists so the verdict can be
 * honest today without changing a shared RPC's contract.
 *
 * Returns a map of agentId → raw `output_schema` (null when the agent declares
 * none, or is unreadable under RLS). Never throws — an unreadable agent is
 * reported by the caller as unreadable, never as a contract failure.
 */
export async function fetchAgentOutputSchemas(
  agentIds: readonly string[],
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const misses: string[] = [];
  const now = Date.now();
  for (const id of new Set(agentIds)) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_TTL_MS) out[id] = hit.value;
    else misses.push(id);
  }
  if (misses.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, output_schema")
    .in("id", misses);
  if (error) {
    console.error(
      "[mandates] couldn't read output_schema for bound agents",
      error,
    );
    return out;
  }
  for (const row of data ?? []) {
    const value = (row as { output_schema?: unknown }).output_schema ?? null;
    out[row.id] = value;
    cache.set(row.id, { at: now, value });
  }
  return out;
}
