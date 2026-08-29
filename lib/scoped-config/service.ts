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

export async function fetchKnobIndex(options: {
  organizationId: string;
  featurePrefix?: string;
  userId?: string;
  overriddenOnly?: boolean;
}): Promise<ScopedKnob[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_index", {
    p_organization_id: options.organizationId,
    p_feature_prefix: options.featurePrefix,
    p_user_id: options.userId,
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
  return data as KnobOverrideSetResult;
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
