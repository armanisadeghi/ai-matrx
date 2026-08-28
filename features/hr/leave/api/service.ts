/**
 * features/hr/leave/api/service.ts — the typed service surface for Leave & PTO.
 *
 * 🚨 **MAPPED, NEVER CAST.** `callHrLeaveRpc` hands back `Record<string, unknown>`. Every
 * function here runs a FIELD-BY-FIELD mapper against the live envelope (read 2026-08-27 from
 * `pg_get_functiondef`). A `data as MyTimeOff` cast compiles against a hopeful type and
 * proves nothing about the payload: wherever the shape differs the field arrives `undefined`
 * and the surface renders a blank, a NaN, or a confident zero — at runtime, only once real
 * data exists.
 *
 * 🚨 **NO CLIENT COMPUTES A BALANCE, AN HOUR, OR A SENTENCE.** Nothing here sums a ledger,
 * subtracts pending from available, decides whether a day is excluded, or composes policy
 * prose. Those arrive computed and snapshot-backed from `hr.leave_figures`,
 * `hr.leave_span_hours` and `hr._leave_sentence`. The only arithmetic in this feature is the
 * one the server already did and returned.
 *
 * 🚨 **`null` IS NOT `0`.** `num()` returns `null` for anything that is not a finite number.
 * An unlimited policy carries none of the five figures, and a `?? 0` there would print a
 * zero balance on a policy that has no balance.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { HrResult } from "@/features/hr/types";

/** The time lane's own options type, imported from source — never re-exported through `rpc.ts`. */
import type { HrRpcOptions } from "@/features/hr/time/api/rpc";

import { callHrLeaveRpc } from "./rpc";
import type {
  LeaveBlackoutRule,
  LeaveCancelResult,
  LeaveConflictCheck,
  LeaveConflictFinding,
  LeaveDayPart,
  LeaveFigures,
  LeaveLedgerEntry,
  LeaveLedgerSource,
  LeaveLedgerView,
  LeaveProjection,
  LeaveReasonCategory,
  LeaveRequestPreview,
  LeaveRequestState,
  LeaveRequestSubmitResult,
  LeaveSpan,
  LeaveSpanDay,
  LeaveViewerRung,
  MyLeavePolicy,
  MyLeaveRequest,
  MyTimeOff,
} from "./types";

// ── primitive readers ────────────────────────────────────────────────────────

function bag(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strList(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === "string");
}

/**
 * A number, or `null`. **Never a `0` fallback** — `null` means the server did not send this
 * figure and the surface must render it dark.
 *
 * jsonb numerics arrive as JSON numbers over PostgREST, but a `numeric` big enough to lose
 * precision can arrive as a string, so a numeric string is accepted and anything else is not.
 */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

const REQUEST_STATES: ReadonlySet<string> = new Set([
  "draft",
  "submitted",
  "approved",
  "denied",
  "cancelled",
  "taken",
  "partially_taken",
]);

function requestState(value: unknown): LeaveRequestState | null {
  return typeof value === "string" && REQUEST_STATES.has(value)
    ? (value as LeaveRequestState)
    : null;
}

function viewerRung(value: unknown): LeaveViewerRung | null {
  return value === "self" || value === "delegated" ? value : null;
}

// ── hr.leave_figures ─────────────────────────────────────────────────────────

/**
 * The §5 block. Mapped key by key against the live `hr.leave_figures` body.
 *
 * 🚨 THE TWO SHAPES. On `accrual_method = 'unlimited'` the function returns SEVEN keys and
 * stops — no five figures, no `ledger_balance`, no `identity_holds`. Everything below
 * therefore resolves to `null` on an unlimited policy, which is exactly right: the block
 * renders the word and no numbers.
 */
function toFigures(raw: unknown): LeaveFigures {
  const r = bag(raw);
  return {
    ok: bool(r.ok),
    refused: str(r.refused),
    unlimited: bool(r.unlimited),
    asOf: str(r.asOf),
    policyId: str(r.policyId),
    policyName: str(r.policyName),
    leaveKind: str(r.leaveKind),

    accruedToDate: num(r.accruedToDate),
    usedTaken: num(r.usedTaken),
    approvedUpcoming: num(r.approvedUpcoming),
    pendingApproval: num(r.pendingApproval),
    available: num(r.available),

    ledgerBalance: num(r.ledgerBalance),
    removed: num(r.removed),
    identityHolds: bool(r.identityHolds),

    accrualMethod: str(r.accrualMethod),
    accrualRate: num(r.accrualRate),
    accrualPerUnits: num(r.accrualPerUnits),
    incrementMinutes: num(r.incrementMinutes),
    balanceCap: num(r.balanceCap),
    carryoverAllowed: bool(r.carryoverAllowed),
    negativeBalanceAllowed: bool(r.negativeBalanceAllowed),
    negativeBalanceFloor: num(r.negativeBalanceFloor),
    statutoryBasisRuleClass: str(r.statutoryBasisRuleClass),
    usableOn: str(r.usableOn),
  };
}

