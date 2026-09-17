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
import { ensureEffectiveKnob, invalidateEffectiveKnob } from "./effectiveKnobs";

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

/** A server refusal as ONE sentence a screen can show. */
export function knobRefusalSentence(result: {
  reason?: string | null;
  detail?: string | null;
}): string {
  return (
    [result.reason, result.detail].filter(Boolean).join(" — ") ||
    "The setting was refused and the door gave no reason."
  );
}

function asEntryMap(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type KnobMapEntrySetResult =
  | { ok: true; map: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * 🚨 CHANGE ONE ENTRY OF A MAP-VALUED KNOB AT THE PERSON'S OWN RUNG.
 *
 * Some knobs hold a map of per-thing exceptions rather than one value
 * (`ui.detail.presentation_by_type` = `{"file":"docked"}`). The write door
 * REPLACES the whole value — `platform.knob_override_set(p_value jsonb)` offers
 * no merge and no precondition (read live from `pg_proc`, 2026-09-17) — so a
 * per-entry change has to carry every other entry with it, and the two ways
 * that goes wrong are both closed here:
 *
 *  1. **A FAILED READ IS NOT AN EMPTY MAP.** A caller that read the current map
 *     with `.catch(() => undefined)` and merged into `{}` turned one transient
 *     `knob_resolve` miss into silent data loss: the one entry it was saving
 *     became the person's WHOLE override and every other exception was gone. A
 *     read that fails REFUSES the write and returns the sentence to show
 *     (`features/window-panels/detail/savePresentation.ts` was the instance;
 *     Bugbot, frontend PR 228, commit 4cbd9e45).
 *  2. **THE READ IS FRESH.** `effectiveKnobs` caches an answer for 60s, so
 *     merging into the cached map re-writes a minute-old map and drops whatever
 *     another tab or another device saved in between. The cached entry is
 *     forgotten first and the ladder is asked again immediately before the write.
 *
 * WHAT IS STILL OPEN, SAID PLAINLY: two writers inside the same round trip. The
 * last write wins for the entries it carries, and nothing can see it from here —
 * `guardedUpdate` cannot ride this write, because the write is an RPC through
 * the key's declared door and never a table update, and the door exposes no
 * `updated_at` to guard on. Closing it needs a per-entry merge (or a
 * precondition) AT THE DOOR; logged in FOUND_DEFECTS.md. A verify-after-write
 * here would be a check that cannot fail — our own write is what it would read
 * back — so there is none.
 *
 * The base is the EFFECTIVE map (organization → user), not the person's own
 * override row: for a map knob whose rungs replace one another, writing only the
 * entries the person set would drop the organization's exceptions for every
 * other thing from that person's experience the moment they set their first one.
 */
export async function setUserKnobMapEntry(options: {
  feature: string;
  key: string;
  /** The map key being changed (a record type, a table token, an id…). */
  entryKey: string;
  entryValue: unknown;
  userId: string;
  organizationId: string;
  note?: string;
}): Promise<KnobMapEntrySetResult> {
  const fullKey = `${options.feature}.${options.key}`;
  let current: unknown;
  try {
    invalidateEffectiveKnob(fullKey);
    current = await ensureEffectiveKnob(options.organizationId, options.userId, fullKey);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason:
        `Nothing was saved: your other choices for this setting could not be read (${message}), ` +
        "and saving now would have replaced all of them with this one. Try again in a moment.",
    };
  }
  const base = current === undefined || current === null ? {} : asEntryMap(current);
  if (!base) {
    return {
      ok: false,
      reason:
        `Nothing was saved: this setting currently holds ${JSON.stringify(current)}, which is not a ` +
        "list of per-item choices, so one item cannot be changed without replacing the whole value.",
    };
  }
  const map = { ...base, [options.entryKey]: options.entryValue };
  const result = await setKnobOverride({
    feature: options.feature,
    key: options.key,
    scopeKind: "user",
    scopeId: options.userId,
    organizationId: options.organizationId,
    value: map,
    note: options.note,
  });
  return result.ok ? { ok: true, map } : { ok: false, reason: knobRefusalSentence(result) };
}

/**
 * 🚨 DD-221 — WHICH DOOR WRITES THIS KEY, AND MAY I USE IT.
 *
 * `platform.knob_override_set` is not the one write door; it is the DEFAULT
 * one. Authority belongs to the KEY, and each feature namespace declares the
 * door that carries it (`platform.knob_write_door`). `hr.` declares
 * `public.hr_knob_set` / `public.hr_knob_clear`, because HR's own gate admits
 * an HR admin who is not an org owner/admin, and HR's own audit trail records
 * the write. Measured live 2026-09-14: the same pay-group exception was
 * REFUSED to a real HR admin at the platform door and ACCEPTED at HR's, and an
 * org owner's write through the platform door left `hr.access_audit` untouched
 * (1842 rows before, 1842 after). A screen that picks the door by which module
 * it lives in narrows a capability and holes an audit trail, silently.
 *
 * `may_write` comes back from the same read, computed server-side with the
 * predicates the real gates use — the surface never re-states a gate, and never
 * infers one from `org_role`.
 */
export type KnobWriteDoor = {
  key: string;
  featurePrefix: string;
  /** A schema-qualified function name, e.g. `public.hr_knob_set`. */
  setDoor: string;
  clearDoor: string;
  authorityKind: string;
  /** Null when no organization was named, so no authority was decided. */
  mayWrite: boolean | null;
  /** The sentence to show when `mayWrite` is false. Always present. */
  authorityDetail: string;
  /** Why this namespace declares this door — for a developer, not a screen. */
  reason: string;
};

type KnobWriteDoorPayload =
  | {
      ok: true;
      key: string;
      feature_prefix: string;
      set_door: string;
      clear_door: string;
      authority_kind: string;
      may_write: boolean | null;
      authority_detail: string;
      reason: string;
    }
  | { ok: false; reason: string; detail?: string };

export async function fetchKnobWriteDoor(options: {
  fullKey: string;
  organizationId: string;
}): Promise<KnobWriteDoor> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_write_door_for", {
    p_key: options.fullKey,
    p_organization_id: options.organizationId,
  });
  if (error) throw new Error(`knob_write_door_for failed: ${error.message}`);
  const payload = (data ?? null) as unknown as KnobWriteDoorPayload | null;
  if (!payload) throw new Error(`knob_write_door_for(${options.fullKey}) returned nothing`);
  if (!payload.ok) {
    throw new Error(payload.detail ?? payload.reason.replace(/_/g, " "));
  }
  return {
    key: payload.key,
    featurePrefix: payload.feature_prefix,
    setDoor: payload.set_door,
    clearDoor: payload.clear_door,
    authorityKind: payload.authority_kind,
    mayWrite: payload.may_write,
    authorityDetail: payload.authority_detail,
    reason: payload.reason,
  };
}

