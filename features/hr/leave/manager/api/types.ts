/**
 * features/hr/leave/manager/api/types.ts — the CLIENT shapes of the leave DESK doors.
 *
 * 🚨 EVERY TYPE HERE WAS WRITTEN AGAINST THE LIVE FUNCTION BODY, NOT AGAINST THE SPEC TABLE.
 * Read 2026-08-27 from `pg_get_functiondef` on project `brsgrqvjdzwihsvnfqkf` for
 * `hr.leave_policy_list`, `hr.leave_policy_validate`, `hr.leave_policy_save`,
 * `hr.leave_enroll`, `hr.leave_balances`, `hr.leave_calendar`, `hr.leave_adjust`, and for
 * `hr.validate_org_config` (which builds every violation and warning object).
 *
 * 🚨 WHY SO MANY FIELDS ARE OPTIONAL, AND WHY NONE OF THEM DEFAULT.
 * `hr.validate_org_config` builds violations with `jsonb_build_object` per branch, and the
 * BRANCHES DIFFER. `forfeiture_unlawful` carries `rule_version`, `citation` and
 * `affected_employees`; `accrues_slower_than_floor` carries `citation` and
 * `affected_employees` but **no `rule_version`**; a WARNING (`forfeiture_unlawful_unverified`)
 * carries neither a citation nor a count nor a `fix`. So "This affects N employees" is
 * rendered only when `affectedEmployees` is a real number, and the "Why?" disclosure prints
 * only the fields that actually arrived. A `?? 0` on the count would print
 * "This affects 0 employees in California" under a refusal — a sentence that reads as
 * "nobody cares" on the one dialog whose whole job is to say who is affected.
 */

import type { LeaveFigures } from "../../api/types";

// ── shared ───────────────────────────────────────────────────────────────────

/**
 * `hr.jurisdiction_rule.citation`.
 *
 * Only the four SINGLE-WORD fields are declared. The shared transport camelizes response keys,
 * so `verified_at` / `verified_by` / `retrieved_at` would arrive under a spelling that is not
 * the one they are stored under; the fields below are spelled identically either way, which
 * makes this the only part of the citation that can be read without depending on the mapping.
 *
 * `confidence` is live data worth showing: rows currently in the platform carry
 * `program_research` and `unverified`, and an admin reading a refusal is entitled to know
 * which of the two is blocking them.
 */
export interface LeaveRuleCitation {
  authority?: string | null;
  url?: string | null;
  title?: string | null;
  confidence?: string | null;
}

/** One operating jurisdiction, from the distinct establishments' jurisdictions. */
export interface LeaveJurisdiction {
  key: string | null;
  name: string | null;
}

// ── hr.leave_policy_list ─────────────────────────────────────────────────────

/** §2.4's authored blackout shape. Rendered by `label` / `note`, verbatim. */
export interface LeavePolicyBlackout {
  key: string | null;
  label: string | null;
  from: string | null;
  to: string | null;
  recurringAnnual: boolean | null;
  mode: string | null;
  note: string | null;
  maxConcurrentOut: number | null;
  exemptLeaveKinds: string[];
}

/**
 * One row of `policies[]` — every editable column the door returns, plus `enrolled_count`.
 *
 * 🚨 `requires_approval` AND `statutory_jurisdiction_id` ARE ACCEPTED BY `hr_leave_policy_save`
 * AND ARE NOT RETURNED BY `hr_leave_policy_list`. They are therefore ABSENT from this type and
 * from the editor: a control whose value cannot be read back would render its default on every
 * load and silently reset the column on every save. Filed in the surface's own header.
 */
export interface LeavePolicy {
  id: string;
  name: string | null;
  leaveKind: string | null;
  accrualMethod: string | null;
  accrualRate: number | null;
  accrualPerUnits: number | null;
  accrualUnit: string | null;
  accrualStarts: string | null;
  isActive: boolean | null;
  version: number | null;
  statutoryBasisRuleClass: string | null;
  balanceCap: number | null;
  annualAccrualCap: number | null;
  carryoverAllowed: boolean | null;
  carryoverCap: number | null;
  carryoverExpiresAfterDays: number | null;
  negativeBalanceAllowed: boolean | null;
  negativeBalanceFloor: number | null;
  payoutOnTermination: string | null;
  usableAfterDays: number | null;
  waitingPeriodDays: number | null;
  incrementMinutes: number | null;
  documentationRequiredAfterDays: number | null;
  reinstateOnRehireWithinDays: number | null;
  earningCodeId: string | null;
  blackoutRules: LeavePolicyBlackout[];
  mandatedUses: string[];
  workerClassScope: string[];
  scheduleClassScope: string[];
  /** A DOOR (§2.1) — it opens the policy's enrollment roster. */
  enrolledCount: number | null;
}