function toBlackoutRule(raw: unknown): LeaveBlackoutRule {
  const r = bag(raw);
  return {
    key: str(r.key),
    label: str(r.label),
    from: str(r.from),
    to: str(r.to),
    mode: str(r.mode),
    note: str(r.note),
    exemptLeaveKinds: strList(r.exemptLeaveKinds),
  };
}

function toPolicy(raw: unknown): MyLeavePolicy {
  const r = bag(raw);
  return {
    ...toFigures(r),
    enrollmentId: str(r.enrollmentId),
    employmentId: str(r.employmentId),
    sentence: str(r.sentence),
    policyYearStartOn: str(r.policyYearStartOn),
    reinstatedHours: num(r.reinstatedHours),
    reinstatedFromEmploymentId: str(r.reinstatedFromEmploymentId),
    blackoutRules: list(r.blackoutRules).map(toBlackoutRule),
    mandatedUses: strList(r.mandatedUses),
    documentationRequiredAfterDays: num(r.documentationRequiredAfterDays),
    ledgerHref: str(r.ledgerHref),
  };
}

// ── conflict_check ───────────────────────────────────────────────────────────

function toFinding(raw: unknown): LeaveConflictFinding {
  const r = bag(raw);
  return { code: str(r.code), message: str(r.message), detail: bag(r.detail) };
}

/**
 * §4.2's frozen result, or `null`.
 *
 * 🚨 `hr.leave_request_submit` INSERTS `conflict_check` AS `'{}'` and re-reads the row after
 * `hr.wf_submit`, so an empty object is a real and common answer — the validator has not
 * written its findings. `{}` maps to a check with two empty arrays, never to a fabricated
 * "no problems found" claim: the surface says only what the arrays actually contain.
 */
function toConflictCheck(raw: unknown): LeaveConflictCheck | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    evaluatedAt: str(r.evaluatedAt),
    dayHoursBasis: str(r.dayHoursBasis),
    balanceNow: num(r.balanceNow),
    projectedBalanceAtStart: num(r.projectedBalanceAtStart),
    hard: list(r.hard).map(toFinding),
    advisory: list(r.advisory).map(toFinding),
  };
}

function toDayPart(raw: unknown): LeaveDayPart | null {
  const r = bag(raw);
  const date = str(r.date);
  const hours = num(r.hours);
  if (date === null || hours === null) return null;
  return { date, hours };
}

function toRequest(raw: unknown): MyLeaveRequest | null {
  const r = bag(raw);
  const id = str(r.id);
  if (id === null) return null;
  return {
    id,
    leavePolicyId: str(r.leavePolicyId),
    policyName: str(r.policyName),
    leaveKind: str(r.leaveKind),
    startsOn: str(r.startsOn),
    endsOn: str(r.endsOn),
    requestedHours: num(r.requestedHours),
    approvedHours: num(r.approvedHours),
    state: requestState(r.state),
    decidedAt: str(r.decidedAt),
    denialReason: str(r.denialReason),
    isPartialDay: bool(r.isPartialDay),
    dayParts: list(r.dayParts)
      .map(toDayPart)
      .filter((p): p is LeaveDayPart => p !== null),
    leaveCaseLinked: r.leaveCaseLinked === true,
    workflowInstanceId: str(r.workflowInstanceId),
    conflictCheck: toConflictCheck(r.conflictCheck),
  };
}

// ── span ─────────────────────────────────────────────────────────────────────

/**
 * One day of the span.
 *
 * 🚨 `excluded` IS THE SERVER'S WORD, NOT `hours === 0`. `hr.leave_day_hours` omits
 * `excluded` entirely on its `unknown_employment` branch and on every working day, so this
 * maps `boolean | null` and the table asks the server, never the arithmetic.
 */
function toSpanDay(raw: unknown): LeaveSpanDay {
  const r = bag(raw);
  return {
    date: str(r.date),
    hours: num(r.hours),
    basis: str(r.basis),
    excluded: bool(r.excluded),
    label: str(r.label),
    partial: bool(r.partial),
  };
}

function toSpan(raw: unknown): LeaveSpan {
  const r = bag(raw);
  return {
    totalHours: num(r.totalHours),
    days: list(r.days).map(toSpanDay),
    calendarDays: num(r.calendarDays),
    workingDays: num(r.workingDays),
    excludedDays: num(r.excludedDays),
  };
}

