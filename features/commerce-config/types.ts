/**
 * features/commerce-config/types.ts
 *
 * W11 (folding in W1's frontend half) — the scoped-configuration surfaces
 * over the LIVE platform tables (applied + seeded 2026-08-29):
 * `platform.feature_knob` (now carrying `override_scope`),
 * `platform.org_knob_override`, `platform.user_knob_override`, and the two
 * setters `platform.org_knob_set` / `platform.user_knob_set`.
 *
 * TYPING NOTE (same documented removal path as
 * `features/commerce-intake/types.ts`): `override_scope`, the two override
 * tables and the two setter RPCs are not yet in the generated
 * `types/database.types.ts` (this container cannot run `pnpm db-types`), so
 * the rows are hand-declared here against the live columns and the client is
 * cast through `PlatformConfigSchema`. When the generated types catch up,
 * delete these declarations and project from `Database["platform"]`.
 */

import type { Json } from "@/types/database.types";

/** The maximum tier permitted to override a knob (`user` implies `org`). */
export type OverrideScope = "platform" | "org" | "user";

export type KnobValueType = "number" | "integer" | "boolean" | "string" | "enum";

/** `platform.feature_knob` — the ONE registry row (definition + platform value). */
export interface ScopedKnobRow {
  feature: string;
  key: string;
  value: Json;
  default_value: Json;
  value_type: KnobValueType;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  allowed_values: string[] | null;
  label: string;
  description: string;
  set_by: "agent" | "human";
  basis: string | null;
  review_due: string | null;
  override_scope: OverrideScope;
}

/** `platform.org_knob_override` — one org's standing override. */
export interface OrgKnobOverrideRow {
  id: string;
  organization_id: string;
  feature: string;
  key: string;
  value: Json;
  set_note: string | null;
  created_at: string;
  updated_at: string;
}

/** `platform.user_knob_override` — one member's override, org-qualified. */
export interface UserKnobOverrideRow {
  id: string;
  user_id: string;
  organization_id: string;
  feature: string;
  key: string;
  value: Json;
  set_note: string | null;
  created_at: string;
  updated_at: string;
}

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface PlatformConfigSchema {
  Tables: {
    feature_knob: TableShape<ScopedKnobRow>;
    org_knob_override: TableShape<OrgKnobOverrideRow>;
    user_knob_override: TableShape<UserKnobOverrideRow>;
  };
  Views: Record<string, never>;
  Functions: {
    /** NULL p_value = delete the override (reset to platform). Org-admin gated server-side. */
    org_knob_set: {
      Args: {
        p_organization_id: string;
        p_feature: string;
        p_key: string;
        p_value: Json | null;
      };
      Returns: undefined;
    };
    /** NULL p_value = delete the override (reset to org/platform). Member-gated server-side. */
    user_knob_set: {
      Args: {
        p_organization_id: string;
        p_feature: string;
        p_key: string;
        p_value: Json | null;
      };
      Returns: undefined;
    };
  };
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
}

// ── UI shapes ───────────────────────────────────────────────────────────────

/** One knob with the resolved override chain, as the config surface holds it. */
export interface ScopedKnob {
  feature: string;
  key: string;
  label: string;
  description: string;
  valueType: KnobValueType;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  allowedValues: string[] | null;
  overrideScope: OverrideScope;
  /** The platform value (what an org inherits with no override). */
  platformValue: Json;
  /** The org's standing override, if any. */
  orgValue: Json | undefined;
  /** The signed-in user's standing override, if any. */
  userValue: Json | undefined;
}

/** The value the pipeline resolves for this viewer: user ?? org ?? platform. */
export function effectiveValue(knob: ScopedKnob): Json {
  if (knob.overrideScope === "user" && knob.userValue !== undefined)
    return knob.userValue;
  if (knob.overrideScope !== "platform" && knob.orgValue !== undefined)
    return knob.orgValue;
  return knob.platformValue;
}

export function formatKnobValue(knob: Pick<ScopedKnob, "unit">, value: Json): string {
  const text =
    value === null
      ? "—"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return knob.unit ? `${text} ${knob.unit}` : text;
}
