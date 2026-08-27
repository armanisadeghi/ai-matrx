// features/hr/types.ts
//
// The wire shapes of the `public.hr_*` RPC surface, hand-written from the SHIPPED
// function bodies (read live 2026-08-26), not from a spec table that hoped for them.
//
// 🚨 WHY EVERY HR READ IS AN RPC. The `hr` schema is NOT in PostgREST's exposed
// schema list (`authenticator`'s `pgrst.db_schemas` carries no `hr`, no `esign`),
// verified live 2026-08-26. Direct browser reads of `hr.employee` or any other
// relation in that schema do not work and never will. Every read and write goes through a
// `public.hr_*` SECURITY DEFINER RPC — still React → Supabase DIRECT, no Next.js hop
// and no Python hop.
//
// 🚨 TWO REFUSAL DIALECTS, ONE RESULT TYPE. The shipped doors do not agree with each
// other, so `service.ts` normalizes both into `HrResult<T>`:
//   • ENVELOPE refusal — `hr_employee_profile`, `hr_employment_history`,
//     `hr_pending_changes` return `{granted:false, reason:'not_reachable'}`. No error.
//   • RAISED refusal — `hr_my_context`, `hr_directory_list`, `hr_org_chart`,
//     `hr_structure_list`, `hr_knob_index` `raise exception … errcode '42501'` when the
//     caller has no standing, which supabase-js surfaces as `error`, not as data.
// A refusal in either dialect is DATA the user must see in place, never a thrown
// exception that unmounts the surface.
//
// The generated `Database["public"]["Functions"]` types cover the ARGUMENTS; every
// return is `Json`, which is opaque to `supabase gen types`. So the envelope shapes
// live here, asserted once in `service.ts` instead of at every call site.

import type { Database } from "@/types/database.types";
import type {
  HrCapability,
  HrDirectoryStatus,
  HrOrgRole,
  HrPersona,
  HrProfileTab,
  HrViewerKind,
  HrWorkerClass,
} from "./constants";

// ── Rows that are literally table rows ──────────────────────────────────────
// Reused from the generated schema so a column rename goes red here first.

type HrTables = Database["hr"]["Tables"];
export type HrEmployeeRow = HrTables["employee"]["Row"];
export type HrEmploymentRow = HrTables["employment"]["Row"];
export type HrPositionAssignmentRow = HrTables["position_assignment"]["Row"];
export type HrCompensationRow = HrTables["compensation"]["Row"];
export type HrReportingLineRow = HrTables["reporting_line"]["Row"];
export type HrEmployerProfileRow = HrTables["employer_profile"]["Row"];

// ── The one result type ─────────────────────────────────────────────────────

/** The server's refusal envelope, as the shipped doors write it. */
/**
 * A door refused. **Two dialects, both real** — see `isRefusalEnvelope` in `service.ts`.
 *
 * READ doors answer with `granted: false` (the access verdict). WRITE doors answer with
 * `ok: false` — the refusal-envelope law: Postgres has no autonomous transactions, so a door
 * that wrote its audit row and then RAISED would roll the audit back with the exception.
 * **Refusal is data; only breakage is an exception.** Anything that tests one flag and not the
 * other reads half of all refusals as successes.
 */
export type HrRefusalEnvelope = {
  granted?: false;
  ok?: false;
  /** A stable code — `not_reachable`, `no_standing`, `location_without_jurisdiction`, … */
  reason: string;
  /** A sentence a human can act on. Render this, never the code alone. */
  detail?: string | null;
  /** The offending input, on a write refusal. Name it at the control, never in the aggregate. */
  field?: string | null;
  /** Where to go and fix it — a write refusal that has a door carries it. */
  door?: string | null;
  /** Present when the refusal was written to `hr.access_audit`. */
  audit_id?: string | null;
};

/** The call reached the door and the door opened. */
export type HrGranted<T> = { ok: true; data: T };

/**
 * The door refused. **This is not an error** — it is the answer, and §4.2 says the
 * surface renders the persona's nearest legitimate place, never a permission wall
 * and never a hint that the record exists.
 */
