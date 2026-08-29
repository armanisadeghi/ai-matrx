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
  /**
   * 🚨 THE MACHINE'S OWN WORDS, KEPT OUT OF THE SENTENCE.
   * `message` promised to be human and was being built by concatenating raw
   * driver and Postgres text onto the end of it — so a person read "…did not go
   * through. column "v_pf_any" does not exist" or "…TypeError: Failed to fetch".
   * The tail is genuinely useful to whoever debugs it, so it is kept HERE and
   * rendered behind a details affordance, instead of being deleted or pasted
   * into a sentence aimed at somebody trying to change their own pronouns.
   *
   * OPTIONAL on purpose: other lanes build `HrFailed` literals of their own, and
   * making this required would have broken four files — some being edited right
   * now — to add a field they have nothing to put in. Absent means "no machine
   * text to show", which renders as no affordance at all.
   */
  technical?: string | null;
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
  /**
   * The viewer's own worker class today, off their primary assignment. Nav uses it
   * to stop offering surfaces the server refuses for that class — a contractor was
   * being shown "My Timesheet" while `hr.clock_state` blocked the destination and
   * her own profile had already dropped the tab. `null` where there is no
   * assignment; nav hides nothing on null rather than guessing.
   */
  worker_class: string | null;
  /**
   * Does the viewer hold an ACTIVE leave enrolment today (`hr_l5_30`)? Nav uses it
   * to keep My Time Off visible for somebody enrolled by a SPEC-LEAVE §2.8
   * override — a contractor enrolled deliberately, with a recorded reason — whom
   * the per-class default would otherwise hide from her own balance. Optional
   * because an older payload simply will not carry it; only `true` reveals, so a
   * missing flag can never strip a menu.
   */
  has_active_leave_enrolment?: boolean | null;
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

/**
 * The status request. `"all"` is a real token the door understands and it means
 * EVERY STATUS THIS VIEWER MAY SEE — never "the default set". Sending no status at
 * all is a different request: route 10's default view, which excludes `terminated`.
 * A status the viewer may not have (`prehire` / `terminated` for anyone below the
 * HR tier) is REFUSED with `42501`, not quietly dropped (`hr_l1_65`).
 */
export type HrDirectoryStatusRequest = HrDirectoryStatus | "all";

export type HrDirectoryFilter = {
  search?: string | null;
  status?: HrDirectoryStatusRequest[] | null;
  department_id?: string | null;
  location_id?: string | null;
  job_title_id?: string | null;
  worker_class?: HrWorkerClass | null;
  manager_employee_id?: string | null;
  /** Any non-empty value means "people who report to one of my employments". */
  my_team?: string | null;
};

/**
 * One directory row.
 *
 * 🚨 SEVEN FIELDS ARE OPTIONAL BECAUSE THEY ARE **ABSENT** FOR A DIRECTORY-TIER
 * VIEWER — not null, not blank, not present-and-empty. `hr_directory_list` removes
 * them from the payload for anyone below the working-record tier (`hr_l1_65`), so
 * `undefined` here is the wire telling you this viewer never received the field.
 * They are exactly the `hr.employment` / `hr.position_assignment` facts, which
 * SPEC-ACCESS §3.2 marks `—` for an ordinary org member.
 *
 * Read `page.columns` — not these fields — to decide what to RENDER. A cell that
 * tests `row.hire_date` and prints nothing is a column of blanks, which announces
 * that the data exists and that this viewer is not getting it (§4.2).
 */
