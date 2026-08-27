// features/hr/settings/service.ts
//
// THE THREE DOORS THE SETTINGS LANE NEEDS AND `features/hr/service.ts` DOES NOT
// CARRY. Everything else this lane reads or writes comes from that file — this is
// an addition, never a second transport, and it uses the same `HrResult<T>` so a
// refusal stays DATA at every call site.
//
// 🚨 A REFUSAL IS DATA. `supabase.rpc()` does not throw when the server says no,
// and nothing below throws either. Never let a refusal look like an empty panel.

import { supabase } from "@/utils/supabase/client";

import type { HrResult } from "../types";
import type {
  HrCustomFieldDefinition,
  HrCustomFieldTarget,
  HrEmployerProfileRead,
} from "./types";

const PG_INSUFFICIENT_PRIVILEGE = "42501";

function denied(reason: string, detail?: string | null, auditId?: string | null): HrResult<never> {
  return { ok: false, kind: "denied", reason, detail: detail ?? null, auditId: auditId ?? null };
}

function failed(message: string, code?: string | null): HrResult<never> {
  return { ok: false, kind: "failed", message, code: code ?? null };
}

// ── Route 68 — the employer of record ───────────────────────────────────────

/**
 * The one employer profile for this org, through the AUDITED confidential door.
 *
 * 🚨 WHY A LIST CALL FOR A SINGLE ROW. `hr_confidential_get` takes the profile's
 * **id**, and nothing the browser can already reach carries it: `hr_my_context`
 * returns no `employer_profile_id`, `hr_structure_list` returns no
 * `employer_profile_id`, and the `hr` schema is not in PostgREST so the row cannot
 * be selected. `hr_confidential_list('hr_employer_profile', {organization_id})`
 * filters by org inside `hr._door_list`, applies the same per-row verdict, and
 * writes the same audit row — so it is the only reachable read, not a shortcut.
 *
 * The returned row has `ein` STRIPPED by `hr._project_row` (`client_excluded_columns`
 * on `platform.entity_types`). See `types.ts` — the panel says so in words rather
 * than rendering a mask over a value it does not have.
 */
export async function fetchHrEmployerProfile(args: {
  organizationId: string;
  purpose?: string;
}): Promise<HrResult<{ profile: HrEmployerProfileRead | null; audit_id: string | null }>> {
  const { data, error } = await supabase.rpc("hr_confidential_list" as never, {
    p_token: "hr_employer_profile",
    p_filter: { organization_id: args.organizationId },
    p_limit: 2,
    p_cursor: null,
    p_purpose: args.purpose ?? "settings_employer_profile",
  } as never);

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      return denied("no_standing", error.message ?? null);
    }
    return failed(
      `The employer profile could not be loaded. ${
        error.message?.trim() || "The database did not say why."
      }`,
      error.code ?? null,
    );
  }

  const payload = data as
    | {
        granted?: boolean;
        reason?: string;
        detail?: string | null;
        audit_id?: string | null;
        rows?: unknown[];
      }
    | null;

  if (!payload || typeof payload !== "object") {
    return failed(
      "The employer profile came back in a shape this app does not understand.",
      null,
    );
  }
  if (payload.granted === false) {
    return denied(payload.reason ?? "not_reachable", payload.detail, payload.audit_id);
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  // One profile per org is a database rule; more than one is a defect worth seeing,
  // so the panel gets the first and the count is left visible in the console, not
  // silently collapsed.
  if (rows.length > 1) {
    console.error(
      `[hr/settings] ${rows.length} employer profiles for organization ${args.organizationId}. ` +
        "SPEC-EMPLOYEES §2.4 says one per org; the first is being rendered.",
    );
  }

  return {
    ok: true,
    data: {
      profile: (rows[0] as HrEmployerProfileRead | undefined) ?? null,
      audit_id: payload.audit_id ?? null,
    },
  };
}

// ── Route 67 — the knob METADATA the RPC does not project ───────────────────

/**
 * The presentation half of one configuration key: label, description, the
 * enumerated choices, the numeric bounds, the unit, and the review date.
 *
 * 🚨 THIS IS NOT A SECOND PATH TO THE EFFECTIVE VALUE. `hr_knob_index` is the ONLY
 * authority for `effective_value` and `origin` — it is the function that applies the
 * HR-admin gate and reads `iam.organizations.settings->'hr'`, and nothing here
 * touches either. What it does NOT project is the six presentation columns that
 * exist on `platform.feature_knob`: without `allowed_values` an `enum` control
 * degrades to a free-text box that can write a value the server will reject, and
 * without `min_value` / `max_value` a number control cannot say what it will accept.
 * `platform.feature_knob` carries a `feature_knob_read USING (true)` policy and the
 * `platform` schema IS exposed to PostgREST, so this is a plain RLS-checked read.
 */
