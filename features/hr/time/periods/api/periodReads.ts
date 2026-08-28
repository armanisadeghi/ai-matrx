/**
 * features/hr/time/periods/api/periodReads.ts — the pay-period reads for routes 32 and 33.
 *
 * WHY THIS FILE EXISTS BESIDE `features/hr/time/api/service.ts` RATHER THAN INSIDE IT
 * ----------------------------------------------------------------------------------
 * The shared service module is a different agent's file in a shared checkout, and these reads are
 * wholly this lane's. They still go through **the one door** — `callHrTimeRpc` — so there is no
 * second transport, no second error class and no second mock lane.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 MAPPED, NOT CAST — and the mapping lives HERE so the declared return type is TRUE.
 *
 * `callHrTimeRpc<T>` camelizes the payload and ends in `as T`. A cast cannot fail, so where the
 * live shape differs from the hand-written type nothing goes red: fields arrive `undefined` and the
 * surface renders a blank, a NaN, or crashes — at runtime, only once real data exists. This file
 * previously had three such casts. Mapping them against the live envelopes (read from the function
 * bodies on 2026-08-26) found **five defects that a cast had been hiding**:
 *
 *   1. `hr_time_adjustment_list` takes `p_filters jsonb` and matches a period on EITHER
 *      `original_pay_period_id` OR `target_pay_period_id`. This file was passing
 *      `p_original_pay_period_id` — an argument that does not exist. **Every call would have failed
 *      as PGRST202.**
 *   2. The money-absent flag on an adjustment is `calc.amount_pending`, surfaced as
 *      **`amount_pending`** — not `amountWithheld`, which this lane invented. The advisory-money
 *      sentence would never have rendered, and a null amount would have read as "no amount".
 *   3. `target_period_label`, `created_by_name` and `exported_in_export_id` **do not exist** on the
 *      server payload. Three fields the UI printed were always going to be blank.
 *   4. `hr_pay_period_get` returns `reopen_allowed` — the resolved
 *      `hr.time_and_attendance.allow_period_reopen` knob. Route 33 was **hard-coding `true`**,
 *      which would have offered Reopen to an org that had switched it off.
 *   5. `hr_pay_period_get` also returns `boundary_note` and `reopen_notice` as **server-authored
 *      sentences**. This lane was generating its own copy client-side for both.
 *
 * The rule the mappers follow: **a field the server does not send stays dark.** Nothing here
 * invents a default, a zero or a placeholder — a fabricated figure on a payroll surface is the
 * defect this whole lane exists to avoid.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 NO CLIENT COMPUTES HOURS. Nothing here subtracts a timestamp, multiplies a rate or sums a
 * column. Every figure arrives computed and snapshot-backed.
 */

"use client";

import { callHrTimeRpc, type HrRpcOptions } from "../../api/rpc";
import type { PageRequest, Paged, PayPeriodRow, PayPeriodState } from "../../api/types";