export type HrDenied = {
  ok: false;
  kind: "denied";
  reason: string;
  detail: string | null;
  auditId: string | null;
  /**
   * The offending input, on a WRITE refusal — `field: "location_id"` with
   * `reason: "location_without_jurisdiction"`. Name it AT the control; "some fields could not
   * be saved" is the defect this replaces (SPEC-EMPLOYEES §7.1 rule 2).
   */
  field: string | null;
  /** Where to go and fix it, where the server named one — e.g. `/hr/settings/structure`. */
  door: string | null;
  /**
   * The refusal envelope, whole. Some refusals carry more than a sentence and the extra IS the
   * answer: `rehire_required` returns `existing` (the prior spells, their dates, their
   * `rehire_eligible` and its note), which is the entire content of §4.6's rehire panel.
   * Flattening a refusal to reason+detail throws that away.
   */
  payload: Record<string, unknown>;
};

/** The call did not reach a decision: transport, gateway, or a genuine server fault. */
export type HrFailed = {
  ok: false;
  kind: "failed";
  /** Already phrased for a human. Never a bare Postgres code (SPEC-EMPLOYEES §2). */
  message: string;
  code: string | null;
};

export type HrResult<T> = HrGranted<T> | HrDenied | HrFailed;

export function isHrGranted<T>(r: HrResult<T>): r is HrGranted<T> {
  return r.ok === true;
}
export function isHrDenied<T>(r: HrResult<T>): r is HrDenied {
  return r.ok === false && r.kind === "denied";
}
export function isHrFailed<T>(r: HrResult<T>): r is HrFailed {
  return r.ok === false && r.kind === "failed";
}

// ── hr_my_context ───────────────────────────────────────────────────────────

/** One employer the caller can reach. An owner/admin sees an org whose module is OFF. */
export type HrEmployer = {
  organization_id: string;
  name: string;
  slug: string | null;
  module_enabled: boolean;
  is_activated: boolean;
  org_role: HrOrgRole | null;
  persona: HrPersona | null;
};

/** The resolved employer context — null when no employer resolved (render the picker). */
export type HrActiveEmployer = {
  organization_id: string;
  module_enabled: boolean;
  is_activated: boolean;
  org_role: HrOrgRole | null;
  persona: HrPersona | null;
  capabilities: string[];
  /** null for an org member who is not an employee here (an admin, a facilities user). */
  employee_id: string | null;
  /** null when there is no active spell today — a nav item that needs one is ABSENT. */
  employment_id: string | null;
  employee_count: number;
  /** owner/admin, and no `hr_owner` assigned yet. The activation wizard's one gate. */
  can_activate: boolean;
};

export type HrMyContext = {
  employers: HrEmployer[];
  active: HrActiveEmployer | null;
  as_of: string;
};

// ── hr_directory_list ───────────────────────────────────────────────────────

export type HrDirectoryFilter = {
  search?: string | null;
  status?: HrDirectoryStatus[] | null;
  department_id?: string | null;
  location_id?: string | null;
  job_title_id?: string | null;
  worker_class?: HrWorkerClass | null;
  manager_employee_id?: string | null;
  /** Any non-empty value means "people who report to one of my employments". */
  my_team?: string | null;
};

