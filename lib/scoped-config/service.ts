// lib/scoped-config/service.ts
//
// The client half of the scoped-configuration doors (scfg_03). Three RPCs,
// client-direct to Supabase under the caller's JWT — the SECURITY DEFINER
// bodies own every permission decision, so there is nothing to gate here.
//
// This is the ONE client path to effective configuration. Do not read
// platform.knob_override directly from a surface, and do not add a second
// metadata read of platform.feature_knob beside knob_index — the index row
// already carries label/allowed_values/min/max/unit (the dual read
// useHrKnobs was forced into is exactly what this replaces).

import { createClient } from "@/utils/supabase/client";

import type {
  KnobOverrideCount,
  KnobOverrideSetResult,
  KnobRungLockSetResult,
  KnobScopeKindName,
  ScopedKnob,
} from "./types";
import { invalidateEffectiveKnob } from "./effectiveKnobs";

export type KnobScopeRef = {
  kind: KnobScopeKindName;
  id: string;
};

/** One standing override row at a per-row rung, as the override store holds it. */
export type KnobRungOverrideRow = {
  scope_kind: KnobScopeKindName;
  scope_id: string;
  value: unknown;
  updated_at: string | null;
  updated_by: string | null;
  set_note: string | null;
};

export async function fetchKnobIndex(options: {
  organizationId: string;
  featurePrefix?: string;
  userId?: string;
  deviceId?: string;
  scopes?: KnobScopeRef[];
  overriddenOnly?: boolean;
}): Promise<ScopedKnob[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_index", {
    p_organization_id: options.organizationId,
    p_feature_prefix: options.featurePrefix,
    p_user_id: options.userId,
    p_device_id: options.deviceId,
    p_scopes: options.scopes,
    p_overridden_only: options.overriddenOnly ?? false,
  });
  if (error) throw new Error(`knob_index failed: ${error.message}`);
  const payload = data as { keys?: ScopedKnob[] } | null;
  return payload?.keys ?? [];
}

/**
 * Write (or clear) one override at one rung. `value: null` CLEARS — the key is
 * removed so "inherits" and "set to nothing" can never be confused. A refusal
 * comes back as `{ ok: false, reason, detail }`, never a thrown exception:
 * the reasons are part of the contract and surfaces render them.
 */
export async function setKnobOverride(options: {
  feature: string;
  key: string;
  scopeKind: KnobScopeKindName;
  scopeId: string;
  organizationId: string;
  value: unknown;
  note?: string;
}): Promise<KnobOverrideSetResult> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_override_set", {
    p_feature: options.feature,
    p_key: options.key,
    p_scope_kind: options.scopeKind,
    p_scope_id: options.scopeId,
    p_organization_id: options.organizationId,
    p_value: options.value as never,
    p_note: options.note,
  });
  if (error) throw new Error(`knob_override_set failed: ${error.message}`);
  // The runtime readers of this key (`lib/scoped-config/effectiveKnobs.ts`)
  // forget their cached answer, so the feature that consumes the setting
  // changes behaviour in THIS tab the moment the screen says "saved".
  invalidateEffectiveKnob(`${options.feature}.${options.key}`);
  return data as KnobOverrideSetResult;
}

/**
 * EVERY standing override for ONE key at the per-row rungs (table / agent /
 * sub-organization) inside ONE organization — the list the per-rung override
 * picker renders (DD-183).
 *
 * Why a table read and not `knob_index`: `knob_index` answers "what is the
 * value HERE", for the rungs the CALLER addressed. A screen that wants "which
 * tables have their own value for this key" does not know the rows to address
 * — that is the question. Addressing all 800 registered tables to discover the
 * three that are set would be a read of the whole catalogue per knob.
 *
 * This is a LIST read, never a resolution read: it returns the rows that exist
 * and nothing about precedence, and no surface may derive an effective value
 * from it (that stays `knob_index` / `knob_resolve`, which is what the header
 * of this file forbids going around). `platform.knob_override` grants
 * `authenticated` SELECT under `knob_override_read`
 * (`organization_id in (select iam.my_orgs())`), so the caller's own JWT and
 * RLS decide what comes back — there is nothing to gate here either.
 */
export async function fetchKnobRungOverrides(options: {
  feature: string;
  key: string;
  organizationId: string;
  /** The rungs to list. Empty list = nothing to ask for, so nothing is asked. */
  kinds: readonly KnobScopeKindName[];
}): Promise<KnobRungOverrideRow[]> {
  if (options.kinds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("knob_override")
    .select("scope_kind, scope_id, value, updated_at, updated_by, set_note")
    .eq("feature", options.feature)
    .eq("key", options.key)
    .eq("organization_id", options.organizationId)
    .in("scope_kind", options.kinds as string[]);
  if (error) throw new Error(`Reading the existing overrides failed: ${error.message}`);
  return ((data ?? []) as KnobRungOverrideRow[]).filter(
    (row): row is KnobRungOverrideRow => row.scope_id !== null,
  );
}

/**
 * Set (or clear) THIS organization's rung lock for one key (scfg_50) — the org
 * turning off user-level (or sub-org) control of one setting even where the
 * platform allows it. `lockedKinds: []` or omitted CLEARS the lock; standing
 * overrides on a locked rung go inert (never deleted), so unlocking restores
 * them. Org owner/admin gated inside the SQL door.
 */
export async function setKnobRungLock(options: {
  feature: string;
  key: string;
  organizationId: string;
  lockedKinds: KnobScopeKindName[];
  note?: string;
}): Promise<KnobRungLockSetResult> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_rung_lock_set", {
    p_feature: options.feature,
    p_key: options.key,
    p_organization_id: options.organizationId,
    p_locked_kinds: options.lockedKinds,
    p_note: options.note,
  });
  if (error) throw new Error(`knob_rung_lock_set failed: ${error.message}`);
  return data as KnobRungLockSetResult;
}

/** Per-knob override counts for the platform admin surface (admin-gated in SQL). */
export async function fetchKnobOverrideCounts(
  featurePrefix?: string,
): Promise<KnobOverrideCount[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_override_count", {
    p_feature_prefix: featurePrefix,
  });
  if (error) throw new Error(`knob_override_count failed: ${error.message}`);
  return (data as KnobOverrideCount[] | null) ?? [];
}
