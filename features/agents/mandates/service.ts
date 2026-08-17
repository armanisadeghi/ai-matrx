"use client";

/**
 * Client-side agent-mandate resolution — the browser half of the Mandates
 * system, for agents whose CONSUMER runs in this repo (client calls
 * POST /agents/{id} directly).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md
 *
 * Resolution here mirrors the aidream funnel's shape, browser-scoped:
 * system default (agent.slot_definition, public-visible) → the caller's OWN
 * user binding (agent.slot_binding, RLS returns only rows they can see).
 * Org-layer bindings are deliberately NOT applied client-side yet — the org
 * that owns a run's context is a server-side question; when a client surface
 * needs org bindings it goes through the server resolver, not a guess at the
 * "active org" (access never depends on the active organization).
 *
 * v1 constraint: client mandates must be FLOATING (use_latest) — the client run
 * path (useRunAgent → POST /agents/{id}) has no is_version channel. A
 * version-pinned client mandate throws loudly rather than running the wrong row.
 *
 * Failures are LOUD: unknown mandate, disabled mandate, version-pinned mandate all
 * throw. No silent fallback to a hardcoded id — that would hide exactly the
 * breakage this system exists to surface.
 */

import { createClient } from "@/utils/supabase/client";
import { isJsonObject } from "@/types/json";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { toLlmParams } from "./llm-params";

export interface ResolvedMandate {
  mandateKey: string;
  agentId: string;
  configOverrides: Partial<FeLlmParams> | null;
  provenance: "system" | "user";
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ResolvedMandate }>();

/** Subscribers re-resolve when a mandate's cached resolution is invalidated
 * (binding saved/removed) — how a mounted picker/consumer refreshes without
 * prop-drilling a reload. `mandateKey === undefined` means "all mandates". */
const invalidationListeners = new Set<(mandateKey: string | undefined) => void>();

export function onMandateCacheInvalidated(
  listener: (mandateKey: string | undefined) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export function invalidateMandateCache(mandateKey?: string): void {
  if (mandateKey) {
    cache.delete(mandateKey);
    pinCache.delete(mandateKey);
  } else {
    cache.clear();
    pinCache.clear();
  }
  for (const listener of invalidationListeners) listener(mandateKey);
}

export async function resolveMandate(mandateKey: string): Promise<ResolvedMandate> {
  const cached = cache.get(mandateKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const supabase = createClient();
  const { data: mandate, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select("id, slot_key, default_agent_id, default_agent_version_id, use_latest, is_enabled")
    .eq("slot_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw new Error(
      `mandate "${mandateKey}" not found — it must be declared server-side and seeded (see mandates FEATURE.md)`,
    );
  }
  if (!mandate.is_enabled) {
    throw new Error(`mandate "${mandateKey}" is disabled`);
  }
  if (!mandate.use_latest || !mandate.default_agent_id) {
    throw new Error(
      `mandate "${mandateKey}" is version-pinned — client-run mandates must be floating (use_latest); route this consumer through the server, or rebind`,
    );
  }

  let agentId = mandate.default_agent_id;
  let provenance: ResolvedMandate["provenance"] = "system";
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
      .eq("slot_id", mandate.id)
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
          `mandate "${mandateKey}": your override is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (binding.agent_id) {
        agentId = binding.agent_id;
        provenance = "user";
      }
    }
  }

  const value: ResolvedMandate = {
    mandateKey,
    agentId,
    configOverrides,
    provenance,
  };
  cache.set(mandateKey, { at: Date.now(), value });
  return value;
}

// ── Mandate pin display / fork info ─────────────────────────────────────────────

/**
 * The system default PIN of a mandate, for display and "fork what actually runs"
 * flows (research's agent-roles page). Unlike `resolveMandate` this is NOT a
 * run path: version-pinned mandates are fine here, and no binding layer applies —
 * it answers "what is the system default", not "what runs for me".
 */
export interface MandatePin {
  mandateKey: string;
  /** Master agent row id (always backfilled on mandate rows; loud if missing). */
  agentId: string;
  /** Pinned agx_version id — null for floating (use_latest) mandates. */
  versionId: string | null;
  useLatest: boolean;
  isEnabled: boolean;
}

const pinCache = new Map<string, { at: number; value: MandatePin }>();

/** Fetch the system default pins for a set of mandates in one query. */
export async function fetchMandatePins(
  mandateKeys: readonly string[],
): Promise<Record<string, MandatePin>> {
  const out: Record<string, MandatePin> = {};
  const missing: string[] = [];
  for (const key of mandateKeys) {
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
      // Master id is backfilled on every research mandate; a NULL here is a data
      // defect worth screaming about, not silently skipping.
      console.error(
        `[mandates] mandate "${row.slot_key}" has no default_agent_id — backfill the master id on agent.slot_definition`,
      );
      continue;
    }
    const value: MandatePin = {
      mandateKey: row.slot_key,
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
        `[mandates] mandate "${key}" not found — it must be declared server-side and seeded (see mandates FEATURE.md)`,
      );
    }
  }
  return out;
}