export interface LeavePolicyList {
  rung: string | null;
  canWrite: boolean;
  operatingJurisdictions: LeaveJurisdiction[];
  policies: LeavePolicy[];
}

// ── hr.leave_policy_validate ─────────────────────────────────────────────────

/**
 * The action that FIXES a violation, composed by `hr.leave_policy_validate` itself.
 *
 * `set` is the engine's own patch. Its keys are `hr.leave_policy` COLUMN names in storage
 * (`carryover_allowed`, `accrual_per_units`, `usable_after_days`) and arrive CAMELIZED through
 * the shared transport — which is the editor's own field spelling, so the patch applies to
 * form state directly and the snake_case names are re-created when the save payload is built.
 *
 * `focusField` is a VALUE, not a key, so it stays `'carryover_cap'`.
 */
export interface LeaveViolationFix {
  label: string | null;
  /** A `hr.leave_policy` COLUMN name — the field the dialog focuses. Never camelized. */
  focusField: string | null;
  /** Camel-keyed patch, ready to merge into the editor's form state. */
  set: Record<string, unknown> | null;
}

/**
 * One violation. `message` IS THE PAGE TEXT (§2.6) and is rendered verbatim; `code` is a
 * machine token and never reaches the screen.
 */
export interface LeaveConfigViolation {
  code: string | null;
  message: string | null;
  jurisdictionKey: string | null;
  jurisdictionName: string | null;
  ruleClass: string | null;
  ruleId: string | null;
  /** Absent on the sick-leave-floor branches. Never faked. */
  ruleVersion: string | null;
  field: string | null;
  /**
   * The engine's own evidence — what the org configured, and what the rule requires. Rendered
   * as data in the "Why?" disclosure, never turned into a sentence here: the sentence is
   * `message`, and it already names the lawful alternative.
   */
  configured: unknown;
  required: unknown;
  citation: LeaveRuleCitation | null;
  /** Absent on warnings and on some branches — `null` means "not told", never zero. */
  affectedEmployees: number | null;
  /** Present only on the product-floor branches (`bound_basis`). */
  boundBasis: string | null;
  fix: LeaveViolationFix | null;
}

export interface LeavePolicyValidation {
  /**
   * FALSE when the policy claims no statutory basis, or when we hold no parameter mapping for
   * its class. `detail` then carries the server's own sentence about what was NOT checked —
   * and a refusal must state what was actually checked, so it is rendered.
   */
  checked: boolean | null;
  ok: boolean | null;
  detail: string | null;
  violations: LeaveConfigViolation[];
  warnings: LeaveConfigViolation[];
  advisoryRulesConsulted: string[];
  jurisdictionsChecked: string[];
  /** The exact parameters the twin sent to `hr.validate_org_config`. Evidence, rendered as data. */
  parametersSent: unknown;
}

// ── hr.leave_policy_save ─────────────────────────────────────────────────────

export interface LeavePolicySaved {
  policyId: string | null;
  version: number | null;
  isActive: boolean | null;
  validation: LeavePolicyValidation | null;
}

/** The three named refusal reasons `hr.leave_policy_save` returns. */
export type LeaveSaveRefusalReason =
  | "unlawful_configuration"
  | "warnings_unacknowledged"
  | "accrual_method_change_requires_owner";

/**
 * A save refusal, lifted out of `HrDenied.payload`.
 *
 * This is not an error path — it is §2.6's rejection UX arriving with everything it needs:
 * the validation, the admin's own payload (which stays in the form), and, on the warnings
 * branch, `saveAnyway: true`.
 */
export interface LeaveSaveRefusal {
  reason: string;
  detail: string | null;
  validation: LeavePolicyValidation | null;
  /** The payload the admin sent. NEVER applied and NEVER cleared — §2.6. */
  payload: Record<string, unknown> | null;
  /** `true` on `warnings_unacknowledged`: re-call with `acceptWarnings`. */
  saveAnyway: boolean;
  /** Present on `accrual_method_change_requires_owner`. */
  affectedEnrollments: number | null;
}

// ── hr.leave_enroll ──────────────────────────────────────────────────────────