export type HrDirectoryRow = {
  employee_id: string;
  /** ABSENT below the working-record tier. Compare with `!= null`, never `!== null`. */
  employment_id?: string | null;
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
  /** ABSENT below the working-record tier (`page.columns.worker_class`). */
  worker_class?: HrWorkerClass | null;
  /** ABSENT below the working-record tier (`page.columns.employment_detail`). */
  flsa_status?: string | null;
  /** ABSENT below the working-record tier (`page.columns.employment_detail`). */
  schedule_class?: string | null;
  /** ABSENT below the working-record tier (`page.columns.employment_detail`). */
  fte?: number | null;
  /**
   * ABSENT below the working-record tier, and null when
   * `hr.employees.directory_shows_hire_date` is off. `page.columns.hire_date`
   * folds both together — render on that, never on this field's presence.
   */
  hire_date?: string | null;
  /**
   * ABSENT below the working-record tier — it describes which employment the job
   * columns came from, and a directory-tier viewer receives no job columns.
   *
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
  row_basis?: "current" | "upcoming" | "no_primary_assignment" | "no_spell";
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
   * Which columns exist FOR THIS VIEWER — the org's publishing knobs and the
   * viewer's access tier, already folded together by the door. A `false` here means
   * the column is ABSENT from the table, not rendered empty (§4.2 applies to columns
   * exactly as it applies to fields), and it also means the underlying field is not
   * in `rows` at all.
   *
   * - `hire_date`         — `directory_shows_hire_date` AND the working-record tier
   * - `manager`           — `directory_shows_manager` (org knob; every tier)
   * - `worker_class`      — the working-record tier
   * - `employment_detail` — `employment_id` / `flsa_status` / `schedule_class` /
   *                         `fte` / `row_basis`, the rest of the working record
   */
  columns: {
    hire_date: boolean;
    manager: boolean;
    worker_class: boolean;
    employment_detail: boolean;
  };
  /**
   * The status vocabulary of THIS viewer's directory.
   *
   * `allowed` is what may be asked for — naming anything outside it is refused with
   * `42501`, so a control must offer exactly this set and no more. `default` is what
   * arrives when nothing is asked for (route 10 excludes `terminated` there). The
   * two differ, which is why the table's bare "All" could not be left meaning "the
   * default": ask for `["all"]` to get everything in `allowed`.
   */
  statuses: { allowed: HrDirectoryStatus[]; default: HrDirectoryStatus[] };
  /** `full` · `team` (a manager inside their own My-team scope) · `directory`. */
  tier: "full" | "team" | "directory";
  as_of: string;
};

// ── hr_org_chart ────────────────────────────────────────────────────────────