function toProjection(raw: unknown): LeaveProjection | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    ...toFigures(r),
    projected: bool(r.projected),
    projectionBasis: str(r.projectionBasis),
    projectsFutureAccrual: bool(r.projectsFutureAccrual),
    projectedAccrual: num(r.projectedAccrual),
    projectedBalance: num(r.projectedBalance),
    projectedAvailable: num(r.projectedAvailable),
    projectionNote: str(r.projectionNote),
    horizonDays: num(r.horizonDays),
    detail: str(r.detail),
  };
}

// ── ledger ───────────────────────────────────────────────────────────────────

function toLedgerSource(raw: unknown): LeaveLedgerSource | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kind = str(r.kind);
  const id = str(r.id);
  if (kind === null && id === null) return null;
  return { kind, id };
}

function toLedgerEntry(raw: unknown): LeaveLedgerEntry | null {
  const r = bag(raw);
  const id = str(r.id);
  if (id === null) return null;
  return {
    id,
    occurredOn: str(r.occurredOn),
    entryKind: str(r.entryKind),
    sentence: str(r.sentence),
    hoursDelta: num(r.hoursDelta),
    balanceAfter: num(r.balanceAfter),
    runningSum: num(r.runningSum),
    source: toLedgerSource(r.source),
    reversesEntryId: str(r.reversesEntryId),
    snapshotId: str(r.snapshotId),
    unexplained: r.unexplained === true,
    engineKey: str(r.engineKey),
    engineVersion: str(r.engineVersion),
    calc: r.calc ?? null,
    actorType: str(r.actorType),
    actorName: str(r.actorName),
  };
}

// ── the calls ────────────────────────────────────────────────────────────────

/**
 * `hr_my_time_off(p_employment_id)` → the whole self-service surface in one read.
 *
 * Pass the employment the `/hr/me/*` shell resolved AS OF today. The function will resolve
 * one itself when given `null`, but the shell's answer is the as-of-correct one and two
 * resolutions disagreeing is the defect `MeSurfaceShell` exists to prevent.
 */
export async function fetchMyTimeOff(
  args: { employmentId?: string | null },
  opts?: HrRpcOptions,
): Promise<HrResult<MyTimeOff>> {
  const res = await callHrLeaveRpc(
    "hr_my_time_off",
    { p_employment_id: args.employmentId ?? undefined },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      employmentId: str(r.employmentId),
      viewerRung: viewerRung(r.viewerRung),
      asOf: str(r.asOf),
      policies: list(r.policies).map(toPolicy),
      requests: list(r.requests)
        .map(toRequest)
        .filter((q): q is MyLeaveRequest => q !== null),
      canRequest: r.canRequest === true,
    },
  };
}