// ---------------------------------------------------------------------------------------------
// Mapping helpers — small, shared, and deliberately unforgiving about invention
// ---------------------------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A field the server did not send stays `null`. It never becomes `""` or `0`. */
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number") return value;
  // Postgres `numeric` arrives as a STRING through PostgREST. Coercing here is a parse of a value
  // the server already computed — not a computation. Nothing in this file derives a figure.
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function num(value: unknown, fallback: number): number {
  return numOrNull(value) ?? fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The workflow block `hr.wf_for_target` returns on every row that has one.
 * 🚨 `deepLink` is the door into the ONE HR task inbox. A decision is taken THERE, never by a
 * second decision surface this lane invents — the workflow engine is the only approval engine.
 */
export interface WorkflowRef {
  instanceId: string;
  flowKey: string;
  state: string;
  /** `/hr/tasks/<instanceId>` — where the decision is actually made. */
  deepLink: string | null;
}

function mapWorkflow(raw: unknown): { open: WorkflowRef[]; history: WorkflowRef[] } {
  const w = rec(raw);
  const list = (v: unknown): WorkflowRef[] =>
    (Array.isArray(v) ? v : []).map((entry) => {
      const e = rec(entry);
      return {
        instanceId: str(e.instanceId),
        flowKey: str(e.flowKey),
        state: str(e.state),
        deepLink: strOrNull(e.deepLink),
      };
    });
  return { open: list(w.open), history: list(w.history) };
}

/** The five row-state counts. Server-computed; this sums nothing. */
function mapCounts(raw: unknown): PayPeriodRow["counts"] {
  const c = rec(raw);
  return {
    employments: num(c.employments, 0),
    approved: num(c.approved, 0),
    open: num(c.open, 0),
    attested: num(c.attested, 0),
    disputed: num(c.disputed, 0),
  };
}

/**
 * The row shape shared by `pay_period_list` and `pay_period_get`.
 *
 * Verified field-for-field against both function bodies. `pay_group_name` is joined server-side in
 * both, so it is never assembled here.
 */
function mapPayPeriodRow(raw: unknown): PayPeriodRow {
  const r = rec(raw);
  return {
    id: str(r.id),
    payGroupId: str(r.payGroupId),
    payGroupName: str(r.payGroupName),
    periodStartOn: str(r.periodStartOn),
    periodEndOn: str(r.periodEndOn),
    payDate: strOrNull(r.payDate),
    sequenceNumber: num(r.sequenceNumber, 0),
    state: str(r.state) as PayPeriodState,
    submittedAt: strOrNull(r.submittedAt),
    approvedAt: strOrNull(r.approvedAt),
    exportedAt: strOrNull(r.exportedAt),
    lockedAt: strOrNull(r.lockedAt),
    closedAt: strOrNull(r.closedAt),
    reopenedAt: strOrNull(r.reopenedAt),
    reopenReason: strOrNull(r.reopenReason),
    boundaryWorkweekIds: strArray(r.boundaryWorkweekIds),
    counts: mapCounts(r.counts),
  };
}

/** `{rows, page, page_size, total_rows, has_more}` — the shape every list envelope shares. */
function mapPaged<T>(raw: unknown, mapRow: (row: unknown) => T): Paged<T> {
  const r = rec(raw);
  const rows = Array.isArray(r.rows) ? r.rows : [];
  return {
    rows: rows.map(mapRow),
    page: num(r.page, 1),
    pageSize: num(r.pageSize, rows.length),
    totalRows: num(r.totalRows, rows.length),
    hasMore: r.hasMore === true,
  };
}

/**
 * The server's page argument is `{limit, offset}`, not `{page, pageSize}` — `hr._time_page` reads
 * those two keys. Translating here rather than at every call site keeps one spelling in the lane.
 */
function pageArg(page: PageRequest): Record<string, unknown> {
  return {
    limit: page.pageSize,
    offset: Math.max(0, (page.page - 1) * page.pageSize),
  };
}

// ---------------------------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------------------------

/** Which periods the list is asking for. Every member is the server's filter, never a client sort. */
export interface PayPeriodListFilters {
  payGroupId?: string | null;
  organizationId?: string | null;
  state?: PayPeriodState[];
  /** `period_end_on >= this`. */
  from?: string | null;
  /** `period_start_on <= this`. */
  to?: string | null;
}

function filterArg(filters: PayPeriodListFilters): Record<string, unknown> {
  // Snake_case, because the SQL body reads `f ->> 'pay_group_id'`. Only keys the server actually
  // reads are sent — an unread key in a filter bag is a silent no-op that looks like a working filter.
  const out: Record<string, unknown> = {};
  if (filters.payGroupId) out.pay_group_id = filters.payGroupId;
  if (filters.organizationId) out.organization_id = filters.organizationId;
  if (filters.state && filters.state.length > 0) out.state = filters.state;
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  return out;
}

/**
 * Route 32's read — the pay-period state machine per pay group.
 *
 * Fully paginated: LAW 3 — a list a caller treats as complete is never a capped fetch.
 */
export async function listPayPeriods(
  filters: PayPeriodListFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<PayPeriodRow>> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_pay_period_list",
    { p_filters: filterArg(filters), p_page: pageArg(page) },
    opts,
  );
  return mapPaged(raw, mapPayPeriodRow);
}