export type HrOrgChartNode = {
  employment_id: string;
  employee_id: string;
  /**
   * 🚨 NULL IS THE SUPPRESSION SIGNAL, AND IT IS THE ONLY ONE. The door runs
   * `hr._subject_display_name(employment_id, viewer)` — the same helper the
   * directory and the audit reads use — so this is null exactly when THIS viewer
   * may not have the name, and carries the real name otherwise.
   *
   * 🚨 DO NOT KEY RENDERING ON `opted_out`. That field is the PERSON'S PREFERENCE,
   * not this viewer's outcome, so it is `true` for HR as well — and HR gets the
   * name. Verified live: the same node arrives as `{display_name: null,
   * opted_out: true}` for a peer and `{display_name: 'G2V-Priya Raman',
   * opted_out: true}` for an hr_admin. Keying on the preference would blank the
   * name for the very people entitled to see it.
   */
  display_name: string | null;
  /**
   * The person's own directory preference. Present for every viewer, including
   * those who can still see the name — see the warning above.
   */
  opted_out?: boolean;
  /**
   * 🚨 THE ORG'S OWN WORDS, OR NULL — AND THE DOOR DELIBERATELY WRITES NO DEFAULT.
   * It comes from `hr.employees.disclosure_existence_statements ->
   * 'org_chart_opted_out' ->> 'statement'`, which ships empty, because composing a
   * sentence on an employer's behalf is precisely what that knob exists to
   * prevent. When it is null the CLIENT supplies its own fallback, styled so it
   * cannot be mistaken for something the organization authored.
   *
   * Sent whenever the person opted out — so it too can arrive alongside a real
   * name, and is only rendered when the name is actually withheld.
   */
  disclosure_statement?: string | null;
  job_title_id: string | null;
  /**
   * On a suppressed node these arrive only if the org listed them in the knob's
   * `shows`, so they are the employer's disclosure choice rather than this
   * component's. Verified live: with nothing listed, a peer gets null for title,
   * department, location AND photo, while HR gets all of them.
   */
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
/**
 * People with no manager. Rendered in an explicit tray — NEVER silently dropped.
 *
 * 🚨 THE SAME SUPPRESSION RULE APPLIES HERE, in the door's own words: "unplaced
 * people are people. The same rule, one array over." So `display_name` is null for
 * a viewer who may not have it, and the tray must render the withheld treatment
 * rather than an empty row.
 */
export type HrOrgChartUnplaced = {
  employment_id: string;
  employee_id: string;
  display_name: string | null;
  opted_out?: boolean;
  disclosure_statement?: string | null;
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
  /**
   * 🚨 OPTIONAL BECAUSE THE KEY IS GENUINELY ABSENT, NOT NULL, for a viewer
   * without `identity.read` (§1.3, migration `hr_l1_18`). Typing it as
   * `string | null` invited exactly the bug that shipped: a present-but-null
   * `legal_name` renders as "Not provided", which tells a colleague the person
   * HAS no legal name. `null` here means the permitted viewer looked and it is
   * empty; ABSENT means they were never allowed to ask.
   */
  legal_name?: string | null;
  pronouns: string | null;
  photo_file_id: string | null;
  employee_number: string | null;
  party_id: string | null;
  /** Absent — not null — unless the viewer is self or hr_admin. See `legal_name`. */
  login_user_id?: string | null;
  /**
   * 🚨 THE DERIVED VOCABULARY, NEVER THE RAW SPELL ENUM (D4B, migration
   * `hr_l1_63`). This was typed `string | null`, and that looseness is what let
   * the defect typecheck: the server used to coalesce the RAW
   * `hr.employment.status` enum (`pending|active|on_leave|suspended|terminated`)
   * over the derivation, so `pending` reached this field — and `HrStatusChip`
   * captioned it "Not started yet" for a person whose hire date had already
   * arrived. The header now always answers through
   * `hr.employee_directory_status(employee_id, as_of)`, the same function the
   * directory row answers through, so this is the same four-value union
   * `HrDirectoryRow.directory_status` carries. Anything else is a server bug,
   * and this type is what makes it one at compile time.
   */
  status: HrDirectoryStatus | null;
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
  /**
   * Verified live 2026-08-27: the door builds this and this type did not declare
   * it. Unreadable rather than wrong — but its absence is what sent route 68 on an
   * audited confidential list call just to learn the id of the profile it was
   * editing (RECORDED DECISION 28, in the server lane's own words).
   */
  employer_profile_id: string | null;
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

/**
 * `hr_employment_set_pay_group`'s success envelope, narrowed field by field in
 * `service.ts` — nothing here is cast off the wire.
 *
 * 🚨 `existingPeriodsRecut` IS ALWAYS `false`, AND THAT IS THE POINT. The door
 * states route 70's rule on the wire so a surface can say it BEFORE saving:
 * moving somebody between pay groups is not retroactive. Pay periods and
 * workweeks already cut keep the group they were cut under, so hours already
 * computed — and possibly already exported — are never rewritten. A control that
 * hides this lets an HR admin believe a mid-period move fixes last week's
 * timesheet. It does not.
 */
export type HrPayGroupAssignmentAck = {
  employmentId: string | null;
  payGroupId: string | null;
  payGroupName: string | null;
  previousPayGroupId: string | null;
  existingPeriodsRecut: boolean;
  auditId: string | null;
};

/**
 * `hr_activation_seed`'s success envelope, narrowed field by field.
 *
 * 🚨 THESE COUNTS ARE WHAT THE DOOR ACTUALLY CREATED, NOT WHAT IT INTENDED TO.
 * The function is idempotent — every insert is `on conflict do nothing` and the
 * counters only advance when a row landed — so a second run honestly reports
 * zeros. A surface that prints "14 earning codes" from a constant instead of
 * from this envelope is the exact defect the seeds fix exists to end.
 *
 * `tipCodesSeededNotEnabled` carries D11's three codes, which ship
 * `is_active = false` deliberately: tip credit is a jurisdiction minefield an
 * employer must switch on knowingly.
 */
export type HrActivationSeedAck = {
  earningCodesCreated: number;
  deductionCodesCreated: number;
  holidayCalendarId: string | null;
  holidaysCreated: number;
  tipCodesSeededNotEnabled: string[];
  /** The server's own sentence about the seed that is platform-wide, not per-org. */
  categoriesDimensions: string | null;
  auditId: string | null;
};

/**
 * `hr_employee_invite`'s success envelope.
 *
 * 🚨 `token` AND `acceptPath` ARE HERE BECAUSE MAIL IS NOT GUARANTEED. The
 * platform's own invite surfaces never expose the token — they assume the email
 * arrives. Where it does not, an employee could never be given a login at all,
 * so the door hands the issuing admin the same link the mail would carry. The
 * surface must present it as what it is: a single-use link that is as good as the
 * invitation itself, to be sent to that person and nobody else.
 *
 * `expiresAt` is not decoration — the link stops working, and an admin who does
 * not know when will blame the product rather than reissue.
 */
export type HrEmployeeInviteAck = {
  employeeId: string | null;
  displayName: string | null;
  invitationId: string | null;
  email: string | null;
  expiresAt: string | null;
  token: string | null;
  acceptPath: string | null;
  /** The server's own sentence about delivery. Rendered, never paraphrased. */
  notice: string | null;
};

/**
 * `hr_invite_accept`'s success envelope.
 *
 * 🚨 `hrLinked: false` IS A SUCCESS. It means the token was a perfectly good
 * platform invitation that simply had no employee attached — the membership is
 * real and the person is in. Treating it as a failure would tell somebody who
 * just joined an organization that nothing happened.
 */
export type HrEmployeeInviteAcceptAck = {
  hrLinked: boolean;
  employeeId: string | null;
  organizationId: string | null;
  loginUserId: string | null;
  grantsRederived: boolean;
  /** Where the server says this person now belongs. Followed, not invented. */
  door: string | null;
};

export type HrCapabilitySet = {
  /** Typed at the call site; permissive on the wire, because the server owns the list. */
  can: (capability: HrCapability) => boolean;
  all: string[];
};

// ── The audited LIST doors (hr_confidential_list / hr_restricted_list) ──────
//
/**
 * 🚨 THIS TYPE WAS FICTION UNTIL 2026-08-27, AND THE CAST IS WHY NOBODY NOTICED.
 *
 * It declared `total`, `limit`, `offset` and `capabilities`. **The doors send none
 * of those.** Verified live against `hr_confidential_list('hr_employer_profile')`
 * and `hr_restricted_list('hr_incident')`, the envelope is exactly:
 *
 *     { granted, rows, row_count, next_cursor, audit_id }
 *
 * `service.ts` cast the payload to this shape, and a cast cannot fail — so
 * `page.total` was `undefined` at every call site. The Employee Relations sweep
 * read `pageData.total ?? rows.length`, which is the *"pager claiming 0 of 9
 * rows"* defect in its natural habitat.
 *
 * 🚨 AND THESE DOORS ARE CURSOR-PAGED, NOT OFFSET-PAGED. Their fifth argument is
 * `p_cursor text`, never `p_offset integer`. PostgREST resolves `rpc()` by
 * argument NAMES, so sending `p_offset` did not page wrongly — it raised
 * **PGRST202, function not found**, and every Employee Relations and verification
 * -letter list call failed outright. The broken shape was invisible underneath a
 * call that never returned a shape at all.
 *
 * Rewriting this type — rather than adapting around it — is safe because
 * `HrAuditedPage` is used nowhere outside this lane: `features/hr/service.ts` and
 * its two consumers, `people/relations` and `people/verifications`. The
 * don't-rewrite-types.ts rule exists to protect lanes mid-build against a shared
 * shape; there are none here, and keeping the fiction would preserve the bug.
 *
 * 🚨 A COUNT THAT CHANGES WITH THE VIEWER IS CORRECT ON THESE DOORS.
 * `hr.incident_excluded()` runs per row on the server, AFTER every allow lane, and
 * it overrides `incident.read`, `hr_owner` AND break-glass. An excluded row is not
 * in `rows` and is not counted in `rowCount`. So two people with identical
 * capabilities can legitimately see different counts for the same filter, and
 * "fixing" that with a shared cache would leak exactly what the veto protects.
 * Never memoize one viewer's page under a viewer-independent key.
 */
export type HrAuditedPage<T> = {
  rows: T[];
  /**
   * 🚨 THE SIZE OF **THIS PAGE**, NOT OF THE RESULT SET. The wire calls it
   * `row_count` and it equals `rows.length`; the doors do not compute a grand
   * total, and inventing one by summing pages would be a different number from the
   * one the server would give. A surface that needs "N results" must sweep to
   * exhaustion and count what it actually received — which is what
   * `sweepAuditedList` does.
   */
  rowCount: number;
  /**
   * The cursor for the NEXT page, or `null` when this was the last one.
   * `null` is the only end-of-list signal these doors give: a full page with a
   * `null` cursor is still the end, and a short page with a cursor is not.
   */
  nextCursor: string | null;
  /** The `hr.access_audit` row this read wrote. Present on every audited door. */
  auditId: string | null;
};

/**
 * The single-row audited doors (`hr_confidential_get` / `hr_restricted_get`).
 *
 * Verified live: `{ granted, row, basis, is_self_access, audit_id }`. `basis` and
 * `is_self_access` were previously undeclared and therefore unreadable — the
 * second one matters, because a person opening their OWN confidential record is a
 * materially different audit event from a colleague opening it, and a surface that
 * cannot tell them apart cannot word the access log honestly.
 */
export type HrAuditedRow<T> = {
  row: T;
  /** Which allow lane granted this — the server's word, never inferred here. */
  basis: string | null;
  /** True when the viewer IS the subject. Never a client-side id comparison. */
  isSelfAccess: boolean;
  auditId: string | null;
};

// ── The law portal (D25, 2026-08-28) ────────────────────────────────────────
//
// The org side of the employment-law library. The platform sets the baseline and
// an org NEVER edits it; an org layers its own rules over it, more generously,
// and the server is the one that decides whether a layer is lawful.
//
// Every field below is MAPPED off the wire in `service.ts`, never cast. Shapes
// read live from `hr.law_portal_data` and `hr.validate_org_config` on 2026-08-28.

/**
 * Where a rule comes from. `url` is frequently a repo-relative research path
 * rather than an http link, so a surface must not blindly render it as an anchor.
 */
export type HrLawCitation = {
  authority: string | null;
  title: string | null;
  url: string | null;
  /** e.g. `program_research` — how strong the source is, in the seeder's words. */
  confidence: string | null;
  retrieved_at: string | null;
  verified_at: string | null;
};

/**
 * What an organization may do to a rule class.
 *
 * - `no` — statutory content only. The org configures how it COMPLIES, never the law.
 * - `more_generous_only` — the org may go beyond the floor, never beneath it.
 * - `within_bounds` — the org chooses inside an envelope the statute defines.
 */
export type HrOrgConfigurability = "no" | "more_generous_only" | "within_bounds";

export type HrLawRuleClass = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  org_configurable: HrOrgConfigurability;
  produces_money: boolean;
  /** JSON Schema. Often nested; a surface must cope with not understanding it. */
  parameter_schema: Record<string, unknown> | null;
};

/**
 * 🚨 `advisory` NEVER COMPUTES MONEY. It is law we hold but have not verified, so
 * it flags and warns and nothing else. Anything the mapper cannot read as exactly
 * `active` is reported as `advisory`, because the failure that matters is calling
 * unverified law binding — never the other way round.
 */
export type HrLawRuleStatus = "active" | "advisory";

export type HrPlatformLawRule = {
  id: string;
  rule_class: string;
  rule_class_label: string;
  produces_money: boolean;
  org_configurable: HrOrgConfigurability;
  jurisdiction_key: string;
  jurisdiction_name: string | null;
  /** `federal` | `state` | `county` | `city` — the server's word, never inferred. */
  jurisdiction_level: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: HrLawRuleStatus;
  basis: string | null;
  citation: HrLawCitation | null;
  parameters: Record<string, unknown>;
  applicability: unknown;
  /**
   * The parameter keys inside THIS rule that nobody has verified. Non-empty means
   * anything computed from those keys is pending verification, never authoritative.
   */
  unverified_keys: string[];
  version: number | null;
  /** True when this rule's jurisdiction is on one of the org's chains. */
  applies_to_org: boolean;
  /**
   * D26 — the organization REMOVED this rule for itself. Keyed by
   * (rule class × jurisdiction), so a later amendment of the rule row does not
   * silently re-apply it. Removal is real: the resolver excludes the rule with a
   * traced `opted_out_by_org` outcome and the platform stops enforcing it.
   */
  opted_out: boolean;
};

/** One rule this organization authored. Layered over the baseline, never replacing it. */
export type HrOrgLawRule = {
  id: string;
  rule_class: string;
  rule_class_label: string;
  jurisdiction_key: string;
  jurisdiction_name: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: HrLawRuleStatus;
  basis: string | null;
  citation: HrLawCitation | null;
  parameters: Record<string, unknown>;
  applicability: unknown;
  version: number | null;
};

/**
 * One removal decision this organization made over a platform rule (D26).
 *
 * The decision is the RECORD of why a law is not being enforced here, so it is
 * never discarded on the client: it names who decided, when, and in whose words.
 */
export type HrLawOptOut = {
  rule_class: string;
  jurisdiction_key: string;
  reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
};

export type HrLawPortal = {
  /** Where the employer actually operates, derived from its locations and establishments. */
  org_jurisdiction_keys: string[];
  /** Those keys expanded up their chains (city → county → state → US). */
  chain_keys: string[];
  classes: HrLawRuleClass[];
  platform_rules: HrPlatformLawRule[];
  org_rules: HrOrgLawRule[];
  /** Every rule this org removed (D26). Mirrors `opted_out` on the rules themselves. */
  opt_outs: HrLawOptOut[];
};

/** What `hr_org_jurisdiction_rule_set_applies` answers on a granted call (D26). */
export type HrLawAppliesAck = {
  /** `applies` — back on the default. `opted_out` — the platform stops enforcing it. */
  decision: "applies" | "opted_out";
  rule_class: string | null;
  jurisdiction_key: string | null;
};

/**
 * One thing the server found wrong (or worth saying) about a proposed org rule.
 *
 * 🚨 `message` IS WRITTEN FOR AN HR ADMIN AND IS RENDERED VERBATIM. It names the
 * jurisdiction, what the law requires and what to do instead. Never summarize it,
 * never replace it with a generic sentence, never clamp the value and save anyway.
 */
export type HrLawValidationFinding = {
  code: string | null;
  message: string;
  field: string | null;
  jurisdiction_key: string | null;
  jurisdiction_name: string | null;
  citation: HrLawCitation | null;
  /** How many active employees sit in that jurisdiction today. Absent on warnings. */
  affected_employees: number | null;
  configured: unknown;
  required: unknown;
};

export type HrLawValidation = {
  ok: boolean | null;
  violations: HrLawValidationFinding[];
  warnings: HrLawValidationFinding[];
};

/** What the org rule editor sends to `hr_org_jurisdiction_rule_save`. */
export type HrOrgLawRuleDraft = {
  /** Present → editing that org rule. Absent → creating one. */
  id?: string | null;
  rule_class: string;
  jurisdiction_key: string;
  effective_from?: string | null;
  effective_to?: string | null;
  parameters: Record<string, unknown>;
  basis?: string | null;
};

export type HrOrgLawRuleSaveAck = {
  rule_id: string | null;
  version: number | null;
  /** What the server checked. Present on a granted save too — warnings included. */
  validation: HrLawValidation | null;
};
