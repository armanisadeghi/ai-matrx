// features/hr/settings/service.ts
//
// THE THREE DOORS THE SETTINGS LANE NEEDS AND `features/hr/service.ts` DOES NOT
// CARRY. Everything else this lane reads or writes comes from that file — this is
// an addition, never a second transport, and it uses the same `HrResult<T>` so a
// refusal stays DATA at every call site.
//
// 🚨 A REFUSAL IS DATA. `supabase.rpc()` does not throw when the server says no,
// and nothing below throws either. Never let a refusal look like an empty panel.
//
// 🚨 MAPPED, NOT CAST — the same law `features/hr/time/api/service.ts` runs on. A
// `return data as SomeType` cannot fail, so the day the live payload moves, the fields
// arrive `undefined` and the surface renders a blank, a NaN, or a crash — at runtime,
// only once real data exists. Eight defects of that class landed across this codebase in
// a single day. So every door below either has a field-by-field mapper whose header
// records the live-vs-`types.ts` diff it found, or it carries a dated ✅ VERIFIED ALIGNED
// note saying how the alignment was checked, so the next sweep can skip it without
// re-reading the database. `types.ts` is NOT rewritten to match the wire: where the two
// genuinely disagree, the mapper says which side is right and why.

import { supabase } from "@/utils/supabase/client";

import type { HrResult } from "../types";
import type {
  HrCustomFieldDefinition,
  HrCustomFieldTarget,
  HrEmployerProfileRead,
} from "./types";

const PG_INSUFFICIENT_PRIVILEGE = "42501";

function denied(
  reason: string,
  detail?: string | null,
  auditId?: string | null,
  field?: string | null,
  door?: string | null,
  payload?: Record<string, unknown> | null,
): HrResult<never> {
  // `field` / `door` / `payload` are the WRITE dialect's half of a refusal — the offending
  // control, where to go and fix it, and anything extra the envelope carried. Dropping them
  // renders "some fields could not be saved" instead of naming the field.
  return {
    ok: false,
    kind: "denied",
    reason,
    detail: detail ?? null,
    auditId: auditId ?? null,
    field: field ?? null,
    door: door ?? null,
    payload: payload ?? {},
  };
}

function failed(message: string, code?: string | null): HrResult<never> {
  return { ok: false, kind: "failed", message, code: code ?? null };
}

// ── Narrowers, so a mapper can be read at a glance ──────────────────────────
//
// Each one answers "did the wire actually send this, in this shape?" and returns
// `null` when it did not. NOTHING here invents a value: a missing number stays
// missing rather than becoming 0, and a missing boolean stays missing rather than
// becoming `false`. Both of those coercions are live defects on this surface —
// see `mapEmployerProfileRow`.

