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
 * Failures are LOUD: unknown mandate, disabled mandate, version-pinned mandate,
 * and a binding whose HOLDER is not an agent all throw. No silent fallback to a
 * hardcoded id — that would hide exactly the breakage this system exists to
 * surface.
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
import {
  EXECUTABLE_HOLDER_TYPES,
  holderNotExecutableMessage,
  parseBindingWave1,
  parseMandateWave1,
  type MandateBindingLayer,
  type MandateWave1Fields,
} from "./provision-shapes";
import type { JsonObject } from "@/types/json";
import {
  BINDING_HOLDER_COLUMNS,
  MANDATE_HOLDER_COLUMNS,
  MANDATE_STORAGE_LABEL,
  contractOfMandate,
  holderOfBinding,
  holderOfMandate,
  inputKindOfMandate,
  isFloatingMandate,
  mandateBindings,
  mandateDefinitions,
  mandateTreatments,
} from "@/lib/supabase/mandateStorage";
import {
  TREATMENT_TIER_WIDGET,
  parseTreatmentConfig,
  type BindingPresentation,
} from "@/features/bindings/treatment-shape";

export interface ResolvedMandate {
  mandateKey: string;
  /**
   * `agent.mandate.id` — the row the JOB is, as opposed to the agent currently
   * holding it. Consumers that write something ABOUT the mandate (notes,
   * observations) key on this, never on `agentId`, which moves with the pin.
   */
  mandateId: string;
  agentId: string;
  /**
   * The DECIDING layer's Holder type. Always `"agent"` today — a binding
   * naming any other Holder refuses resolution outright (see
   * `assertExecutableHolder`) instead of degrading to the system default — but
   * consumers read it rather than assume it, so the day workflow Holders
   * execute the field is already threaded through. Defaults to `"agent"` when
   * no binding applies (the system default is an agent by construction).
   */
  holderType: string;
  configOverrides: Partial<FeLlmParams> | null;
  provenance: "system" | "org" | "user";
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
  /**
   * THE JOB'S PRESENTATION — how it shows itself when it runs (widget, variable
   * panel, reveal toggles, gate, write access). `null` when the job stores none,
   * which is the platform default and NOT the same as "off".
   *
   * 🚨 This is DISPLAY IDENTITY, which is exactly what this client path is for
   * — read the doctrine block in `launch-agent-execution.thunk.ts`: the server
   * owns the run decision (holder, consumption, `config_overrides`, which is
   * why those are deliberately not echoed back), and the browser owns how the
   * result is painted. A shortcut has honoured its stored presentation since
   * the cutover, off this exact table; a job stored one it could not honour,
   * which is the inversion this field closes.
   */
  presentation: BindingPresentation | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ResolvedMandate }>();

function mandateCacheKey(userId: string, mandateKey: string): string {
  return `${userId}:${mandateKey}`;
}

/** Subscribers re-resolve when a mandate's cached resolution is invalidated
 * (binding saved/removed) — how a mounted picker/consumer refreshes without
 * prop-drilling a reload. `mandateKey === undefined` means "all mandates". */
const invalidationListeners = new Set<
  (mandateKey: string | undefined) => void
>();