export type HrDirectoryRow = {
  employee_id: string;
  employment_id: string | null;
  display_name: string;
  employee_number: string | null;
  work_email: string | null;
  work_phone: string | null;
  photo_file_id: string | null;
  directory_status: HrDirectoryStatus;
  job_title_id: string | null;
  job_title: string | null;
  department_id: string | null;
  department: string | null;
  location_id: string | null;
  location: string | null;
  timezone: string | null;
  manager_employee_id: string | null;
  /** null when `hr.employees.directory_shows_manager` is off — the COLUMN is absent, not blank. */
  manager_name: string | null;
  worker_class: HrWorkerClass | null;
  flsa_status: string | null;
  schedule_class: string | null;
  fte: number | null;
  /** null when `hr.employees.directory_shows_hire_date` is off. */
  hire_date: string | null;
  /**
   * Where this row's job columns came from.
   *
   * `hr.employee.current_*` is the sanctioned source for the directory (SPEC-EMPLOYEES §1.2 /
   * §5.1) — but `hr._refresh_current_position` CLEARS those columns whenever no primary
   * assignment is live today, so every **prehire** has them null. A directory built strictly on
   * `current_*` therefore renders a brand-new hire as a row with a name, a number, and no title,
   * no department, no manager and no `employment_id` to open.
   *
   * The door falls back to the incoming spell and says so here, so the UI can render
   * "starts 9 Sep" rather than blanks — and can never mistake an upcoming assignment for a
   * current one.
   *
   * - `current`                 — from `current_*`, live today
   * - `upcoming`                — a future-dated hire; the job columns are what they WILL be
   * - `no_primary_assignment`   — a live spell with no primary assignment on the date
   * - `no_spell`                — no live spell at all (a terminated person reached by filter)
   */
  row_basis: "current" | "upcoming" | "no_primary_assignment" | "no_spell";
  custom: Record<string, unknown> | null;
};

export type HrDirectoryPage = {
  rows: HrDirectoryRow[];
  /** The size of the FULL result set, counted from the same CTE that paged it. */
  total: number;
  limit: number;
  offset: number;
  persona: HrPersona;
  capabilities: string[];
  /**
   * Which optional columns this org publishes. A `false` here means the column is
   * ABSENT from the table, not rendered empty (§4.2 applies to columns too).
   */
  columns: { hire_date: boolean; manager: boolean };
  as_of: string;
};

// ── hr_org_chart ────────────────────────────────────────────────────────────

export type HrOrgChartNode = {
  employment_id: string;
  employee_id: string;
  display_name: string;
  job_title_id: string | null;
  job_title: string | null;
  department_id: string | null;
  department: string | null;
  location_id: string | null;
  location: string | null;
  manager_employment_id: string | null;
  fte: number | null;
  worker_class: HrWorkerClass | null;
  photo_file_id: string | null;
};

/** People with no manager. Rendered in an explicit tray — NEVER silently dropped. */
export type HrOrgChartUnplaced = {
  employment_id: string;
  employee_id: string;
  display_name: string;
  reason: string;
};

export type HrOrgChartDottedLine = {
  employment_id: string;
  manager_employment_id: string;
  line_kind: string;
  scope_note: string | null;
};

export type HrOrgChart = {
  as_of: string;
  requested_on: string;
  /** false → the as-of picker is ABSENT, not disabled. An employee never gets history. */
  history_available: boolean;
  earliest_known_on: string | null;
  nodes: HrOrgChartNode[];
  unplaced: HrOrgChartUnplaced[];
  dotted_lines: HrOrgChartDottedLine[];
  /** Employments in a reporting cycle. Rendered, never hidden. */
  cycles: string[];
  persona: HrPersona;
};

// ── hr_employee_profile ─────────────────────────────────────────────────────

export type HrProfileHeader = {
  employee_id: string;
  employment_id: string | null;
  display_name: string;
  /** null unless the viewer is self or hr_admin. Absent identity, never masked. */
  legal_name: string | null;
  pronouns: string | null;
  photo_file_id: string | null;
  employee_number: string | null;
  party_id: string | null;
  login_user_id: string | null;
  status: string | null;
  spell_number: number | null;
  hire_date: string | null;
  worker_class: HrWorkerClass | null;
  job_title_id: string | null;
  job_title: string | null;
  department_id: string | null;
  department: string | null;
  location_id: string | null;
  location: string | null;
  manager_employment_id: string | null;
  manager_employee_id: string | null;
  manager_name: string | null;
  direct_report_count: number;
  /** Drives the header's ONE chip (§6.2). Never more than one chip. */
  pending_change_count: number;
};

/**
 * The Confidential half of the Personal tab, when the audited door opened.
 * Ciphertext columns are stripped server-side; SSN comes back as last-4 only.
 */
export type HrProfilePrivate = Record<string, unknown> & {
  ssn_last4?: string | null;
  home_address?: unknown;
  home_address_effective_from?: string | null;
  work_authorization_expires_on?: string | null;
};