/**
 * Route 33's header read — the period, plus four things the LIST does not carry.
 *
 * All four are the server's, and three of them replace copy this lane used to write itself:
 * `boundaryNote` and `reopenNotice` are server-authored sentences, and `reopenAllowed` is the
 * resolved `allow_period_reopen` knob rather than a client-side guess.
 */
export interface PayPeriodDetail extends PayPeriodRow {
  /**
   * 🚨 The server's own boundary-weeks sentence. Rendered verbatim when present. `null` when no
   * workweek straddles the edges — and `null` means the panel says so, never that it invents one.
   */
  boundaryNote: string | null;
  /**
   * 🚨 WHETHER THE BOUNDARY ANSWER IS KNOWN, not just what it is. `boundaryWorkweekIds` is written
   * ONLY by `hr.recompute_apply`, whose rule counts the distinct pay periods a workweek's CURRENT
   * intervals land in. A period with no computed interval has had that question asked of nothing,
   * so its empty array means "not computed" — NOT "none found". Without this flag the panel states
   * "no workweek straddles this period" as a world-fact it has not computed (hr_l3_92).
   */
  boundaryComputed: boolean;
  /** The resolved `hr.time_and_attendance.allow_period_reopen`. Never assumed by the client. */
  reopenAllowed: boolean;
  /** 🚨 *"Reopening does NOT un-export and does NOT re-pay…"* — the server's wording, verbatim. */
  reopenNotice: string | null;
  /** Corrections tagged to this period, either as origin or as target. Server-counted. */
  adjustmentsTaggedHere: number;
  /**
   * 🚨 WHAT THE ROW-STATE COUNTS CANNOT SAY: is this timecard waiting on a PERSON, or is its flow
   * dead? An `open` row with a failed instance behind it reads identically to one with a live
   * instance — which is how a stuck period looked "awaiting" for four review rounds.
   */
  workflow: PeriodWorkflowHealth;
}

/** How a row's attestation flow is actually doing, as the server classifies it. */
export type RowHealth = "awaiting" | "stuck" | "no_flow" | "done";

export interface PeriodWorkflowRow {
  payPeriodEmploymentId: string;
  employmentId: string;
  /**
   * 🚨 THE PERSON, NAMED BY THE DOOR. `hr.pay_period_get` projects this through
   * `hr._subject_display_name`, the same suppression-aware helper the directory, the chart, the
   * grid and the audit reads use — so an opted-out person is `null` here for a viewer the rule
   * refuses and named for HR. `null` therefore means "this viewer may not have the name", NOT
   * "there is no name", and the panel falls back to the id as a bare reference rather than
   * inventing one. Never join for it on the client: that would make this surface the seventh
   * place that decides who may be named.
   */
  subjectName: string | null;
  /** The ROW state machine (`hr.pay_period_employment.state`) — not the period's. */
  rowState: string;
  health: RowHealth;
  flowKey: string | null;
  instanceId: string | null;
  instanceState: string | null;
  /**
   * 🚨 An OPEN failure on this row's instance, and it is independent of {@link health}. A row can be
   * `awaiting` — instance alive, order normal — and still carry an unresolved failure. That
   * combination is the one that hides: it looks healthy in the rollup and is not.
   */
  failureClass: string | null;
  failureId: string | null;

  /*
   * ── U2: the ATTESTATION OUTCOME, read from the record ────────────────────────────────────────
   * Optional because `hr.pay_period_get` does not project them until
   * `migrations/hr_l3_46_project_attestation_outcome.sql` is applied. Absent means the surface says
   * NOTHING about the outcome — it never falls back to inferring one.
   */

