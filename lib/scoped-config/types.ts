// lib/scoped-config/types.ts
//
// Client types for the scoped-configuration primitive (platform.feature_knob +
// platform.knob_override + the scfg_03 doors). One row of `knob_index` carries
// BOTH resolution state and presentation metadata, so no consumer ever needs a
// second read of platform.feature_knob.
//
// The shape below IS the live read contract — aidream migration
// 0630_knob_index_v2_scope_chain_ui_taxonomy.sql (applied 2026-09-11), the
// Unified Settings Platform's LANE A. Every field is returned on every call;
// nothing here is optional "until the contract lands".

export type KnobScopeKindName =
  | "organization"
  | "employer_profile"
  | "brand"
  | "pay_group"
  | "site"
  | "location"
  | "user"
  /** USD-9: precedence 110, below `user`; keyed by a device / instance id. */
  | "device";

export type KnobValueType =
  | "number"
  | "integer"
  | "boolean"
  | "string"
  | "enum"
  | "json"
  /** The value NEVER leaves the vault — `secret` carries set/not-set only. */
  | "secret";

/**
 * Where the effective value came from, BY RUNG NAME: "organization", "user",
 * "brand", "device", … — plus the two non-rung answers.
 */
export type KnobOrigin =
  | KnobScopeKindName
  | "platform_default"
  | "missing";

/**
 * Render hints carried on `platform.feature_knob.ui`. Every field is optional:
 * a key with no hints renders from `value_type` alone (enum → choice control
 * with `allowed_values`, bounded number → slider with its min/max, boolean →
 * switch). Hints steer presentation; they never change what may be written.
 */
export type KnobUiHints = {
  /** Section heading the key is grouped under in the centre pane. */
  group?: string;
  /** Sort position inside its group. Unset sorts last, then alphabetically. */
  order?: number;
  /** Explicit control choice. Omitted → derived from `value_type`. */
  control?:
    | "switch"
    /** Live registry spelling of `switch` (agent_directives.auto_apply_allowed). */
    | "toggle"
    | "select"
    | "segmented"
    | "radio"
    | "slider"
    | "number"
    | "text"
    | "textarea"
    | "secret"
    /** A model id from the AI catalog, shown as "<maker> <model>". */
    | "model"
    /** A voice id from the speech catalog, with pick-and-hear preview. */
    | "voice";
  /** One sentence under the control, in the person's language. */
  help?: string;
  placeholder?: string;
  /** Display format for numbers, e.g. "percent", "bytes", "duration". */
  format?: string;
  /** Opaque preview token — e.g. which engine plays a voice sample. */
  preview?: string;
};

/** The registry node a key is filed under — the product's own vocabulary. */
export type KnobTaxonomy = {
  node_id: string;
  node_level: "domain" | "feature" | "sub_feature" | string;
  node_slug: string;
  node_name: string;
  domain_slug: string;
  domain_name: string;
  feature_slug: string | null;
  feature_name: string | null;
};

/**
 * One rung that MAY hold this key, in precedence order (nearest LAST). A rung
 * this call did not address has `scope_id: null` and `is_set: false` — it is
 * still listed, because the UI shows the whole ladder, never only the rungs
 * in play.
 */
export type KnobScopeRung = {
  kind: KnobScopeKindName;
  precedence: number;
  scope_id: string | null;
  value: unknown;
  is_set: boolean;
  /** This organization has locked the rung (knob_rung_lock); its value is inert. */
  locked: boolean;
  /** This rung is the one the effective value came from. */
  is_effective: boolean;
};

/** Why writing is forbidden at the rung this caller would edit. */
export type KnobLocked = {
  by_kind: KnobScopeKindName | "platform";
  locked_by: "platform" | "organization";
  reason: "platform_locked" | "org_locked";
  /** The sentence to show. */
  detail: string;
};

export type KnobCanWriteReason =
  | "platform_locked"
  | "org_locked"
  | "no_addressable_scope"
  | "not_self"
  | "not_org_admin";

/** A secret key's state. The value itself is never returned. */
export type KnobSecretState = {
  /** `unknown` means this reader has no canonical vault-state evidence. */
  state: "set" | "not_set" | "unknown";
  vault_key: string | null;
};

/** One key as platform.knob_index projects it. */
export type ScopedKnob = {
  feature: string;
  key: string;
  full_key: string;
  label: string;
  description: string;
  value_type: KnobValueType;
  unit: string | null;
  allowed_values: unknown[] | null;
  min_value: number | null;
  max_value: number | null;
  basis: string | null;
  set_by: "agent" | "human";
  review_due: string | null;
  overridable_by: KnobScopeKindName[];
  override_direction: "any" | "lower_only" | "raise_only";
  bound_value: unknown;
  platform_locked: boolean;
  /** Rungs THIS organization has locked for this key (scfg_50); [] if none. */
  org_locked_kinds: KnobScopeKindName[];
  /** Convenience: 'user' is in org_locked_kinds — personal overrides are off here. */
  user_override_locked: boolean;
  platform_default: unknown;
  shipped_default: unknown;
  org_override: unknown;
  user_override: unknown;
  effective_value: unknown;
  origin: KnobOrigin;
  origin_scope_id: string | null;
  origin_precedence: number | null;
  is_overridden: boolean;
  out_of_range: boolean;

  /** Render hints. `{}` means "derive from value_type". */
  ui: KnobUiHints;
  /** Registry node. `null` → the key is not filed under a domain yet. */
  taxonomy: KnobTaxonomy | null;
  /** Whether a change applies on next load or immediately (USD-7). */
  propagation: "next_load" | "instant";
  /** Every rung named in `overridable_by`, precedence ascending. */
  scope_chain: KnobScopeRung[];
  /** Set when an empty `overridable_by` or a rung lock forbids writing. */
  locked: KnobLocked | null;
  /** The rung an edit would land on for THIS call; null when none is addressable. */
  write_rung: { kind: KnobScopeKindName | "platform"; scope_id: string | null } | null;
  /** Whether THIS caller may write at `write_rung`. */
  can_write: boolean;
  /** Why not, when `can_write` is false. */
  can_write_reason: KnobCanWriteReason | null;
  /** Only for `value_type: "secret"`; null otherwise. */
  secret: KnobSecretState | null;
};

/** platform.knob_override_set result: either granted or a structured refusal. */
export type KnobOverrideSetResult =
  | {
      ok: true;
      feature: string;
      key: string;
      scope_kind: string;
      scope_id: string;
      effective_value: unknown;
      origin: string;
      key_removed?: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_authenticated"
        | "unregistered_key"
        | "unknown_scope_kind"
        | "not_overridable"
        | "org_locked"
        | "forbidden"
        | "validation"
        | "scope_not_in_organization"
        | "raise_not_permitted"
        | "lower_not_permitted"
        | "below_statutory_floor";
      detail?: string;
      feature?: string;
      key?: string;
      field?: string;
      ceiling?: unknown;
      floor?: unknown;
    };

export type KnobOverrideCount = {
  feature: string;
  key: string;
  org_count: number;
  total_count: number;
};

/** platform.knob_rung_lock_set result (scfg_50). */
export type KnobRungLockSetResult =
  | {
      ok: true;
      feature: string;
      key: string;
      organization_id: string;
      locked_kinds?: KnobScopeKindName[];
      lock_removed?: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_authenticated"
        | "forbidden"
        | "unregistered_key"
        | "unknown_scope_kind"
        | "validation";
      detail?: string;
      scope_kind?: string;
    };
