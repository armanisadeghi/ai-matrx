// features/hr/settings/types.ts
//
// The shapes the ORG HR SETTINGS lane (routes 67–81) reads and writes, on top of
// the ones `features/hr/types.ts` already declares for the shipped `public.hr_*`
// doors. Nothing here re-declares a wire shape that file owns — it only adds the
// ones the settings surfaces need and the shared file does not carry.
//
// 🚨 EVERY SHAPE BELOW WAS READ OUT OF THE LIVE FUNCTION BODY OR THE LIVE COLUMN
// LIST (2026-08-26), never out of a spec table. Where the spec asks for a field
// the shipped door does not return, the type says so in a comment and the panel
// renders the gap in words — it never invents the value.

import type { HrKnob, HrLocation, HrDepartment, HrJobTitle } from "../types";

// ── Route 68 — the employer of record ───────────────────────────────────────

/**
 * `hr.employer_profile` as the audited door returns it.
 *
 * 🚨 `ein` IS NOT IN THIS TYPE AND CANNOT BE. `platform.entity_types` declares
 * `client_excluded_columns = {ein}` for `hr_employer_profile`, and `hr._project_row`
 * strips every excluded column before the envelope is built. So the browser gets
 * the profile with the EIN REMOVED — not masked, not last-4, removed.
 *
 * SPEC-EMPLOYEES §2.4 route 68 asks for "masked to last-4 with an audited reveal".
 * That needs the server to publish an `ein_last4` projection and a reveal door;
 * neither exists. `ein_last4` is declared optional here so the panel lights up the
 * moment the server lane ships it, and until then the panel says in words that the
 * number is on file and never leaves the database (§1.3 — absent, never masked).
 */
export type HrEmployerProfileRead = {
  id: string;
  organization_id: string;
  legal_name: string;
  dba_name: string | null;
  entity_form: string | null;
  formation_state: string | null;
  primary_address: unknown;
  workers_comp_policy: unknown;
  careers_slug: string | null;
  /** The derivation inputs behind every applicability flag (§2.4 route 68). */
  applicability_basis: Record<string, unknown>;
  headcount_total: number | null;
  headcount_asof_date: string | null;
  is_fmla_covered: boolean | null;
  is_aca_ale: boolean | null;
  is_eeo1_filer: boolean | null;
  is_federal_contractor: boolean | null;
  everify_required_states: string[];
  settings: Record<string, unknown>;
  version: number;
  updated_at: string;
  /** ABSENT today — see the header. Optional so a future projection just works. */
  ein_last4?: string | null;
};

/** `hr.establishment`, as `hr_structure_list` returns it. */
export type HrEstablishment = {
  id: string;
  name: string;
  address: unknown;
  jurisdiction_id: string | null;
  naics_code: string | null;
  eeo1_establishment_id: string | null;
  is_headquarters: boolean;
  osha_establishment_name: string | null;
  annual_average_employees: number | null;
  total_hours_worked: number | null;
};

/** One jurisdiction row, as `hr_structure_list` returns it (note: `jurisdiction_key`). */
export type HrJurisdiction = {
  id: string;
  jurisdiction_key: string;
  name: string;
  level: string;
};

/**
 * The five applicability flags of route 68, each with the derivation the panel
 * MUST render beside it — "Derived: 63 employees as of 2026-01-01" — rather than a
 * bare true/false an admin cannot argue with.
 */
export type HrApplicabilityFlag = {
  key:
    | "is_fmla_covered"
    | "is_aca_ale"
    | "is_eeo1_filer"
    | "is_federal_contractor"
    | "everify_required_states";
  label: string;
  /** What the law actually asks. Rendered under the label, always. */
  test: string;
  /** The current value: a boolean flag, or the E-Verify state list. */
  value: boolean | string[] | null;
  /**
   * The derivation sentence built from `applicability_basis` + headcount, or null
   * when the employer profile carries no basis for this flag yet. A null here
   * renders "Nobody has established this yet" — never a confident false.
   */
  derivation: string | null;
  /** True when `applicability_basis` records a human override for this flag. */
  isDeclared: boolean;
  declaredBy: string | null;
  declaredReason: string | null;
};

// ── Route 70 — pay groups ───────────────────────────────────────────────────

/** `hr.pay_group`, as `hr_structure_list` returns it. */
export type HrPayGroup = {
  id: string;
  name: string;
  pay_frequency: string;
  first_period_start_on: string;
  pay_date_rule: unknown;
  workweek_start_dow: number;
  workweek_start_time: string;
  workweek_effective_from: string;
  holiday_calendar_id: string | null;
  default_earning_code_id: string | null;
  timesheet_required: boolean;
  is_active: boolean;
};

// ── Route 71 — calendars ────────────────────────────────────────────────────

export type HrHoliday = {
  id: string;
  name: string;
  observed_on: string;
  actual_on: string | null;
  is_paid: boolean;
  earning_code_id: string | null;
  applies_to_schedule_class: string[];
  location_ids: string[];
};

export type HrHolidayCalendar = {
  id: string;
  name: string;
  jurisdiction_id: string | null;
  is_default: boolean;
  holiday_pay_counts_toward_ot: boolean;
  holidays: HrHoliday[];
};

// ── Route 72 — codes ────────────────────────────────────────────────────────

export type HrEarningCode = {
  id: string;
  code: string;
  name: string;
  hours_category: string;
  is_overtime: boolean;
  multiplier: number | null;
  flat_amount: number | null;
  counts_toward_ot: boolean;
  counts_toward_hours_of_service: boolean;
  counts_toward_sick_accrual: boolean;
  is_statutory_premium: boolean;
  external_code_map: Record<string, unknown>;
  /** A seeded code can be DEACTIVATED but never deleted (§2.4 route 72). */
  is_seeded: boolean;
  is_active: boolean;
};