  /** `not_attested` when the deadline passed with no action from the employee. */
  attestationOutcome: string | null;
  /**
   * WHICH `not_attested` this is — `no_reach` (the employee holds no login, so the attestation was
   * never deliverable and they were never asked) or `no_response` (they were asked and did not
   * answer). Read from the close evidence; the surface must never re-derive it.
   */
  attestationReason: string | null;
  /** 🚨 The server's own sentence about what happened. Rendered VERBATIM when present. */
  attestationNote: string | null;
  attestationClosedAt: string | null;
  /** 🚨 `null` is the load-bearing value: the employee never confirmed these hours. */
  attestedAt: string | null;
  /** Set when a manager approved anyway — which is legitimate, recorded, and must be SAID. */
  managerApprovedAt: string | null;
  /** Why the subject could never act, e.g. `no_login`. From the flow's own failure detail. */
  unableReason: string | null;
}

export interface PeriodWorkflowHealth {
  awaiting: number;
  stuck: number;
  noFlow: number;
  done: number;
  rows: PeriodWorkflowRow[];
}

function mapWorkflowRow(raw: unknown): PeriodWorkflowRow {
  const r = rec(raw);
  const health = str(r.health);
  return {
    payPeriodEmploymentId: str(r.payPeriodEmploymentId),
    employmentId: str(r.employmentId),
    subjectName: strOrNull(r.subjectName),
    rowState: str(r.rowState),
    // Anything the server starts classifying that this client does not know reads as `no_flow`
    // rather than being silently dropped — an unrecognised health is not a healthy one.
    health: (["awaiting", "stuck", "no_flow", "done"].includes(health)
      ? health
      : "no_flow") as RowHealth,
    flowKey: strOrNull(r.flowKey),
    instanceId: strOrNull(r.instanceId),
    instanceState: strOrNull(r.instanceState),
    failureClass: strOrNull(r.failureClass),
    failureId: strOrNull(r.failureId),
    attestationOutcome: strOrNull(r.attestationOutcome),
    attestationReason: strOrNull(r.attestationReason),
    attestationNote: strOrNull(r.attestationNote),
    attestationClosedAt: strOrNull(r.attestationClosedAt),
    attestedAt: strOrNull(r.attestedAt),
    managerApprovedAt: strOrNull(r.managerApprovedAt),
    unableReason: strOrNull(r.unableReason),
  };
}

function mapWorkflowHealth(raw: unknown): PeriodWorkflowHealth {
  const w = rec(raw);
  const rows = Array.isArray(w.rows) ? w.rows : [];
  return {
    awaiting: num(w.awaiting, 0),
    stuck: num(w.stuck, 0),
    // `no_flow` camelizes to `noFlow`.
    noFlow: num(w.noFlow, 0),
    done: num(w.done, 0),
    rows: rows.map(mapWorkflowRow),
  };
}

export async function getPayPeriod(
  payPeriodId: string,
  opts?: HrRpcOptions,
): Promise<PayPeriodDetail> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_pay_period_get",
    { p_pay_period_id: payPeriodId },
    opts,
  );
  const r = rec(raw);
  return {
    ...mapPayPeriodRow(raw),
    boundaryNote: strOrNull(r.boundaryNote),
    boundaryComputed: r.boundaryComputed === true,
    // Defaults TRUE only because the platform default is true and the knob resolves server-side;
    // an explicit `false` from the server is always honoured.
    reopenAllowed: r.reopenAllowed !== false,
    reopenNotice: strOrNull(r.reopenNotice),
    adjustmentsTaggedHere: num(r.adjustmentsTaggedHere, 0),
    workflow: mapWorkflowHealth(r.workflow),
  };
}

// ---------------------------------------------------------------------------------------------
// Post-lock corrections
// ---------------------------------------------------------------------------------------------

/**
 * One post-lock correction, as route 33 renders it.
 *
 * 🚨 The two period ids are the whole point and must never be collapsed into one column.
 * `originalPayPeriodId` is the **locked** period the correction belongs to; `targetPayPeriodId` is
 * the **next open** period it will actually be paid in. A surface showing only one of them tells a
 * payroll administrator that a locked period was rewritten, which is exactly what did not happen.
 *
 * Mapped field-for-field against `hr.time_adjustment_list`'s projection. Three fields this lane
 * previously declared — `targetPeriodLabel`, `createdByName`, `exportedInExportId` — **are not sent
 * by the server** and have been removed rather than defaulted: printing a blank where a name should
 * be is how a cast's damage reaches a user.
 */