export interface LeaveEnrollSkip {
  employmentId: string | null;
  /** `contractor_not_auto_enrolled` · `outside_worker_class_scope` · `already_enrolled`. */
  reason: string | null;
  detail: string | null;
  workerClass: string | null;
}

export interface LeaveEnrollResult {
  enrolled: number | null;
  skipped: LeaveEnrollSkip[];
}

// ── hr.leave_balances ────────────────────────────────────────────────────────

/**
 * One balance row: `hr.leave_figures`' whole object, plus the four keys `hr.leave_balances`
 * merges onto it. Extending `LeaveFigures` is what lets `<LeaveBalanceBlock>` — the ONE
 * balance component (§5) — render this row without a second shape.
 */
export interface LeaveBalanceRow extends LeaveFigures {
  employmentId: string | null;
  employeeName: string | null;
  /** `hr._leave_sentence`, verbatim. Never composed here. */
  sentence: string | null;
  /** The server's own §12 path. The surface re-attaches `?org=` (see `../routes.ts`). */
  ledgerHref: string | null;
}

export interface LeaveBalanceList {
  /** `organization` · `team` · `mine` — clamped SERVER-side by the caller's rung. */
  scope: string | null;
  /** THE VIEW LAW: rendered in words, exactly as the server worded it. */
  scopeLabel: string | null;
  rung: string | null;
  canAdjust: boolean;
  rows: LeaveBalanceRow[];
}

// ── hr.leave_calendar ────────────────────────────────────────────────────────

/**
 * One who's-out entry.
 *
 * 🚨 THE DISCLOSURE LADDER IS ALREADY APPLIED SERVER-SIDE (§10). `label`, `hours`, `href`,
 * `existence_statement` and `case_linked` are each `null` for a rung that may not have them —
 * a peer's entry has no `href`, so a peer's "Out" is NOT a door, and the client adds nothing
 * back. Never widen an entry with a fact this object does not carry.
 */
export interface LeaveCalendarEntry {
  employmentId: string | null;
  employeeName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  partialDay: boolean | null;
  /** `self` · `admin` · `manager` · `peer`. */
  viewerRung: string | null;
  /** Rendered verbatim. "Out", "Out — <policy>", "Out — approved leave". */
  label: string | null;
  /** §9.6's worded statement, or null. Never a masked field, never a lock icon. */
  existenceStatement: string | null;
  hours: number | null;
  /** Null on a peer entry — absence, not disablement. */
  href: string | null;
  caseLinked: boolean | null;
}

export interface LeaveCalendar {
  from: string | null;
  to: string | null;
  rung: string | null;
  entries: LeaveCalendarEntry[];
  /** "Nobody is scheduled to be out." — empty is a STATE, not a blank (§10). */
  emptyStatement: string | null;
}

// ── hr.leave_adjust ──────────────────────────────────────────────────────────

/** §6's reason dimension, exactly the seven `hr.leave_adjust` accepts. */
export const LEAVE_ADJUSTMENT_REASONS = [
  { slug: "correction_of_error", label: "Correction of an error" },
  { slug: "manual_grant", label: "Manual grant" },
  { slug: "negotiated_settlement", label: "Negotiated settlement" },
  { slug: "migration_correction", label: "Migration correction" },
  { slug: "over_accrual_recovery", label: "Over-accrual recovery" },
  { slug: "policy_transition", label: "Policy transition" },
  { slug: "other", label: "Other" },
] as const;

export type LeaveAdjustmentReason = (typeof LEAVE_ADJUSTMENT_REASONS)[number]["slug"];

/** The two reasons `hr.leave_adjust` accepts for a REMOVAL against a statutory policy. */
export const LEAVE_STATUTORY_REMOVAL_REASONS: readonly LeaveAdjustmentReason[] = [
  "correction_of_error",
  "over_accrual_recovery",
];

export interface LeaveAdjustResult {
  entryId: string | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  /** `hr.leave.balance_adjusted` — the employee is ALWAYS told (§6). */
  notify: string | null;
}

/**
 * A `hr_leave_adjust` refusal, lifted out of `HrDenied.payload`.
 *
 * `confirmation_required` and `below_negative_floor` both name the resulting balance, which
 * the dialog shows before it re-sends with `confirmBelowFloor`.
 */
export interface LeaveAdjustRefusal {
  reason: string;
  detail: string | null;
  floor: number | null;
  resultingBalance: number | null;
}
