"use client";

/**
 * Client-side agent-slot resolution — the browser half of the Agent Slots
 * system, for agents whose CONSUMER runs in this repo (client calls
 * POST /agents/{id} directly).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md
 *
 * Resolution here mirrors the aidream funnel's shape, browser-scoped:
 * system default (agent.slot_definition, public-visible) → the caller's OWN
 * user binding (agent.slot_binding, RLS returns only rows they can see).
 * Org-layer bindings are deliberately NOT applied client-side yet — the org
 * that owns a run's context is a server-side question; when a client surface
 * needs org bindings it goes through the server resolver, not a guess at the
 * "active org" (access never depends on the active organization).
 *
 * v1 constraint: client slots must be FLOATING (use_latest) — the client run
 * path (useRunAgent → POST /agents/{id}) has no is_version channel. A
 * version-pinned client slot throws loudly rather than running the wrong row.
 *
 * Failures are LOUD: unknown slot, disabled slot, version-pinned slot all
 * throw. No silent fallback to a hardcoded id — that would hide exactly the
 * breakage this system exists to surface.
 */

import { createClient } from "@/utils/supabase/client";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { LLMParamsBody } from "@/lib/api/call-api";

export interface ResolvedClientSlot {
  slotKey: string;
  agentId: string;
  configOverrides: LLMParamsBody | null;
  provenance: "system" | "user";
}

/** Runtime-narrow a binding's config_overrides Json into the generated
 * LLMParams shape — field by field, no casts. Keys the client doesn't know
 * are dropped loudly; the server's apply_overrides stays the authority. */
function toLlmParams(obj: JsonObject): LLMParamsBody {
  const out: LLMParamsBody = {};
  if (typeof obj.model === "string") out.model = obj.model;
  if (typeof obj.offering_id === "string") out.offering_id = obj.offering_id;
  if (typeof obj.temperature === "number") out.temperature = obj.temperature;
  if (typeof obj.top_p === "number") out.top_p = obj.top_p;
  if (typeof obj.max_output_tokens === "number") out.max_output_tokens = obj.max_output_tokens;
  const handled = new Set([
    "model",
    "offering_id",
    "temperature",
    "top_p",
    "max_output_tokens",
    "thinking_level",
    "reasoning_effort",
    "verbosity",
  ]);
  const thinkingLevels = ["minimal", "low", "medium", "high"] as const;
  const thinking = thinkingLevels.find((v) => v === obj.thinking_level);
  if (thinking) out.thinking_level = thinking;
  const efforts = ["auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  const effort = efforts.find((v) => v === obj.reasoning_effort);
  if (effort) out.reasoning_effort = effort;
  const verbosities = ["low", "medium", "high"] as const;
  const verbosity = verbosities.find((v) => v === obj.verbosity);
  if (verbosity) out.verbosity = verbosity;
  const dropped = Object.keys(obj).filter((k) => !handled.has(k));
  if (dropped.length > 0) {
    console.warn(
      `[agent-slots] client resolution dropped unsupported config_overrides keys: ${dropped.join(", ")} — extend toLlmParams or apply them server-side`,
    );
  }
  return out;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ResolvedClientSlot }>();

/** Subscribers re-resolve when a slot's cached resolution is invalidated
 * (binding saved/removed) — how a mounted picker/consumer refreshes without
 * prop-drilling a reload. `slotKey === undefined` means "all slots". */
const invalidationListeners = new Set<(slotKey: string | undefined) => void>();

export function onSlotCacheInvalidated(
  listener: (slotKey: string | undefined) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export function invalidateClientSlotCache(slotKey?: string): void {
  if (slotKey) cache.delete(slotKey);
  else cache.clear();
  for (const listener of invalidationListeners) listener(slotKey);
}

export async function resolveAgentSlot(slotKey: string): Promise<ResolvedClientSlot> {
  const cached = cache.get(slotKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const supabase = createClient();
  const { data: slot, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select("id, slot_key, default_agent_id, default_agent_version_id, use_latest, is_enabled")
    .eq("slot_key", slotKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!slot) {
    throw new Error(
      `agent slot "${slotKey}" not found — it must be declared server-side and seeded (see agent-slots FEATURE.md)`,
    );
  }
  if (!slot.is_enabled) {
    throw new Error(`agent slot "${slotKey}" is disabled`);
  }
  if (!slot.use_latest || !slot.default_agent_id) {
    throw new Error(
      `agent slot "${slotKey}" is version-pinned — client-run slots must be floating (use_latest); route this consumer through the server, or repin`,
    );
  }

  let agentId = slot.default_agent_id;
  let provenance: ResolvedClientSlot["provenance"] = "system";
  let configOverrides: LLMParamsBody | null = null;

  // The caller's own user binding (RLS-scoped; other principals' rows are
  // invisible so no explicit user filter is needed beyond principal_type).
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId) {
    const { data: binding, error: bindingError } = await supabase
      .schema("agent")
      .from("slot_binding")
      .select("agent_id, agent_version_id, use_latest, config_overrides, is_enabled")
      .eq("slot_id", slot.id)
      .eq("principal_type", "user")
      .eq("subject_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bindingError) throw bindingError;
    if (binding?.is_enabled) {
      if (isJsonObject(binding.config_overrides)) {
        configOverrides = toLlmParams(binding.config_overrides);
      }
      if (binding.agent_version_id) {
        throw new Error(
          `agent slot "${slotKey}": your override is version-pinned — client-run slots must be floating; update the binding`,
        );
      }
      if (binding.agent_id) {
        agentId = binding.agent_id;
        provenance = "user";
      }
    }
  }

  const value: ResolvedClientSlot = {
    slotKey,
    agentId,
    configOverrides,
    provenance,
  };
  cache.set(slotKey, { at: Date.now(), value });
  return value;
}