export type HrDeductionCode = {
  id: string;
  code: string;
  name: string;
  deduction_kind: string;
  provider_ref: string | null;
  external_code_map: Record<string, unknown>;
  is_active: boolean;
};

// ── The whole structure envelope, typed for this lane ───────────────────────

/**
 * `hr_structure_list`'s payload with the loose `Record<string, unknown>[]` members
 * of `features/hr/types.ts` narrowed to what the function actually builds. The
 * shared type stays permissive on purpose; the settings panels need the columns.
 */
export type HrSettingsStructure = {
  is_admin: boolean;
  departments: HrDepartment[];
  locations: HrLocation[];
  job_titles: HrJobTitle[];
  pay_groups: HrPayGroup[];
  holiday_calendars: HrHolidayCalendar[];
  earning_codes: HrEarningCode[];
  deduction_codes: HrDeductionCode[];
  establishments: HrEstablishment[];
  jurisdictions: HrJurisdiction[];
};

// ── Route 73 — the custom-field registry (READ ONLY, L14 owns authoring) ────

/** `platform.custom_field_definition`, read directly (the `platform` schema IS exposed). */
export type HrCustomFieldDefinition = {
  id: string;
  target_token: string | null;
  field_key: string;
  display_name: string;
  field_type: string;
  field_order: number;
  is_required: boolean;
  is_multi: boolean;
  sensitivity_tier: string;
  ai_exposure: string;
  reference_target_token: string | null;
  archived_at: string | null;
  options: unknown;
};

/** `platform.custom_field_target` — the per-token ceilings and the enable switch. */
export type HrCustomFieldTarget = {
  id: string;
  target_token: string;
  is_enabled: boolean;
  max_fields: number | null;
  max_custom_bytes: number | null;
  sensitivity_ceiling: string;
  ai_exposure_ceiling: string;
  validation_mode: string;
  notes: string | null;
};

// ── The D13 panel shape ─────────────────────────────────────────────────────

/**
 * A statutory floor that fixes a key's value. The control renders LOCKED WITH THE
 * CITATION VISIBLE — never hidden, never quietly disabled (§2.4, SPEC-UI-IA §3.11).
 *
 * Sourced from `hr.jurisdiction_rule.citation` where the panel can resolve one;
 * a hand-written citation string is a defect waiting to go stale, so a panel that
 * cannot resolve the rule renders the key UNLOCKED and says nothing about floors.
 */
export type HrKnobFloor = {
  /** The human citation — "29 CFR 778.101", "CA Labor Code §510". */
  citation: string;
  /** The value the floor pins the key to, when it pins one. */
  lockedValue?: unknown;
  /** One sentence: what the floor requires and why the control cannot go below it. */
  requirement: string;
  /** A door to the rule row, when the panel holds its id. */
  href?: string;
};

/** A scope rung a key can be overridden at, below the org (§10's ladder). */
export type HrKnobScopeRung = {
  kind: "employer_profile" | "pay_group" | "location";
  id: string;
  label: string;
  /** Where that scope row is edited — the rung's override lives on the row itself. */
  href: string;
};

/** Everything one `<KnobRow>` needs beyond the knob itself. */
export type HrKnobPresentation = {
  /** One line of WHY this key exists — never a restatement of the label. */
  explain?: string;
  floor?: HrKnobFloor;
  /** Present → the row renders the scope selector (§3.11's "scope rung"). */
  scopes?: HrKnobScopeRung[];
  /** Enumerated values, when the key has a fixed range the RPC does not carry. */
  options?: Array<{ value: string; label: string }>;
};

export type HrKnobPresentationMap = Record<string, HrKnobPresentation>;

/** A knob plus its presentation, resolved once per panel. */
export type HrPresentedKnob = HrKnob & { presentation: HrKnobPresentation };

// ── Activation ──────────────────────────────────────────────────────────────

/**
 * What `hr_activate_employer` ACTUALLY created, read off the success envelope.
 * Every id here is a door; nothing is inferred.
 */
export type HrActivationResult = {
  employer_profile_id: string;
  location_id: string;
  department_id: string;
  employee_id: string;
  employment_id: string;
  role_assignment_id: string;
  audit_id: string | null;
  /**
   * 🚨 SEEDS THE ENVELOPE REPORTS. The live function seeds NOTHING — no earning
   * codes, no deduction codes, no `platform.categories` dimensions, no holiday
   * calendar (read out of `hr_activate_employer`'s body 2026-08-26). §2.4 says
   * activation seeds all four and the server lane owner is extending it, so step 4
   * renders whatever these arrays report and says "nothing was seeded" when they
   * are empty. It never claims a seed that did not happen.
   */
  seeded_earning_code_ids?: string[];
  seeded_deduction_code_ids?: string[];
  seeded_category_dimension_keys?: string[];
  seeded_holiday_calendar_id?: string | null;
};

/** The three activation refusals the shipped function writes, verbatim. */
export type HrActivationRefusalReason =
  | "not_org_owner_or_admin"
  | "already_activated"
  | "nominee_not_a_member";

/**
 * Which of the three "this employer is not going yet" states the org is in.
 *
 * 🚨 THE GATE IS THE ABSENCE OF AN `hr.employer_profile` ROW — the same condition
 * `hr_activate_employer` refuses on. An org that HAS a profile and no employees is
 * NOT a wizard candidate: running the wizard would be refused `already_activated`,
 * so it gets the first-hire door instead (R-L1 U5, resolving SPEC-EMPLOYEES §2.4
 * against SPEC-DOMAIN-WIDE §1.5).
 */
export type HrActivationMode = "wizard" | "first_hire" | "ready";
