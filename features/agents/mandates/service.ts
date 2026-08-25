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
 * system default (agent.mandate, public-visible) → the caller's OWN
 * user binding (agent.mandate_binding, RLS returns only rows they can see).
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
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { toLlmParams } from "./llm-params";
import {
  missingRequiredVariables,
  missingVariablesMessage,
  parseMandateContract,
  type MandateContract,
} from "./contract";
import { parseMandateWave1, type MandateWave1Fields } from "./provision-shapes";
import type { JsonObject } from "@/types/json";

export interface ResolvedMandate {
  mandateKey: string;
  agentId: string;
  configOverrides: Partial<FeLlmParams> | null;
  provenance: "system" | "user";
  /**
   * The Mandate's declared IO contract. `requiredVariables` is an INPUT
   * PRECONDITION on the caller, not only a bind-time check on the agent: a run
   * whose required variable is absent REFUSES (disease D4). Consumers that
   * resolve-then-launch pre-check with `assertMandateVariables` so the user
   * sees a real refusal instead of a thrown promise.
   *
   * A mandate carrying a `provisionKey` declares its inputs through the
   * PROVISION instead — its contract's required-variable list is legacy and
   * the binding's consumption map decides what the Holder consumes.
   */
  contract: MandateContract;
  /** Declared IO kinds (`agent.mandate.input_kind` / `output_kind`). */
  inputKind: string | null;
  outputKind: string | null;
  /** The Provision this mandate's inputs come from — null for legacy mandates
   * (see `./provisions.ts`). */
  provisionKey: string | null;
  /** Code-owned levers the mandate PINS (reasoning/streaming — never model
   * ids). Pins win over binding overrides at run time. */
  pins: JsonObject;
  /** Offered values the mandate force-delivers as context. */
  pinnedContext: string[];
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
  // `select("*")` on purpose: the wave-1 columns (provision_key, pins,
  // pinned_context) are live but ahead of the generated Row type — they ride
  // the full row and are narrowed at ingress by `parseMandateWave1`.
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
      .from("mandate_binding")
      .select("agent_id, agent_version_id, use_latest, config_overrides, is_enabled")
      .eq("mandate_id", mandate.id)
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

  const wave1: MandateWave1Fields = parseMandateWave1(mandate);
  const value: ResolvedMandate = {
    mandateKey,
    agentId,
    configOverrides,
    provenance,
    contract: parseMandateContract(mandate.contract),
    inputKind: mandate.input_kind,
    outputKind: mandate.output_kind,
    provisionKey: wave1.provisionKey,
    pins: wave1.pins,
    pinnedContext: wave1.pinnedContext,
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

/**
 * Display identity for a mandate's platform-default Holder. This deliberately
 * does not resolve user/org bindings: admin inventory surfaces need to show
 * the system assignment they can inspect and repair in the Mandates console.
 */
export interface MandateAssignment extends MandatePin {
  agentName: string | null;
  agentType: string | null;
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
    .from("mandate")
    .select("mandate_key, default_agent_id, default_agent_version_id, use_latest, is_enabled")
    .in("mandate_key", missing)
    .is("deleted_at", null);
  if (error) throw error;

  const found = new Set<string>();
  for (const row of data ?? []) {
    found.add(row.mandate_key);
    if (!row.default_agent_id) {
      // Master id is backfilled on every research mandate; a NULL here is a data
      // defect worth screaming about, not silently skipping.
      console.error(
        `[mandates] mandate "${row.mandate_key}" has no default_agent_id — backfill the master id on agent.mandate`,
      );
      continue;
    }
    const value: MandatePin = {
      mandateKey: row.mandate_key,
      agentId: row.default_agent_id,
      versionId: row.default_agent_version_id,
      useLatest: row.use_latest ?? false,
      isEnabled: row.is_enabled ?? true,
    };
    pinCache.set(row.mandate_key, { at: Date.now(), value });
    out[row.mandate_key] = value;
  }
  for (const key of missing) {
    if (!found.has(key)) {
      recordUnavailable({
        entity: "mandate",
        reason: "unknown",
        recordId: key,
        relation: "agent.mandate",
      });
    }
  }
  return out;
}

// ── The document-variable precondition (disease D4) ─────────────────────────

/**
 * REFUSE when a Mandate's required variables were not supplied.
 *
 * 🚨 Arman, 2026-08-19, on the Masterwork Conductor starting blind and fetching
 * its Rulebook with a tool call on turn 1: *"this agent should never have even
 * started without getting the rules in place."*
 *
 * There is no seed fallback and no "the model can fetch it itself" consolation:
 * a document that arrives by tool call is a document that gets skimmed. Throws
 * — the caller either pre-checks with `missingRequiredVariables` and renders a
 * refusal, or lets this stop the launch.
 */
export function assertMandateVariables(
  mandate: ResolvedMandate,
  supplied: Record<string, unknown> | null | undefined,
): void {
  const missing = missingRequiredVariables(mandate.contract, supplied);
  if (missing.length > 0) {
    throw new Error(missingVariablesMessage(mandate.mandateKey, missing));
  }
}

export {
  missingRequiredVariables,
  missingVariablesMessage,
  type MandateContract,
} from "./contract";
