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
import { isJsonObject } from "@/types/json";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { toLlmParams } from "./llm-params";

export interface ResolvedClientSlot {
  slotKey: string;
  agentId: string;
  configOverrides: Partial<FeLlmParams> | null;
  provenance: "system" | "user";
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
  if (slotKey) {
    cache.delete(slotKey);
    pinCache.delete(slotKey);
  } else {
    cache.clear();
    pinCache.clear();
  }
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
  let configOverrides: Partial<FeLlmParams> | null = null;

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

// ── Slot pin display / fork info ─────────────────────────────────────────────

/**
 * The system default PIN of a slot, for display and "fork what actually runs"
 * flows (research's agent-roles page). Unlike `resolveAgentSlot` this is NOT a
 * run path: version-pinned slots are fine here, and no binding layer applies —
 * it answers "what is the system default", not "what runs for me".
 */
export interface SlotPin {
  slotKey: string;
  /** Master agent row id (always backfilled on slot rows; loud if missing). */
  agentId: string;
  /** Pinned agx_version id — null for floating (use_latest) slots. */
  versionId: string | null;
  useLatest: boolean;
  isEnabled: boolean;
}

const pinCache = new Map<string, { at: number; value: SlotPin }>();

/** Fetch the system default pins for a set of slots in one query. */
export async function fetchSlotPins(
  slotKeys: readonly string[],
): Promise<Record<string, SlotPin>> {
  const out: Record<string, SlotPin> = {};
  const missing: string[] = [];
  for (const key of slotKeys) {
    const cached = pinCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) out[key] = cached.value;
    else missing.push(key);
  }
  if (missing.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select("slot_key, default_agent_id, default_agent_version_id, use_latest, is_enabled")
    .in("slot_key", missing)
    .is("deleted_at", null);
  if (error) throw error;

  const found = new Set<string>();
  for (const row of data ?? []) {
    found.add(row.slot_key);
    if (!row.default_agent_id) {
      // Master id is backfilled on every research slot; a NULL here is a data
      // defect worth screaming about, not silently skipping.
      console.error(
        `[agent-slots] slot "${row.slot_key}" has no default_agent_id — backfill the master id on agent.slot_definition`,
      );
      continue;
    }
    const value: SlotPin = {
      slotKey: row.slot_key,
      agentId: row.default_agent_id,
      versionId: row.default_agent_version_id,
      useLatest: row.use_latest ?? false,
      isEnabled: row.is_enabled ?? true,
    };
    pinCache.set(row.slot_key, { at: Date.now(), value });
    out[row.slot_key] = value;
  }
  for (const key of missing) {
    if (!found.has(key)) {
      console.error(
        `[agent-slots] slot "${key}" not found — it must be declared server-side and seeded (see agent-slots FEATURE.md)`,
      );
    }
  }
  return out;
}