export type HrKnobMetadata = {
  feature: string;
  key: string;
  value_type: string;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  allowed_values: unknown;
  label: string | null;
  description: string | null;
  basis: string | null;
  review_due: string | null;
};

export async function fetchHrKnobMetadata(): Promise<HrResult<HrKnobMetadata[]>> {
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    // One STRING LITERAL, deliberately: PostgREST infers the row type from the
    // literal, and a concatenated expression collapses it to `GenericStringError[]`.
    .select(
      "feature, key, value_type, unit, min_value, max_value, allowed_values, label, description, basis, review_due",
    )
    .like("feature", "hr.%")
    .order("feature", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    return failed(
      `The configuration key descriptions could not be loaded. ${
        error.message?.trim() || "The database did not say why."
      }`,
      error.code ?? null,
    );
  }

  return { ok: true, data: (data ?? []) as HrKnobMetadata[] };
}

// ── Route 73 — the custom-field registry, READ ONLY ─────────────────────────

/**
 * The HR tables that participate in the tier-1 custom-field kit (SPEC-EMPLOYEES §7.4).
 * These are ENTITY TOKENS, matching `platform.custom_field_definition.target_token`.
 */
export const HR_CUSTOM_FIELD_TOKENS = [
  "hr_employee",
  "hr_employment",
  "hr_position_assignment",
  "hr_location",
  "hr_department",
  "hr_job_title",
  "hr_incident",
] as const;

/**
 * Read the custom-field registry for this org's HR tokens.
 *
 * 🚨 READ ONLY, ON PURPOSE. The authoring surface — `CustomFieldsSection`,
 * `CustomFieldInput`, `customFieldColumns` — is lane L14's platform client kit and
 * DOES NOT EXIST. Building a competing kit here would produce two renderers for one
 * shape, which is the defect the one-component law exists to prevent. So route 73
 * renders the registry honestly and names L14 as the owner of the authoring half.
 *
 * The `platform` schema IS exposed to PostgREST (unlike `hr`), so this is a direct
 * RLS-checked read — no RPC, no Next.js hop.
 */
export async function fetchHrCustomFieldRegistry(args: {
  organizationId: string;
}): Promise<
  HrResult<{ definitions: HrCustomFieldDefinition[]; targets: HrCustomFieldTarget[] }>
> {
  const tokens = [...HR_CUSTOM_FIELD_TOKENS];

  const [definitionsResult, targetsResult] = await Promise.all([
    supabase
      .schema("platform")
      .from("custom_field_definition")
      // One STRING LITERAL — see `fetchHrKnobMetadata`.
      .select(
        "id, target_token, field_key, display_name, field_type, field_order, is_required, is_multi, sensitivity_tier, ai_exposure, reference_target_token, archived_at, options",
      )
      .eq("organization_id", args.organizationId)
      .in("target_token", tokens)
      .is("deleted_at", null)
      .order("target_token", { ascending: true })
      .order("field_order", { ascending: true }),
    supabase
      .schema("platform")
      .from("custom_field_target")
      .select(
        "id, target_token, is_enabled, max_fields, max_custom_bytes, sensitivity_ceiling, ai_exposure_ceiling, validation_mode, notes",
      )
      .eq("organization_id", args.organizationId)
      .in("target_token", tokens)
      .is("deleted_at", null)
      .order("target_token", { ascending: true }),
  ]);

  if (definitionsResult.error) {
    return failed(
      `The custom-field registry could not be loaded. ${
        definitionsResult.error.message?.trim() || "The database did not say why."
      }`,
      definitionsResult.error.code ?? null,
    );
  }
  if (targetsResult.error) {
    return failed(
      `The custom-field limits could not be loaded. ${
        targetsResult.error.message?.trim() || "The database did not say why."
      }`,
      targetsResult.error.code ?? null,
    );
  }

  return {
    ok: true,
    data: {
      definitions: (definitionsResult.data ?? []) as HrCustomFieldDefinition[],
      targets: (targetsResult.data ?? []) as HrCustomFieldTarget[],
    },
  };
}
