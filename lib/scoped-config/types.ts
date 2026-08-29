// lib/scoped-config/types.ts
//
// Client types for the scoped-configuration primitive (platform.feature_knob +
// platform.knob_override + the scfg_03 doors). One row of `knob_index` carries
// BOTH resolution state and presentation metadata, so no consumer ever needs a
// second read of platform.feature_knob.

export type KnobScopeKindName =
  | "organization"
  | "employer_profile"
  | "brand"
  | "pay_group"
  | "site"
  | "location"
  | "user";

export type KnobValueType =
  | "number"
  | "integer"
  | "boolean"
  | "string"
  | "enum"
  | "json";

export type KnobOrigin =
  | "user_override"
  | "org_override"
  | "platform_default"
  | "missing";

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
  platform_default: unknown;
  shipped_default: unknown;
  org_override: unknown;
  user_override: unknown;
  effective_value: unknown;
  origin: KnobOrigin;
  is_overridden: boolean;
  out_of_range: boolean;
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