/**
 * Write (or clear) one override THROUGH THE DOOR THE KEY DECLARES (DD-221).
 *
 * Every door here takes the same five things and answers the same envelope, so
 * this is a dispatch and never a translation layer: no door's semantics are
 * re-implemented, and a door this file does not know is an ERROR naming itself,
 * never a quiet fall back to the platform door — falling back is precisely the
 * bug (an `hr.` key written through `knob_override_set` passes the wrong gate
 * and leaves no HR audit row).
 */
export async function writeKnobOverrideThroughDoor(options: {
  door: KnobWriteDoor;
  feature: string;
  key: string;
  scopeKind: KnobScopeKindName;
  scopeId: string;
  organizationId: string;
  /** `null` CLEARS — the row is removed, so "inherits" and "set to nothing" never blur. */
  value: unknown;
  note?: string;
}): Promise<KnobOverrideSetResult> {
  const { door, value } = options;
  const doorName = value === null ? door.clearDoor : door.setDoor;

  if (doorName === "platform.knob_override_set") {
    return setKnobOverride(options);
  }

  if (doorName === "public.hr_knob_set" || doorName === "public.hr_knob_clear") {
    const supabase = createClient();
    const { data, error } =
      value === null
        ? await supabase.rpc("hr_knob_clear", {
            p_organization_id: options.organizationId,
            p_feature: options.feature,
            p_key: options.key,
            p_scope_kind: options.scopeKind,
            p_scope_id: options.scopeId,
          })
        : await supabase.rpc("hr_knob_set", {
            p_organization_id: options.organizationId,
            p_feature: options.feature,
            p_key: options.key,
            p_value: value as never,
            p_scope_kind: options.scopeKind,
            p_scope_id: options.scopeId,
          });
    if (error) throw new Error(`${doorName} failed: ${error.message}`);
    invalidateEffectiveKnob(`${options.feature}.${options.key}`);
    return data as unknown as KnobOverrideSetResult;
  }

  throw new Error(
    `${options.feature}.${options.key} declares ${doorName} as its write door, and this client does not know how to call it. Teach lib/scoped-config/service.ts that door, or correct the declaration in platform.knob_write_door.`,
  );
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
