/**
 * features/hr/leave/api/types.ts — the CLIENT shapes of the Leave & PTO RPC lane.
 *
 * 🚨 EVERY TYPE HERE WAS WRITTEN AGAINST THE LIVE FUNCTION BODY, NOT AGAINST THE SPEC TABLE.
 * Read 2026-08-27 from `pg_get_functiondef` on project `brsgrqvjdzwihsvnfqkf` for
 * `hr.my_time_off`, `hr.leave_figures`, `hr._leave_sentence`, `hr.leave_span_hours`,
 * `hr.leave_day_hours`, `hr.leave_project_balance`, `hr.leave_request_preview`,
 * `hr.leave_request_submit`, `hr.leave_request_cancel`, `hr.leave_ledger_view`.
 *
 * 🚨 WHY ALMOST EVERY FIGURE IS `number | null` AND NOT `number`.
 * `hr.leave_figures` has TWO return shapes, and the difference is not cosmetic:
 *
 *   • unlimited policy → `{ok, unlimited:true, as_of, policy_id, policy_name, leave_kind,
 *     sentence}` and **nothing else**. No five figures, no `ledger_balance`, no
 *     `identity_holds`, no `accrual_method`, no `increment_minutes`.
 *   • every other policy → the full block.
 *
 * So a `?? 0` on `accruedToDate` would print a confident **zero** on an unlimited policy —
 * a number the server never computed, on the one screen SPEC-LEAVE §5 says must not lie.
 * `null` means WITHHELD and renders dark. `identityHolds` is `boolean | null` for the same
 * reason: the honesty banner fires on `=== false`, never on a missing field.
 */

/** SPEC-LEAVE §4.1 — the frozen request enum. The UI adds no state of its own. */
export type LeaveRequestState =
  | "draft"
  | "submitted"
  | "approved"
  | "denied"
  | "cancelled"
  | "taken"
  | "partially_taken";

/** `hr._leave_viewer` — `self` files requests; `delegated` reads only. */
export type LeaveViewerRung = "self" | "delegated";

// ── hr.leave_figures ─────────────────────────────────────────────────────────

/**
 * The §5 balance block, exactly as `hr.leave_figures` builds it.
 *
 * `ok:false` + `refused` is the nested "this policy is gone" answer — a nested refusal, NOT
 * a top-level one, so it never becomes an `HrDenied`; it renders as a block with everything
 * withheld.
 */
export interface LeaveFigures {
  ok: boolean | null;
  /** `LEAVE_POLICY_NOT_FOUND` when the policy could not be resolved. */
  refused: string | null;
  /** True → render the WORD. No number, no zero, no bar (§5). */
  unlimited: boolean | null;
  asOf: string | null;
  policyId: string | null;
  policyName: string | null;
  leaveKind: string | null;

  // ── the five figures. ABSENT on an unlimited policy. ──
  accruedToDate: number | null;
  usedTaken: number | null;
  approvedUpcoming: number | null;
  pendingApproval: number | null;
  available: number | null;

  /** Latest `balance_after` at `as_of`. The identity's right-hand side. */
  ledgerBalance: number | null;
  /** Σ forfeiture + carryover_expiry + payout + negative adjustments. */
  removed: number | null;
  /**
   * The server's own verdict on
   * `accrued − used − upcoming − removed = ledger_balance`.
   * FALSE is a loud banner. NULL is "not computed" and says nothing.
   */
  identityHolds: boolean | null;

  // ── policy knobs, read server-side. Never hardcode a limit against these. ──
  accrualMethod: string | null;
  accrualRate: number | null;
  accrualPerUnits: number | null;
  incrementMinutes: number | null;
  balanceCap: number | null;
  carryoverAllowed: boolean | null;
  negativeBalanceAllowed: boolean | null;
  negativeBalanceFloor: number | null;
  statutoryBasisRuleClass: string | null;
  /** Set only when the policy has a waiting period; `null` means usable now. */
  usableOn: string | null;
}