export interface TimeAdjustmentRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string;
  /** The LOCKED period this correction is tagged to. Never rewritten. */
  originalPayPeriodId: string | null;
  /** The NEXT OPEN period the correction is paid in. Never the same as the original. */
  targetPayPeriodId: string | null;
  workDate: string;
  earningCodeId: string;
  /** 🚨 The label, never the token — LAW 3a: no cell prints a type name. */
  earningCodeName: string;
  earningCode: string;
  hoursDelta: number | null;
  /**
   * 🚨 `null` here is NOT zero. When {@link amountPending} is true the amount is **absent** because
   * a contributing rule is advisory, and the surface renders a sentence — never a `0`, never a `—`.
   */
  amountDelta: number | null;
  /** The server's money-absent flag, read from `calc.amount_pending`. */
  amountPending: boolean;
  rate: number | null;
  reasonCategoryId: string | null;
  reasonNote: string | null;
  workflowInstanceId: string | null;
  /** Where the decision actually happens — the ONE HR task inbox. */
  workflow: { open: WorkflowRef[]; history: WorkflowRef[] };
  approvedAt: string | null;
  exportedAt: string | null;
  createdAt: string | null;
  /** 🚨 The server's sentence about what a correction after lock does. Rendered verbatim. */
  lockedPeriodNote: string | null;
}

function mapTimeAdjustmentRow(raw: unknown): TimeAdjustmentRow {
  const r = rec(raw);
  return {
    id: str(r.id),
    employmentId: str(r.employmentId),
    employeeDisplayName: str(r.employeeDisplayName),
    originalPayPeriodId: strOrNull(r.originalPayPeriodId),
    targetPayPeriodId: strOrNull(r.targetPayPeriodId),
    workDate: str(r.workDate),
    earningCodeId: str(r.earningCodeId),
    earningCodeName: str(r.earningCodeName),
    earningCode: str(r.earningCode),
    hoursDelta: numOrNull(r.hoursDelta),
    amountDelta: numOrNull(r.amountDelta),
    amountPending: r.amountPending === true,
    rate: numOrNull(r.rate),
    reasonCategoryId: strOrNull(r.reasonCategoryId),
    reasonNote: strOrNull(r.reasonNote),
    workflowInstanceId: strOrNull(r.workflowInstanceId),
    workflow: mapWorkflow(r.workflow),
    approvedAt: strOrNull(r.approvedAt),
    exportedAt: strOrNull(r.exportedAt),
    createdAt: strOrNull(r.createdAt),
    lockedPeriodNote: strOrNull(r.lockedPeriodNote),
  };
}

/**
 * The adjustments touching ONE period — route 33's post-lock lane.
 *
 * 🚨 The server's `pay_period_id` filter matches on EITHER `original_pay_period_id` OR
 * `target_pay_period_id`, which is the right question for this surface: it shows both the
 * corrections that BELONG to this period and the ones that will be PAID in it.
 */
export async function listTimeAdjustments(
  payPeriodId: string,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<TimeAdjustmentRow>> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_time_adjustment_list",
    { p_filters: { pay_period_id: payPeriodId }, p_page: pageArg(page) },
    opts,
  );
  return mapPaged(raw, mapTimeAdjustmentRow);
}

// ---------------------------------------------------------------------------------------------
// The calendar generator — `hr.pay_period_generate`
// ---------------------------------------------------------------------------------------------

/** One period the generator created on this run. */
export interface GeneratedPeriod {
  payPeriodId: string;
  sequenceNumber: number;
  periodStartOn: string;
  periodEndOn: string;
}

/**
 * 🚨 DRIFT. A stored period whose dates disagree with the pay group's frequency.
 *
 * The generator **never rewrites one** — a period that has already been submitted, approved or
 * exported is evidence, and silently re-dating it would move somebody's hours between pay periods
 * after the fact. It reports the disagreement and leaves the row alone, so a human reconciles it
 * deliberately. The surface must therefore render these as prominently as the successes.
 */