/**
 * 🚨 THE PERSONAL BLOCK CONTAINS ONLY THE KEYS THIS VIEWER MAY SEE. That is
 * deliberate, and it is what makes §4.2 mechanically enforceable: `<SensitiveField>`
 * renders what is present and cannot render what is not. Never widen this to a
 * fully-populated shape with nulls — a null is indistinguishable from "empty", and
 * an empty field where a legal name would be is a disclosure.
 */
export type HrProfilePersonal = {
  preferred_first_name?: string | null;
  preferred_last_name?: string | null;
  pronouns?: string | null;
  work_email?: string | null;
  work_phone?: string | null;
  directory_opt_out?: boolean | null;
  photo_file_id?: string | null;
  custom?: Record<string, unknown> | null;
  legal_first_name?: string | null;
  legal_middle_name?: string | null;
  legal_last_name?: string | null;
  legal_name_suffix?: string | null;
  former_names?: unknown;
  private?: HrProfilePrivate | null;
  private_audit_id?: string | null;
  /** `not_collected` and `not_reachable` are DIFFERENT facts and say different things. */
  private_state?: "not_collected" | "not_reachable";
};

/** What machinery this worker class actually has (SPEC-EMPLOYEES §1.4). `false` = ABSENT. */
export type HrWorkerClassMachinery = {
  i9: boolean;
  w4: boolean;
  pto: boolean;
  overtime: boolean;
  payroll: boolean;
};

export type HrEmployeeProfile = {
  as_of: string;
  viewer: HrViewerKind;
  capabilities: string[];
  organization_id: string;
  /**
   * 🚨 THE AUTHORITATIVE TAB SET for this viewer. Render exactly these, in this
   * order. Do not add a tab the server omitted and do not filter one it sent.
   * A custom tab arrives as `c/<tabKey>` once the tier-1 kit ships.
   */
  tabs: (HrProfileTab | string)[];
  header: HrProfileHeader;
  personal: HrProfilePersonal;
  comp_visibility: "full" | "band_only" | "none";
  worker_class_machinery: HrWorkerClassMachinery;
};

// ── hr_employment_history ───────────────────────────────────────────────────

export type HrEmploymentHistory = {
  spells: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  reporting_lines: Record<string, unknown>[];
  external_identities: Record<string, unknown>[];
  engagements: Record<string, unknown>[];
};

// ── hr_pending_changes ──────────────────────────────────────────────────────

/** The three future-dated row kinds, plus the workflow instances still in flight. */
export type HrPendingKind = "position" | "compensation" | "reporting_line";

export type HrPendingPosition = {
  id: string;
  kind: "position";
  effective_from: string;
  job_title: string | null;
  department: string | null;
  location: string | null;
  manager_employment_id: string | null;
  fte: number | null;
  worker_class: HrWorkerClass | null;
  flsa_status: string | null;
  change_reason: string | null;
  supersedes_id: string | null;
  requested_by: string | null;
  can_cancel: boolean;
};

export type HrPendingCompensation = {
  id: string;
  kind: "compensation";
  effective_from: string;
  component_kind: string | null;
  amount: number | null;
  currency: string | null;
  per_unit: string | null;
  pay_basis: string | null;
  change_reason: string | null;
  approved_at: string | null;
  can_cancel: boolean;
};

export type HrPendingReportingLine = {
  id: string;
  kind: "reporting_line";
  effective_from: string;
  line_kind: string | null;
  manager_employment_id: string | null;
  can_cancel: boolean;
};

export type HrPendingRow =
  | HrPendingPosition
  | HrPendingCompensation
  | HrPendingReportingLine;

export type HrInFlightRequest = {
  instance_id: string;
  flow_key: string;
  state: string;
  target_token: string | null;
  target_id: string | null;
  submitted_at: string | null;
  due_at: string | null;
  /** Absent for a `pay_change` the viewer may not see the amounts of. */
  payload?: Record<string, unknown> | null;
  current_step: string | null;
};

export type HrPendingChanges = {
  positions: HrPendingPosition[];
  compensation: HrPendingCompensation[];
  reporting_lines: HrPendingReportingLine[];
  in_flight: HrInFlightRequest[];
};