/** §2.4's authored blackout shape, camelized. Rendered by `label`/`note`, verbatim. */
export interface LeaveBlackoutRule {
  key: string | null;
  label: string | null;
  from: string | null;
  to: string | null;
  mode: string | null;
  note: string | null;
  exemptLeaveKinds: string[];
}

/** One enrolled, ACTIVE policy on `hr_my_time_off`. Figures + the enrollment's own facts. */
export interface MyLeavePolicy extends LeaveFigures {
  enrollmentId: string | null;
  employmentId: string | null;
  /**
   * 🚨 SERVER-GENERATED, RENDERED VERBATIM. `hr._leave_sentence` owns every wording in §5;
   * a client that composes this sentence is a second implementation of policy prose.
   */
  sentence: string | null;
  policyYearStartOn: string | null;
  reinstatedHours: number | null;
  reinstatedFromEmploymentId: string | null;
  blackoutRules: LeaveBlackoutRule[];
  /** §2.4 — reason slugs that may never be refused or require justification. */
  mandatedUses: string[];
  documentationRequiredAfterDays: number | null;
  /** The ledger address the server hands back with the figures it explains. */
  ledgerHref: string | null;
}

// ── conflict_check (§4.2) ────────────────────────────────────────────────────

/**
 * One finding. 🚨 `message` IS THE PAGE TEXT — rendered verbatim, with its numbers.
 * `code` is a machine token and never reaches the screen.
 */
export interface LeaveConflictFinding {
  code: string | null;
  message: string | null;
  detail: Record<string, unknown>;
}

export interface LeaveConflictCheck {
  evaluatedAt: string | null;
  dayHoursBasis: string | null;
  balanceNow: number | null;
  projectedBalanceAtStart: number | null;
  hard: LeaveConflictFinding[];
  advisory: LeaveConflictFinding[];
}

// ── hr.my_time_off → requests[] ──────────────────────────────────────────────

export interface MyLeaveRequest {
  id: string;
  leavePolicyId: string | null;
  policyName: string | null;
  leaveKind: string | null;
  startsOn: string | null;
  endsOn: string | null;
  requestedHours: number | null;
  approvedHours: number | null;
  state: LeaveRequestState | null;
  decidedAt: string | null;
  denialReason: string | null;
  isPartialDay: boolean | null;
  dayParts: LeaveDayPart[];
  /** The server deliberately says only THAT a case is linked, never which (§9.6). */
  leaveCaseLinked: boolean;
  workflowInstanceId: string | null;
  conflictCheck: LeaveConflictCheck | null;
}

export interface MyTimeOff {
  employmentId: string | null;
  viewerRung: LeaveViewerRung | null;
  asOf: string | null;
  policies: MyLeavePolicy[];
  requests: MyLeaveRequest[];
  /** `viewer_rung === 'self'`. Absence, not disablement: false → no form in the DOM. */
  canRequest: boolean;
}

// ── hr.leave_span_hours / hr.leave_day_hours ─────────────────────────────────

/** What the client SENDS as `p_day_parts`. Read in SQL as `x->>'date'` / `x->>'hours'`. */
export interface LeaveDayPart {
  date: string;
  hours: number;
}

/**
 * One day of the span, straight from `hr.leave_day_hours`.
 *
 * `excluded` and `label` are ABSENT on the `unknown_employment` branch and on any working
 * day, so both are nullable. A day is excluded when the server says so — never because the
 * client looked at `hours === 0`.
 */
export interface LeaveSpanDay {
  date: string | null;
  hours: number | null;
  /** `scheduled_shift` · `holiday` · `non_working` · `fte_standard_day` · `no_standard_day`. */
  basis: string | null;
  excluded: boolean | null;
  /** The holiday's NAME, "Weekend", or the no-standard-day sentence. Rendered verbatim. */
  label: string | null;
  partial: boolean | null;
}