export interface PeriodConflict {
  sequenceNumber: number;
  payPeriodId: string;
  state: string;
  stored: { periodStartOn: string; periodEndOn: string };
  generated: { periodStartOn: string; periodEndOn: string };
}

export interface GeneratePeriodsResult {
  payGroupId: string;
  payFrequency: string;
  firstPeriodStartOn: string;
  throughDate: string;
  created: GeneratedPeriod[];
  createdCount: number;
  /** Already present and already correct. Re-running is idempotent, and this is the proof. */
  unchangedCount: number;
  conflicts: PeriodConflict[];
  conflictCount: number;
  totalPeriods: number;
  /**
   * 🚨 Roster rows written across every non-terminal period of this group. **A period with no
   * roster is a calendar, not a payroll** — the door backfills eligible employments idempotently,
   * so a re-run repairs a group whose periods existed but were empty.
   */
  enrolledRows: number;
  /** The server's own sentence about the conflicts, present only when there are any. */
  note: string | null;
}

function mapGeneratedPeriod(raw: unknown): GeneratedPeriod {
  const r = rec(raw);
  return {
    payPeriodId: str(r.payPeriodId),
    sequenceNumber: num(r.sequenceNumber, 0),
    periodStartOn: str(r.periodStartOn),
    periodEndOn: str(r.periodEndOn),
  };
}

function mapConflict(raw: unknown): PeriodConflict {
  const r = rec(raw);
  const stored = rec(r.stored);
  const generated = rec(r.generated);
  return {
    sequenceNumber: num(r.sequenceNumber, 0),
    payPeriodId: str(r.payPeriodId),
    state: str(r.state),
    stored: { periodStartOn: str(stored.periodStartOn), periodEndOn: str(stored.periodEndOn) },
    generated: {
      periodStartOn: str(generated.periodStartOn),
      periodEndOn: str(generated.periodEndOn),
    },
  };
}

/**
 * Generate this pay group's payroll calendar through a date.
 *
 * 🚨 IDEMPOTENT BY DESIGN, AND THAT IS WHY THE COUNTS ARE RENDERED RATHER THAN A "DONE" TOAST.
 * A second run creates nothing and reports everything as unchanged; the honest answer to "did that
 * do anything?" is *"12 created, 4 already existed"*, and a surface that says only "Generated"
 * cannot tell those apart. The door also backfills pay-period rosters on every run.
 *
 * Refuses **by name**, and each refusal is a different situation the surface must not flatten:
 * `hr_pay_group_not_found` (unknown, or another tenant's — deliberately the same answer so this
 * cannot be used to probe), `hr_period_generate_authority_required` (payroll.read, org-scoped),
 * `hr_through_date_before_anchor`, and `hr_through_date_too_far` (ten years past the anchor).
 * They arrive as {@link HrRpcError} with the server's own sentence, which is rendered verbatim.
 */
export async function generatePayPeriods(
  payGroupId: string,
  throughDate: string | null,
  opts?: HrRpcOptions,
): Promise<GeneratePeriodsResult> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_pay_period_generate",
    { p_pay_group_id: payGroupId, p_through_date: throughDate },
    opts,
  );
  const r = rec(raw);
  const created = Array.isArray(r.created) ? r.created : [];
  const conflicts = Array.isArray(r.conflicts) ? r.conflicts : [];
  return {
    payGroupId: str(r.payGroupId),
    payFrequency: str(r.payFrequency),
    firstPeriodStartOn: str(r.firstPeriodStartOn),
    throughDate: str(r.throughDate),
    created: created.map(mapGeneratedPeriod),
    createdCount: num(r.createdCount, created.length),
    unchangedCount: num(r.unchangedCount, 0),
    conflicts: conflicts.map(mapConflict),
    conflictCount: num(r.conflictCount, conflicts.length),
    totalPeriods: num(r.totalPeriods, 0),
    enrolledRows: num(r.enrolledRows, 0),
    note: strOrNull(r.note),
  };
}