export function onMandateCacheInvalidated(
  listener: (mandateKey: string | undefined) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export function invalidateMandateCache(mandateKey?: string): void {
  if (mandateKey) {
    for (const key of cache.keys()) {
      if (key.endsWith(`:${mandateKey}`)) cache.delete(key);
    }
    pinCache.delete(mandateKey);
  } else {
    cache.clear();
    pinCache.clear();
  }
  for (const listener of invalidationListeners) listener(mandateKey);
}

/**
 * REFUSE a binding whose Holder cannot execute — the client half of the
 * server's `EXECUTABLE_HOLDER_TYPES` gate (aidream
 * `services/mandates/service.py`).
 *
 * A `holder_type='workflow'` binding carries NO `agent_id` by construction, so
 * before this existed it fell straight through the `if (binding.agent_id)`
 * branch below and the resolver returned the SYSTEM DEFAULT agent with
 * `provenance: "system"` — a deliberate binding silently evaporating, and the
 * caller told the platform default was in charge. Refusing loudly is the same
 * posture the server takes, and the only one that surfaces the wiring.
 *
 * Returns the (executable) holder type so the caller can carry it onto
 * `ResolvedMandate`.
 */
function assertExecutableHolder(
  mandateKey: string,
  layer: MandateBindingLayer,
  row: object,
): string {
  const { holderType } = parseBindingWave1(row);
  if (!EXECUTABLE_HOLDER_TYPES.has(holderType)) {
    const bindingId =
      typeof (row as { id?: unknown }).id === "string"
        ? (row as { id: string }).id
        : null;
    throw new Error(
      holderNotExecutableMessage(mandateKey, layer, bindingId, holderType),
    );
  }
  return holderType;
}

export interface ResolveMandateOptions {
  /** An unassigned optional Mandate disables its affordance without error capture. */
  optional?: boolean;
}

export function resolveMandate(
  mandateKey: string,
  options: { optional: true },
): Promise<ResolvedMandate | null>;
export function resolveMandate(
  mandateKey: string,
  options?: ResolveMandateOptions,
): Promise<ResolvedMandate>;
export async function resolveMandate(
  mandateKey: string,
  options: ResolveMandateOptions = {},
): Promise<ResolvedMandate | null> {
  const supabase = createClient();
  // `mandate.definition` is authenticated-only. Establish identity before a
  // protected read or cache lookup so hydration/session drift cannot emit an
  // anonymous PostgREST request or reuse another caller's resolved binding.
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (authError || !userId) {
    throw new Error("mandate resolution requires an authenticated session");
  }

  const cacheKey = mandateCacheKey(userId, mandateKey);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  // `select("*")` on purpose: the wave-1 columns (provision_key, pins,
  // pinned_context) are live but ahead of the generated Row type — they ride
  // the full row and are narrowed at ingress by `parseMandateWave1`.
  const { data: mandate, error } = await mandateDefinitions(supabase)
    .select("*")
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    if (options.optional) return null;
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
  const systemHolder = holderOfMandate(mandate);
  if (!isFloatingMandate(mandate) || !systemHolder.holderId) {
    throw new Error(
      `mandate "${mandateKey}" is version-pinned — client-run mandates must be floating (no pinned Holder version); route this consumer through the server, or rebind`,
    );
  }

  let agentId = systemHolder.holderId;
  let provenance: ResolvedMandate["provenance"] = "system";
  let holderType: ResolvedMandate["holderType"] = "agent";
  let configOverrides: Partial<FeLlmParams> | null = null;

  // THE ORG LAYER (2026-08-26 — closed a doctrine fork). The server resolves
  // system → org → user; this resolver silently skipped org, so an org
  // binding never applied to client-resolved mandates and every "what applies
  // to you" display over this path lied. RLS already scopes the read to org
  // bindings of orgs the caller belongs to. Deterministic winner: newest.
  if (userId) {
    const { data: orgBindings, error: orgError } = await mandateBindings(supabase)
      .select(
        `id, ${BINDING_HOLDER_COLUMNS}, config_overrides, is_enabled, updated_at` as const,
      )
      .eq("mandate_id", mandate.id)
      .eq("principal_type", "org")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (orgError) throw orgError;
    const orgBinding = (orgBindings ?? []).find((b) => b.is_enabled) ?? null;
    if (orgBinding) {
      // THE HOLDER GATE, first — before a single field of a non-executable
      // binding is applied. The server refuses before merging too.
      holderType = assertExecutableHolder(mandateKey, "organization", orgBinding);
      if (isJsonObject(orgBinding.config_overrides)) {
        configOverrides = toLlmParams(orgBinding.config_overrides);
      }
      const orgHolder = holderOfBinding(orgBinding);
      if (orgHolder.versionId) {
        throw new Error(
          `mandate "${mandateKey}": an organization binding is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (orgHolder.holderId) {
        agentId = orgHolder.holderId;
        provenance = "org";
      }
    }
  }

  // The caller's own user binding (RLS-scoped; other principals' rows are
  // invisible so no explicit user filter is needed beyond principal_type).
  // User wins over org — the same precedence the server walks.
  if (userId) {
    const { data: binding, error: bindingError } = await mandateBindings(supabase)
      .select(`id, ${BINDING_HOLDER_COLUMNS}, config_overrides, is_enabled` as const)
      .eq("mandate_id", mandate.id)
      .eq("principal_type", "user")
      .eq("subject_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bindingError) throw bindingError;
    if (binding?.is_enabled) {
      holderType = assertExecutableHolder(mandateKey, "user", binding);
      if (isJsonObject(binding.config_overrides)) {
        // Merge upward — user wins per key over the org layer (server rule).
        configOverrides = {
          ...configOverrides,
          ...toLlmParams(binding.config_overrides),
        };
      }
      const userHolder = holderOfBinding(binding);
      if (userHolder.versionId) {
        throw new Error(
          `mandate "${mandateKey}": your override is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (userHolder.holderId) {
        agentId = userHolder.holderId;
        provenance = "user";
      }
    }
  }

  // THE PRESENTATION LAYER. One row per job (`tier='widget'`, `is_default`),
  // the same natural key `mandate.vw_shortcut` joins on. A read failure is NOT
  // a launch failure: a job whose presentation could not be read still runs, on
  // the platform default, and says so in the console rather than refusing.
  let presentation: BindingPresentation | null = null;
  {
    const { data: treatment, error: treatmentError } = await mandateTreatments(
      supabase,
    )
      .select("config, is_enabled")
      .eq("mandate_id", mandate.id)
      .eq("tier", TREATMENT_TIER_WIDGET)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (treatmentError) {
      console.warn(
        `[resolveMandate] "${mandateKey}": its display options could not be read; running on the platform default presentation`,
        treatmentError,
      );
    } else if (treatment && treatment.is_enabled !== false) {
      presentation = parseTreatmentConfig(treatment.config);
    }
  }

  const wave1: MandateWave1Fields = parseMandateWave1(mandate);
  const value: ResolvedMandate = {
    mandateKey,
    mandateId: mandate.id,
    agentId,
    holderType,
    configOverrides,
    provenance,
    contract: parseMandateContract(contractOfMandate(mandate)),
    inputKind: inputKindOfMandate(mandate),
    outputKind: mandate.output_kind,
    provisionKey: wave1.provisionKey,
    pins: wave1.pins,
    pinnedContext: wave1.pinnedContext,
    presentation,
  };
  cache.set(cacheKey, { at: Date.now(), value });
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
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
      out[key] = cached.value;
    else missing.push(key);
  }
  if (missing.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await mandateDefinitions(supabase)
    .select(`mandate_key, ${MANDATE_HOLDER_COLUMNS}, is_enabled` as const)
    .in("mandate_key", missing)
    .is("deleted_at", null);
  if (error) throw error;

  const found = new Set<string>();
  for (const row of data ?? []) {
    found.add(row.mandate_key);
    const holder = holderOfMandate(row);
    if (!holder.holderId) {
      // Master id is backfilled on every research mandate; a NULL here is a data
      // defect worth screaming about, not silently skipping.
      console.error(
        `[mandates] mandate "${row.mandate_key}" has no default Holder — backfill the master id on ${MANDATE_STORAGE_LABEL}`,
      );
      continue;
    }
    const value: MandatePin = {
      mandateKey: row.mandate_key,
      agentId: holder.holderId,
      versionId: holder.versionId,
      useLatest: isFloatingMandate(row),
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

/**
 * IDENTITY of a set of mandates — the row id, the human label, and whether it
 * is live — in ONE read.
 *
 * Chrome that LISTS mandates (the Agents header menu naming what AI runs on
 * this page) needs the label to render and the id to hang notes off, and it
 * must not go through `resolveMandate`: that is the RUN path and it throws on
 * disabled or version-pinned mandates, which is exactly right for running and
 * exactly wrong for listing. A key with no row is reported (`recordUnavailable`)
 * and simply absent from the result — a surface that names a mandate the
 * database does not have is a wiring defect worth seeing.
 */
export interface MandateIdentity {
  mandateKey: string;
  mandateId: string;
  label: string;
  description: string | null;
  defaultAgentId: string | null;
  isEnabled: boolean;
}

export async function fetchMandateIdentities(
  mandateKeys: readonly string[],
): Promise<Record<string, MandateIdentity>> {
  const keys = [...new Set(mandateKeys)].filter(Boolean);
  const out: Record<string, MandateIdentity> = {};
  if (keys.length === 0) return out;

  const { data, error } = await mandateDefinitions(createClient())
    .select(
      `id, mandate_key, label, description, ${MANDATE_HOLDER_COLUMNS}, is_enabled` as const,
    )
    .in("mandate_key", keys)
    .is("deleted_at", null);
  if (error) throw error;

  for (const row of data ?? []) {
    out[row.mandate_key] = {
      mandateKey: row.mandate_key,
      mandateId: row.id,
      label: row.label,
      description: row.description,
      defaultAgentId: holderOfMandate(row).holderId,
      isEnabled: row.is_enabled ?? true,
    };
  }
  for (const key of keys) {
    if (!out[key]) {
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

/** Fetch the platform-default Holder identities for a small set of mandates. */
export async function fetchMandateAssignments(
  mandateKeys: readonly string[],
): Promise<Record<string, MandateAssignment>> {
  const pins = await fetchMandatePins(mandateKeys);
  const agentIds = [...new Set(Object.values(pins).map((pin) => pin.agentId))];
  if (agentIds.length === 0) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name, agent_type")
    .in("id", agentIds);
  if (error) throw error;

  const identities = new Map(
    (data ?? []).map((agent) => [
      agent.id,
      { name: agent.name, agentType: agent.agent_type },
    ]),
  );
  const assignments: Record<string, MandateAssignment> = {};
  for (const [mandateKey, pin] of Object.entries(pins)) {
    const identity = identities.get(pin.agentId);
    assignments[mandateKey] = {
      ...pin,
      agentName: identity?.name ?? null,
      agentType: identity?.agentType ?? null,
    };
  }
  return assignments;
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