export interface LeaveSpan {
  totalHours: number | null;
  days: LeaveSpanDay[];
  calendarDays: number | null;
  workingDays: number | null;
  excludedDays: number | null;
}

/** `hr.leave_project_balance` — figures PLUS the projection's own honesty fields. */
export interface LeaveProjection extends LeaveFigures {
  projected: boolean | null;
  /** `ledger_replay` · `pay_periods_closing` · `month_boundaries` · `posted_only` · … */
  projectionBasis: string | null;
  projectsFutureAccrual: boolean | null;
  projectedAccrual: number | null;
  projectedBalance: number | null;
  projectedAvailable: number | null;
  /** The server's sentence for what it refuses to guess. Verbatim or nothing. */
  projectionNote: string | null;
  /** Set when the projection was refused for being past the horizon. */
  horizonDays: number | null;
  detail: string | null;
}

export interface LeaveRequestPreview {
  span: LeaveSpan;
  /** §4.1's cost sentence. Server-composed; the client never assembles one. */
  breakdownSentence: string | null;
  figures: LeaveFigures;
  projection: LeaveProjection | null;
  policyName: string | null;
  incrementMinutes: number | null;
  mandatedUses: string[];
  documentationRequired: boolean | null;
  documentationRequiredAfterDays: number | null;
}

// ── writes ───────────────────────────────────────────────────────────────────

export interface LeaveRequestSubmitResult {
  leaveRequestId: string | null;
  workflowInstanceId: string | null;
  state: LeaveRequestState | null;
  requestedHours: number | null;
  conflictCheck: LeaveConflictCheck | null;
  /** True → render every `conflictCheck.hard[].message` verbatim. Never a generic toast. */
  rejectedAtIntake: boolean;
}

/** `withdrawn` (was `submitted`) or `cancellation_requested` (was `approved`). */
export type LeaveCancelOutcome = "withdrawn" | "cancellation_requested";

export interface LeaveCancelResult {
  outcome: LeaveCancelOutcome | string | null;
  workflowInstanceId: string | null;
}

// ── hr.leave_ledger_view (§12) ───────────────────────────────────────────────

export interface LeaveLedgerSource {
  kind: string | null;
  id: string | null;
}

export interface LeaveLedgerEntry {
  id: string;
  occurredOn: string | null;
  /** 🚨 NEVER RENDERED. §12 LAW 3a: no cell prints a type name. `sentence` is the cell. */
  entryKind: string | null;
  /** The server's human sentence for this entry. Verbatim. */
  sentence: string | null;
  hoursDelta: number | null;
  balanceAfter: number | null;
  runningSum: number | null;
  source: LeaveLedgerSource | null;
  reversesEntryId: string | null;
  /** The `hr.calculation_snapshot` behind this entry. Null → no rule door exists. */
  snapshotId: string | null;
  /** Server-computed: a rule-bearing entry with no snapshot. Red chip, raise a defect. */
  unexplained: boolean;
  engineKey: string | null;
  engineVersion: string | null;
  /** The engine's own payload, VERBATIM — never key-mapped (see `rpc.ts`). */
  calc: unknown;
  actorType: string | null;
  actorName: string | null;
}

export interface LeaveLedgerView {
  viewerRung: LeaveViewerRung | null;
  employmentId: string | null;
  leavePolicyId: string | null;
  asOf: string | null;
  entries: LeaveLedgerEntry[];
  figures: LeaveFigures;
  sentence: string | null;
  /** FALSE → a BLOCKING banner naming `divergenceAtEntryId`. A silent drift is worse. */
  runningBalanceOk: boolean | null;
  divergenceAtEntryId: string | null;
  unexplainedEntryCount: number | null;
  entryCount: number | null;
}

// ── platform.categories, dimension `hr_leave_request_reason` ─────────────────

export interface LeaveReasonCategory {
  id: string;
  slug: string;
  name: string;
  position: number | null;
  /** True when the slug appears in the policy's `mandated_uses` (§2.4). */
  mandated: boolean;
}
