// features/hr/constants.ts
//
// The HR module's fixed vocabulary — the values the server already speaks, spelled
// once so no surface invents a second spelling.
//
// 🚨 CAPABILITY NAMES ARE NOT INVENTED HERE. Every string in `HR_CAPABILITIES` was
// read out of `hr.access_role.capabilities` in the live database (2026-08-26). Adding
// one to this list does not create it; granting it in `hr.access_role` does.
//
// Nav visibility, tab visibility and action visibility are CAPABILITY-driven, never
// role-string-driven (SPEC-UI-IA §2.2) — a custom Access Level that grants timesheet
// approval without full HR admin gets Time without inheriting the rest.

/** The three nav personas (SPEC-UI-IA §2.2). `org_admin` is a profile VIEWER kind, not a nav persona. */
export const HR_PERSONAS = ["employee", "manager", "hr_admin"] as const;
export type HrPersona = (typeof HR_PERSONAS)[number];

/** Who is looking at one employee record (`hr_employee_profile.viewer`). */
export const HR_VIEWER_KINDS = ["self", "manager", "hr_admin", "org_admin"] as const;
export type HrViewerKind = (typeof HR_VIEWER_KINDS)[number];

/** Live capability keys, from `hr.access_role.capabilities`. */
export const HR_CAPABILITIES = [
  "audit.read",
  "authority.grant",
  "background_check.adjudicate",
  "break_glass",
  "candidate.read",
  "candidate.write",
  "comp.read",
  "comp.write",
  "corrective_action.issue",
  "directory.read",
  "eeo.aggregate",
  "identity.read",
  "identity.write",
  "incident.investigate",
  "incident.read",
  "integration.dispatch",
  "integration.read",
  "integration.record",
  "medical.read",
  "medical.write",
  "payroll.export",
  "payroll.export_pii",
  "payroll.read",
  "records.govern",
  "requisition.manage",
  "role.assign",
  "self.read",
  "self.write",
  "ssn.reveal",
  "time.read",
  "workflow.cancel",
  "workflow.reassign",
  "workflow.record_result",
  "workflow.resolve_failure",
  "workflow.view_queue",
  "working_record.read",
  "working_record.write",
] as const;
export type HrCapability = (typeof HR_CAPABILITIES)[number];

/** The org role a person holds in `iam.memberships` — HR reads it, never writes it. */
export type HrOrgRole = "owner" | "admin" | "member" | (string & {});

/**
 * The profile tab segments (SPEC-UI-IA §4.1 / SPEC-EMPLOYEES §2.3.1).
 *
 * 🚨 This list is the ROUTE vocabulary, not an access decision. The authoritative
 * tab set for a given viewer is `hr_employee_profile().tabs` — the server already
 * omits every tab the viewer cannot see, and §4.2 says an inaccessible tab is not
 * in the tab bar. Never intersect this list with a client-side guess.
 */
export const HR_PROFILE_TABS = [
  "personal",
  "job",
  "compensation",
  "time-off",
  "time",
  "performance",
  "training",
  "emergency",
  "documents",
  "notes",
  "relations",
] as const;
export type HrProfileTab = (typeof HR_PROFILE_TABS)[number];

/** Human labels for the tab segments. Custom tabs carry their own admin-set label. */
export const HR_PROFILE_TAB_LABELS: Record<HrProfileTab, string> = {
  personal: "Personal",
  job: "Job & reporting",
  compensation: "Compensation",
  "time-off": "Time off",
  time: "Time & schedule",
  performance: "Performance",
  training: "Training",
  emergency: "Emergency contacts",
  documents: "Documents",
  notes: "Notes",
  relations: "Relations",
};

/** `hr.employee.directory_status`. */
export const HR_DIRECTORY_STATUSES = [
  "prehire",
  "active",
  "on_leave",
  "terminated",
] as const;
export type HrDirectoryStatus = (typeof HR_DIRECTORY_STATUSES)[number];

/** `hr.position_assignment.worker_class` — gates machinery, never presence (SPEC-EMPLOYEES §1.4). */
export const HR_WORKER_CLASSES = [
  "employee",
  "contractor",
  "intern",
  "seasonal",
  "volunteer",
] as const;
export type HrWorkerClass = (typeof HR_WORKER_CLASSES)[number];

/** The directory's server-side sort keys (anything else is clamped to `display_name`). */
export const HR_DIRECTORY_SORTS = [
  "display_name",
  "hire_date",
  "directory_status",
  "employee_number",
] as const;
export type HrDirectorySort = (typeof HR_DIRECTORY_SORTS)[number];

/**
 * The effective-dated change reason categories the UI must ask for IN WORDS
 * (SPEC-EMPLOYEES §6.3). Guessing the category from the date alone is how audit
 * trails get destroyed, so these three sentences are the question, verbatim.
 */
export const HR_CHANGE_INTENTS = [
  {
    value: "correction",
    /** "This is wrong; it was never true." */
    prompt: "This is wrong; it was never true.",
    consequence:
      "The existing record is corrected in place. The prior value stays in the record history.",
  },
  {
    value: "amendment",
    /** "It was true, and now something new is true." */
    prompt: "It was true, and now something new is true.",
    consequence:
      "The current record is closed on the day before this date and a new one starts on it.",
  },
  {
    value: "backdated_correction",
    /** "It should have been true from an earlier date." */
    prompt: "It should have been true from an earlier date.",
    consequence:
      "A new record starts on the earlier date. Anything already calculated from the old value is not rewritten.",
  },
] as const;
export type HrChangeIntent = (typeof HR_CHANGE_INTENTS)[number]["value"];

/** The `?org=` query key every HR door carries. Accepts a slug OR a uuid (SPEC-UI-IA §1). */
export const HR_ORG_PARAM = "org";