/** `hr_leave_request_preview(...)` — the live cost of a span, before anything is filed. */
export async function previewLeaveRequest(
  args: {
    employmentId: string;
    leavePolicyId: string;
    startsOn: string;
    endsOn: string;
    dayParts?: LeaveDayPart[];
  },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveRequestPreview>> {
  const res = await callHrLeaveRpc(
    "hr_leave_request_preview",
    {
      p_employment_id: args.employmentId,
      p_leave_policy_id: args.leavePolicyId,
      p_starts_on: args.startsOn,
      p_ends_on: args.endsOn,
      p_day_parts: args.dayParts ?? [],
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      span: toSpan(r.span),
      breakdownSentence: str(r.breakdownSentence),
      figures: toFigures(r.figures),
      projection: toProjection(r.projection),
      policyName: str(r.policyName),
      incrementMinutes: num(r.incrementMinutes),
      mandatedUses: strList(r.mandatedUses),
      documentationRequired: bool(r.documentationRequired),
      documentationRequiredAfterDays: num(r.documentationRequiredAfterDays),
    },
  };
}

/**
 * `hr_leave_request_submit(...)` — files the request and opens the workflow instance.
 *
 * 🚨 THE WORKFLOW ENGINE OWNS THE APPROVAL. This door declares a flow type; it never builds
 * a queue. The approver's step is projected into `/hr/tasks`, which is THE inbox.
 */
export async function submitLeaveRequest(
  args: {
    employmentId: string;
    leavePolicyId: string;
    startsOn: string;
    endsOn: string;
    dayParts?: LeaveDayPart[];
    reasonCategoryId?: string | null;
    reasonNote?: string | null;
    leaveCaseId?: string | null;
    /** Same key on a retry = one request, not two. */
    idempotencyKey?: string | null;
  },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveRequestSubmitResult>> {
  const res = await callHrLeaveRpc(
    "hr_leave_request_submit",
    {
      p_employment_id: args.employmentId,
      p_leave_policy_id: args.leavePolicyId,
      p_starts_on: args.startsOn,
      p_ends_on: args.endsOn,
      p_day_parts: args.dayParts ?? [],
      p_reason_category_id: args.reasonCategoryId ?? undefined,
      p_reason_note: args.reasonNote ?? undefined,
      p_leave_case_id: args.leaveCaseId ?? undefined,
      p_idempotency_key: args.idempotencyKey ?? undefined,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      leaveRequestId: str(r.leaveRequestId),
      workflowInstanceId: str(r.workflowInstanceId),
      state: requestState(r.state),
      requestedHours: num(r.requestedHours),
      conflictCheck: toConflictCheck(r.conflictCheck),
      rejectedAtIntake: r.rejectedAtIntake === true,
    },
  };
}

/**
 * `hr_leave_request_cancel(...)`.
 *
 * A `submitted` request is WITHDRAWN — no ledger entry ever existed. An `approved` one opens
 * a cancellation workflow instead, because the hours are already encumbered. A `taken`
 * request refuses with `already_taken`: the correction is a balance adjustment, not a
 * cancellation, and the server says so in a sentence the surface renders verbatim.
 */
export async function cancelLeaveRequest(
  args: { requestId: string; reason?: string | null; hours?: number | null },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveCancelResult>> {
  const res = await callHrLeaveRpc(
    "hr_leave_request_cancel",
    {
      p_request_id: args.requestId,
      p_reason: args.reason ?? undefined,
      p_hours: args.hours ?? undefined,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: { outcome: str(r.outcome), workflowInstanceId: str(r.workflowInstanceId) },
  };
}

/**
 * `hr_leave_ledger_view(...)` — §12, every entry traceable to its rule snapshot.
 *
 * The same door serves the employee (`viewer=self`) and the manager/HR view. `amount` and
 * `rate` are excluded in the SQL by construction and never arrive here.
 */
export async function fetchLeaveLedger(
  args: { employmentId: string; leavePolicyId: string; asOf?: string | null },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveLedgerView>> {
  const res = await callHrLeaveRpc(
    "hr_leave_ledger_view",
    {
      p_employment_id: args.employmentId,
      p_leave_policy_id: args.leavePolicyId,
      p_as_of: args.asOf ?? undefined,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      viewerRung: viewerRung(r.viewerRung),
      employmentId: str(r.employmentId),
      leavePolicyId: str(r.leavePolicyId),
      asOf: str(r.asOf),
      entries: list(r.entries)
        .map(toLedgerEntry)
        .filter((e): e is LeaveLedgerEntry => e !== null),
      figures: toFigures(r.figures),
      sentence: str(r.sentence),
      runningBalanceOk: bool(r.runningBalanceOk),
      divergenceAtEntryId: str(r.divergenceAtEntryId),
      unexplainedEntryCount: num(r.unexplainedEntryCount),
      entryCount: num(r.entryCount),
    },
  };
}

// ── reason categories ────────────────────────────────────────────────────────

/** The dimension `hr.leave_request.reason_category_id` points into (`platform.categories`). */
export const LEAVE_REASON_DIMENSION = "hr_leave_request_reason";

/**
 * The §4.1 reason select's options.
 *
 * 🚨 THIS IS THE ONE READ IN THIS FEATURE THAT IS NOT AN RPC, AND IT IS LEGITIMATE.
 * `hr.leave_request.reason_category_id` is a foreign key to `platform.categories` — a
 * `platform` table, and `platform` IS exposed to PostgREST (unlike `hr`). The rows are
 * system rows in the globally-readable system org, so RLS grants every authenticated caller
 * a read. No `hr_*` door lists them, and inventing one is the SQL lane's call, not this one's.
 *
 * `readAllRows` because the select treats this list as COMPLETE — a bare `.select()` caps at
 * 1000 rows silently, and a reason quietly missing from the menu is a request nobody can file.
 *
 * `mandated` is resolved against the POLICY's `mandated_uses` by the caller, not here: the
 * same category is mandated on a sick policy and ordinary on a vacation one.
 */
export async function fetchLeaveReasonCategories(): Promise<LeaveReasonCategory[]> {
  const rows = await readAllRows<{
    id: string;
    slug: string | null;
    name: string | null;
    position: number | null;
  }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("categories")
        .select("id, slug, name, position", { count: "exact" })
        .eq("dimension", LEAVE_REASON_DIMENSION)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .range(from, to),
    { label: "hr-leave-reason-categories" },
  );

  return rows
    .filter((r) => typeof r.slug === "string" && typeof r.name === "string")
    .map((r) => ({
      id: r.id,
      slug: r.slug as string,
      name: r.name as string,
      position: r.position,
      mandated: false,
    }));
}