// ── hr_structure_list ───────────────────────────────────────────────────────

export type HrDepartment = {
  id: string;
  name: string;
  code: string | null;
  parent_department_id: string | null;
  head_employment_id: string | null;
  cost_center: string | null;
  is_active: boolean;
  /** A count is a door (LAW 1) — it opens the directory filtered to these people. */
  assignment_count: number;
};

export type HrLocation = {
  id: string;
  name: string;
  code: string | null;
  address: unknown;
  tz: string | null;
  jurisdiction_id: string | null;
  jurisdiction_key: string | null;
  jurisdiction_name: string | null;
  establishment_id: string | null;
  is_remote: boolean;
  geo_lat: number | null;
  geo_lng: number | null;
  geofence_radius_m: number | null;
  is_active: boolean;
  assignment_count: number;
};

export type HrJobTitle = {
  id: string;
  title: string;
  code: string | null;
  job_family: string | null;
  job_level: string | null;
  grade: string | null;
  eeo1_job_category: string | null;
  default_flsa_status: string | null;
  default_pay_basis: string | null;
  /** ABSENT (undefined) for a viewer without `comp.read` — never zero, never masked. */
  pay_range_min?: number | null;
  pay_range_max?: number | null;
  is_supervisor: boolean;
  is_active: boolean;
  assignment_count: number;
};

export type HrStructure = {
  is_admin: boolean;
  departments: HrDepartment[];
  locations: HrLocation[];
  job_titles: HrJobTitle[];
  pay_groups: Record<string, unknown>[];
  holiday_calendars: Record<string, unknown>[];
  earning_codes: Record<string, unknown>[];
  deduction_codes: Record<string, unknown>[];
  establishments: Record<string, unknown>[];
  jurisdictions: Record<string, unknown>[];
};

// ── hr_knob_index ───────────────────────────────────────────────────────────

/**
 * One configuration key with its effective value AND its origin — the uniform D13
 * shape every settings panel renders (SPEC-UI-IA §3.11).
 *
 * `origin: 'missing'` is a HARD ERROR the hub names out loud, never a silent
 * fallback — a silent fallback is how a knob becomes a constant.
 */
export type HrKnob = {
  feature: string;
  slug: string;
  key: string;
  full_key: string;
  value_type: string;
  platform_default: unknown;
  org_override: unknown;
  effective_value: unknown;
  origin: "org_override" | "platform_default" | "missing";
  basis: string | null;
  is_overridden: boolean;
};

export type HrKnobIndex = {
  organization_id: string;
  keys: HrKnob[];
};

// ── Writes (signatures shipping with the L1 server lane) ────────────────────

/** Every write returns `{ok:true, …}` or the refusal envelope. Same `HrResult<T>`. */
export type HrWriteAck = Record<string, unknown> & { ok?: true };

export type HrCapabilitySet = {
  /** Typed at the call site; permissive on the wire, because the server owns the list. */
  can: (capability: HrCapability) => boolean;
  all: string[];
};

// ── The audited LIST doors (hr_confidential_list / hr_restricted_list) ──────
//
// 🚨 A COUNT THAT CHANGES WITH THE VIEWER IS CORRECT ON THESE DOORS.
// `hr.incident_excluded()` runs per row on the server, AFTER every allow lane,
// and it overrides `incident.read`, `hr_owner` AND break-glass. An excluded row
// is not in `rows` and its count is not in `total`. So two people with identical
// capabilities can legitimately see different totals for the same filter, and
// "fixing" that with a shared cache would leak exactly what the veto protects.
// Never memoize one viewer's page under a viewer-independent key.

export type HrAuditedPage<T> = {
  rows: T[];
  /** The FULL result set size AFTER the per-row exclusion — see the note above. */
  total: number;
  limit: number;
  offset: number;
  /** The `hr.access_audit` row this read wrote. Present on every audited door. */
  audit_id?: string | null;
  /** What the server says this viewer may do with these rows. Never a client guess. */
  capabilities?: string[];
};