function asBag(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
const asText = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
/** A jsonb column declared `not null default '{}'`; anything else is an empty bag. */
const asJsonObject = (v: unknown): Record<string, unknown> => asBag(v) ?? {};
/** A `text[]` column declared `not null default '{}'`; non-strings are dropped, loudly typed. */
const asTextList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// ── Route 68 — the employer of record ───────────────────────────────────────

/**
 * 🚨 **MAPPED, NOT CAST.** `hr._project_row` builds this row as `to_jsonb(t)` over the
 * whole `hr.employer_profile` table, so the envelope carries EVERY column and the
 * column list is free to move under a cast that can never fail. Verified field by
 * field against `information_schema.columns` and against the live sandbox row
 * (`2643e470-…`) on **2026-08-26**.
 *
 * THE LIVE-VS-`types.ts` DIFF, in full:
 *   • Every field `HrEmployerProfileRead` declares EXISTS on the wire, under the same
 *     snake_case name. `supabase.rpc()` does not camelize, so the keys are read as-is.
 *   • `ein_last4` does NOT exist — there is no such column and no projection builds one.
 *     `types.ts` already declares it optional and says why. This mapper therefore
 *     **omits the key entirely** unless the server one day sends it, which is what makes
 *     the type's "the panel lights up the moment the lane ships it" promise real. It is
 *     never defaulted to a string, because a fabricated last-4 is worse than no last-4.
 *   • The wire carries SIX fields the type does not declare — `created_by`, `updated_by`,
 *     `created_at`, `deleted_at`, `metadata`, `visibility`. types.ts is RIGHT to omit
 *     them: none is route 68's business, and `_door_list` already filters `deleted_at`.
 *     They are dropped here rather than widened into the type.
 *   • `ein` is stripped upstream by `hr._project_row` (`client_excluded_columns = {ein}`
 *     on `platform.entity_types`), so it never reaches this function at all.
 *
 * THREE FIELDS WHERE A DEFAULT WOULD BE A LIE, not a convenience:
 *   • `headcount_total` is nullable and IS null on the live row. `HrEmployerPanel` renders
 *     `Derived: ${headcount_total} employees as of …` whenever it is non-null, so a `?? 0`
 *     here prints **"Derived: 0 employees"** underneath the FMLA and ACA flags — a
 *     confident, wrong statement of law. Null stays null and the panel says nobody has
 *     established it.
 *   • the four `is_*` applicability flags are nullable and ALL null on the live row. A
 *     `=== true` narrowing turns "nobody has established this" into a confident **false**
 *     — "not FMLA covered" asserted by nobody. Null is preserved exactly.
 *   • `version` is the optimistic-concurrency token the save path sends as
 *     `expected_version`. A manufactured version does not fail loudly; it either blocks
 *     every save or clobbers a concurrent one. So a row that arrives without a numeric
 *     `version` is REJECTED below rather than defaulted.
 */
function mapEmployerProfileRow(raw: unknown): HrEmployerProfileRead | null {
  const r = asBag(raw);
  if (!r) return null;

  // Identity + the concurrency token. Without all three this is not an employer profile
  // the editor can safely open, and handing the panel a half-row is how a save silently
  // targets the wrong version.
  const id = asText(r.id);
  const organizationId = asText(r.organization_id);
  const version = asNumber(r.version);
  if (id === null || organizationId === null || version === null) {
    console.error(
      "[hr/settings] The audited door returned an employer-profile row without an id, " +
        "organization_id, or version. It is being dropped rather than rendered, because " +
        "the editor sends `version` back as `expected_version`.",
      { hasId: id !== null, hasOrganizationId: organizationId !== null, hasVersion: version !== null },
    );
    return null;
  }

  return {
    id,
    organization_id: organizationId,
    // `legal_name` is `not null` in the table, so an absent one means the envelope changed
    // shape. A loud placeholder beats an empty heading nobody can diagnose.
    legal_name:
      asText(r.legal_name) ?? "(the server did not send this employer's legal name)",
    dba_name: asText(r.dba_name),
    entity_form: asText(r.entity_form),
    formation_state: asText(r.formation_state),
    primary_address: asJsonObject(r.primary_address),
    workers_comp_policy: asJsonObject(r.workers_comp_policy),
    careers_slug: asText(r.careers_slug),
    applicability_basis: asJsonObject(r.applicability_basis),

    // Nullable on purpose — see the header. Never 0, never false.
    headcount_total: asNumber(r.headcount_total),
    headcount_asof_date: asText(r.headcount_asof_date),
    is_fmla_covered: asBool(r.is_fmla_covered),
    is_aca_ale: asBool(r.is_aca_ale),
    is_eeo1_filer: asBool(r.is_eeo1_filer),
    is_federal_contractor: asBool(r.is_federal_contractor),

    everify_required_states: asTextList(r.everify_required_states),
    settings: asJsonObject(r.settings),
    version,
    // `not null` in the table. The empty-string fallback is deliberately FALSY, so a
    // future `updated_at && formatDate(...)` renders nothing rather than "Invalid Date";
    // no timestamp is manufactured.
    updated_at: asText(r.updated_at) ?? "",

    // Present only if the server ever projects it. See the header.
    ...(typeof r.ein_last4 === "string" ? { ein_last4: r.ein_last4 } : {}),
  };
}

/**
 * The one employer profile for this org, through the AUDITED confidential door.
 *
 * 🚨 WHY A LIST CALL FOR A SINGLE ROW — CORRECTED 2026-08-26. The reason this comment
 * used to give is now FALSE and was deleted: it claimed `hr_my_context` and
 * `hr_structure_list` return no `employer_profile_id`. **Both return it today** — read
 * out of both function bodies, where the server lane labelled the addition "RECORDED
 * DECISION 28: route 68 had to make an audited confidential call just to learn the id of
 * the profile it was editing." `hr_my_context` sends it at `.active.employer_profile_id`;
 * `hr_structure_list` sends it at the top level.
 *
 * What IS still true, and is the whole reason this call stays a list call:
 *   • the `hr` schema is genuinely NOT in PostgREST — the `authenticator` role's
 *     `pgrst.db_schemas` names `platform`, `iam`, and 50 others, and not `hr` — so every
 *     client read of an `hr` table goes through a `public.hr_*` SECURITY DEFINER door;
 *   • `hr_confidential_get` takes the profile's **id**, and this function's ONE call site
 *     (`HrEmployerPanel`) passes an organization. `hr_confidential_list` filters by org
 *     inside `hr._door_list`, so it is the one door that turns what the call site has into
 *     the row it wants. Resolving the id here instead would mean a second RPC that only
 *     repeats work `useHrContext` already did.
 *
 * 🔭 THE SWITCH THE NEXT AGENT SHOULD MAKE, and the concrete thing it buys. `hr._door_list`
 * returns `granted: false` on exactly ONE branch — `d.caps is null`, the "this token has no
 * door" case — and `hr._door_spec('hr_employer_profile')` returns
 * `caps = {working_record.read}`, so **that branch can never fire for this token**. A caller
 * with no standing therefore gets `granted: true, row_count: 0` while the door's own audit
 * row records `granted = false, basis = 'refused'`. A refusal is indistinguishable from an
 * absent profile on this wire, which is why the panel's empty state has to hedge in prose.
 * `hr_confidential_get` answers `{granted: false, reason, detail, audit_id}` with the real
 * per-row verdict. Once `HrEmployerPanel` passes the `employer_profile_id` it ALREADY holds
 * in `useHrContext().active`, move this to `hr_confidential_get` and the hedge becomes an
 * answer. `HrSettingsStructure.employer_profile_id` was added to `types.ts` for that.
 *
 * The returned row has `ein` STRIPPED by `hr._project_row` (`client_excluded_columns`
 * on `platform.entity_types`). See `types.ts` — the panel says so in words rather
 * than rendering a mask over a value it does not have.
 */
export async function fetchHrEmployerProfile(args: {
  organizationId: string;
  purpose?: string;
}): Promise<
  HrResult<{
    profile: HrEmployerProfileRead | null;
    audit_id: string | null;
    /**
     * What the door said it kept, straight off `hr._door_list`'s `row_count`. Reported
     * so "0 of N" can never be assembled out of a length this file guessed at; `null`
     * means the envelope did not carry it.
     */
    row_count: number | null;
  }>
> {
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

  // 🚨 `<unknown>` FROM THE DOOR, THEN MAPPED. The envelope below is the literal
  // `jsonb_build_object` at the end of `hr._door_list` (read live 2026-08-26): the granted
  // branch builds `{granted, rows, row_count, next_cursor, audit_id}` and the no-door
  // branch builds `{granted, reason, detail, audit_id}`. The old inline type declared
  // neither `row_count` nor `next_cursor`, so a pager built on it would have had to invent
  // a total from `rows.length`.
  const payload = asBag(data);
  if (!payload) {
    return failed(
      "The employer profile came back in a shape this app does not understand.",
      null,
    );
  }

  const auditId = asText(payload.audit_id);
  if (payload.granted === false) {
    // Unreachable for this token today (see the header), and kept anyway: the day a
    // capability is pulled off `hr._door_spec`, this is the branch that must not be missing.
    return denied(asText(payload.reason) ?? "not_reachable", asText(payload.detail), auditId);
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

  const profile = rows.length > 0 ? mapEmployerProfileRow(rows[0]) : null;

  return {
    ok: true,
    data: {
      profile,
      audit_id: auditId,
      row_count: asNumber(payload.row_count),
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

  // ✅ VERIFIED ALIGNED 2026-08-26 — CAST LEFT ALONE ON PURPOSE, so the next cast sweep
  // skips it. How it was verified: every one of the eleven selected columns was read out
  // of `information_schema.columns` for `platform.feature_knob`, and four live `hr.%` rows
  // were serialised through `to_jsonb()` — the same path PostgREST takes — to check the
  // JSON types rather than the SQL ones. Findings:
  //   • `min_value` / `max_value` are `numeric`, and `to_jsonb` emits them UNQUOTED
  //     (`480`, `5`, `10`, `0`), so `number | null` is true and a bounds check will not
  //     silently compare against a string. Note `min_value: 0` occurs for real, which is
  //     exactly why a `?? 0` default anywhere near this shape would be undetectable.
  //   • `review_due` is `date` → `"2026-11-24"`; `allowed_values` is `jsonb` → array or
  //     null, correctly typed `unknown`; `unit` is null on most rows.
  //   • `label` and `description` are `not null` in the table while `HrKnobMetadata`
  //     declares them `string | null`. That is a WIDENING, not a mismatch — the type
  //     tolerates a column that has not been backfilled — so it is left as it stands.
  // A mapper here would restate the select list with no defect to prevent.
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

  // ✅ VERIFIED ALIGNED 2026-08-26 — BOTH CASTS LEFT ALONE ON PURPOSE. How it was
  // verified: both select lists were checked column by column against
  // `information_schema.columns` for `platform.custom_field_definition` and
  // `platform.custom_field_target`, and live `hr_*` target rows were serialised through
  // `to_jsonb()`. Every selected column exists, and every nullability matches what
  // `types.ts` declares — `target_token` and `notes` nullable; `field_order`,
  // `is_required`, `is_multi`, `sensitivity_tier`, `ai_exposure`, `is_enabled`,
  // `validation_mode`, `sensitivity_ceiling`, `ai_exposure_ceiling` all `not null`;
  // `max_fields` / `max_custom_bytes` nullable and null on every live row, which
  // `number | null` says correctly and a `?? 0` would turn into a ceiling of zero.
  // `options` is nullable `jsonb`, typed `unknown`, which is right — L14 owns its schema.
  // This is a plain RLS-checked PostgREST read: `platform` IS in the `authenticator`
  // role's `pgrst.db_schemas`, and `hr` genuinely is NOT (checked live in
  // `pg_db_role_setting`), which is the standing reason the `hr` reads above use doors.
  return {
    ok: true,
    data: {
      definitions: (definitionsResult.data ?? []) as HrCustomFieldDefinition[],
      targets: (targetsResult.data ?? []) as HrCustomFieldTarget[],
    },
  };
}
