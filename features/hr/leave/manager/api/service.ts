/**
 * features/hr/leave/manager/api/service.ts — the typed service surface for the leave DESK.
 *
 * "Desk" is the HR/manager half of Leave & PTO: the policy editor, the enrollment roster, the
 * org/team balance list, the who's-out calendar and the balance adjustment. The employee half
 * (`hr_my_time_off`, `hr_leave_request_*`, `hr_leave_ledger_view`) lives in
 * `features/hr/leave/api/service.ts` and is IMPORTED by these surfaces, never re-implemented.
 *
 * 🚨 **THERE IS ONE TRANSPORT, AND IT IS `../../api/rpc`.** This module opened life with its
 * own copy of `callHrLeaveRpc` because that module's name union was closed to five names; the
 * union now carries all twelve and is generically typed against
 * `Database["public"]["Functions"]`, so the copy was deleted rather than left as a second door.
 * Two modules reaching the same RPCs two ways is the bug this feature's own headers name.
 *
 * 🚨 **MAPPED, NEVER CAST.** `callHrLeaveRpc` hands back `Record<string, unknown>`. Every
 * function here runs a FIELD-BY-FIELD mapper against the live envelope (read 2026-08-27 from
 * `pg_get_functiondef`). A `data as LeavePolicyList` cast compiles against a hopeful type and
 * proves nothing: wherever the shape differs the field arrives `undefined` and the surface
 * renders a blank, a NaN, or a confident zero — at runtime, only once real data exists.
 *
 * 🚨 **`null` IS NOT `0`, AND IT IS NOT `false`.** `num()` returns `null` for anything that is
 * not a finite number and `bool()` returns `null` for anything that is not a boolean. A
 * violation with no `affected_employees` must not print "affects 0 employees"; an unlimited
 * policy's absent `balance_cap` must not render as a cap of zero.
 *
 * 🚨 **NO CLIENT COMPUTES A BALANCE OR A SENTENCE.** Every figure and every sentence on the
 * balance list arrives from `hr.leave_figures` / `hr._leave_sentence`. Nothing here sums a
 * ledger or composes policy prose.
 */

"use client";

import type { HrRpcOptions } from "@/features/hr/time/api/rpc";
import type { HrDenied, HrResult } from "@/features/hr/types";
import type { LeaveFigures } from "../../api/types";

import { callHrLeaveRpc } from "../../api/rpc";
/* ONE mapper for `hr.leave_figures`, exported by the lane that owns the door. See the note above. */
import { toFigures } from "../../api/service";
import type {
  LeaveAdjustRefusal,
  LeaveAdjustResult,
  LeaveBalanceList,
  LeaveBalanceRow,
  LeaveCalendar,
  LeaveCalendarEntry,
  LeaveConfigViolation,
  LeaveEnrollResult,
  LeaveEnrollSkip,
  LeaveJurisdiction,
  LeavePolicy,
  LeavePolicyBlackout,
  LeavePolicyList,
  LeavePolicySaved,
  LeavePolicyValidation,
  LeaveRuleCitation,
  LeaveSaveRefusal,
  LeaveViolationFix,
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

/** A number, or `null`. **Never a `0` fallback.** Numeric strings are accepted (jsonb numeric). */
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

// ── figures (the §5 block, as `hr.leave_figures` builds it) ──────────────────

/*
  ♻️ THE DUPLICATE MAPPER THAT USED TO LIVE HERE IS DELETED, AND ITS OWN COMMENT SAID TO DO THIS.

  It was a key-for-key copy of `features/hr/leave/api/service.ts` → `toFigures`, kept only because
  that one was module-private, and it carried the standing note *"when that lane exports its mapper,
  delete this one and import it."* Round 42 collected the bill: `hr.leave_figures` gained
  `bookable_now` / `pending_beyond_balance` — the pair that stops "What you can book right now" from
  rendering a negative number — and this copy would have silently kept withholding them, so the
  MANAGER's team view and `/hr/leave/balances` would have shown "Not provided" under the very tile
  the employee's page shows a number in. Two implementations of one mapping disagree on the first
  change to the thing they map; that is the whole law.
*/

// ── policy list ──────────────────────────────────────────────────────────────

function toBlackout(raw: unknown): LeavePolicyBlackout {
  const r = bag(raw);
  return {
    key: str(r.key),
    label: str(r.label),
    from: str(r.from),
    to: str(r.to),
    recurringAnnual: bool(r.recurringAnnual),
    mode: str(r.mode),
    note: str(r.note),
    maxConcurrentOut: num(r.maxConcurrentOut),
    exemptLeaveKinds: strList(r.exemptLeaveKinds),
  };
}

function toJurisdiction(raw: unknown): LeaveJurisdiction {
  const r = bag(raw);
  return { key: str(r.key), name: str(r.name) };
}

function toPolicy(raw: unknown): LeavePolicy | null {
  const r = bag(raw);
  const id = str(r.id);
  if (id === null) return null;
  return {
    id,
    name: str(r.name),
    leaveKind: str(r.leaveKind),
    accrualMethod: str(r.accrualMethod),
    accrualRate: num(r.accrualRate),
    accrualPerUnits: num(r.accrualPerUnits),
    accrualUnit: str(r.accrualUnit),
    accrualStarts: str(r.accrualStarts),
    isActive: bool(r.isActive),
    version: num(r.version),
    statutoryBasisRuleClass: str(r.statutoryBasisRuleClass),
    balanceCap: num(r.balanceCap),
    annualAccrualCap: num(r.annualAccrualCap),
    carryoverAllowed: bool(r.carryoverAllowed),
    carryoverCap: num(r.carryoverCap),
    carryoverExpiresAfterDays: num(r.carryoverExpiresAfterDays),
    negativeBalanceAllowed: bool(r.negativeBalanceAllowed),
    negativeBalanceFloor: num(r.negativeBalanceFloor),
    payoutOnTermination: str(r.payoutOnTermination),
    usableAfterDays: num(r.usableAfterDays),
    waitingPeriodDays: num(r.waitingPeriodDays),
    incrementMinutes: num(r.incrementMinutes),
    documentationRequiredAfterDays: num(r.documentationRequiredAfterDays),
    reinstateOnRehireWithinDays: num(r.reinstateOnRehireWithinDays),
    earningCodeId: str(r.earningCodeId),
    blackoutRules: list(r.blackoutRules).map(toBlackout),
    mandatedUses: strList(r.mandatedUses),
    workerClassScope: strList(r.workerClassScope),
    scheduleClassScope: strList(r.scheduleClassScope),
    enrolledCount: num(r.enrolledCount),
  };
}

/** `hr_leave_policy_list(p_organization_id)` — route 74's whole read. */
export async function fetchLeavePolicies(
  organizationId: string,
  opts?: HrRpcOptions,
): Promise<HrResult<LeavePolicyList>> {
  const res = await callHrLeaveRpc(
    "hr_leave_policy_list",
    { p_organization_id: organizationId },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      rung: str(r.rung),
      canWrite: r.canWrite === true,
      operatingJurisdictions: list(r.operatingJurisdictions).map(toJurisdiction),
      policies: list(r.policies)
        .map(toPolicy)
        .filter((p): p is LeavePolicy => p !== null),
    },
  };
}

// ── validation ───────────────────────────────────────────────────────────────

/**
 * The citation from `hr.jurisdiction_rule.citation`.
 *
 * Only the four SINGLE-WORD fields are declared, which is deliberate: the shared transport
 * camelizes response keys, and `verified_at` / `verified_by` / `retrieved_at` would therefore
 * arrive under a spelling that is not the one they are stored under. Reading only the
 * spelling-independent fields is how this mapping cannot silently drift.
 */
function toCitation(raw: unknown): LeaveRuleCitation | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const citation: LeaveRuleCitation = {
    authority: str(r.authority),
    url: str(r.url),
    title: str(r.title),
    confidence: str(r.confidence),
  };
  const hasAnything = Object.values(citation).some((v) => v !== null);
  return hasAnything ? citation : null;
}

function toFix(raw: unknown): LeaveViolationFix | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const label = str(r.label);
  const focusField = str(r.focusField);
  if (label === null && focusField === null) return null;
  return {
    label,
    focusField,
    // 🚨 `set` ARRIVES CAMELIZED, AND THAT IS WHAT THE FORM WANTS. The engine writes
    // `{"carryover_allowed": true}` / `{"accrual_rate": …, "accrual_per_units": …}`; the shared
    // transport maps those keys, so what lands here is `{carryoverAllowed}` /
    // `{accrualRate, accrualPerUnits}` — exactly the editor's own field names. The snake_case
    // spelling is re-created on the way back out, where the save payload is built.
    // `focusField`'s VALUE stays `'carryover_cap'`: values are never mapped, only keys.
    set:
      r.set !== null && typeof r.set === "object" && !Array.isArray(r.set)
        ? (r.set as Record<string, unknown>)
        : null,
  };
}

/**
 * One violation OR one warning — `hr.validate_org_config` builds both with the same builder,
 * just with fewer keys on a warning. Everything absent stays `null`; nothing is defaulted.
 */
function toViolation(raw: unknown): LeaveConfigViolation {
  const r = bag(raw);
  return {
    code: str(r.code),
    message: str(r.message),
    jurisdictionKey: str(r.jurisdictionKey),
    jurisdictionName: str(r.jurisdictionName),
    ruleClass: str(r.class),
    ruleId: str(r.ruleId),
    ruleVersion: str(r.ruleVersion),
    field: str(r.field),
    configured: r.configured ?? null,
    required: r.required ?? null,
    citation: toCitation(r.citation),
    affectedEmployees: num(r.affectedEmployees),
    boundBasis: str(r.boundBasis),
    fix: toFix(r.fix),
  };
}

function toValidation(raw: unknown): LeavePolicyValidation | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    checked: bool(r.checked),
    ok: bool(r.ok),
    detail: str(r.detail),
    violations: list(r.violations).map(toViolation),
    warnings: list(r.warnings).map(toViolation),
    advisoryRulesConsulted: strList(r.advisoryRulesConsulted),
    jurisdictionsChecked: strList(r.jurisdictionsChecked),
    parametersSent: r.parametersSent ?? null,
  };
}

/**
 * `hr_leave_policy_validate` — the §2.6 client twin, called on blur of a governed field and
 * again before submit. It is a READ: it never writes and never clamps.
 */
export async function validateLeavePolicy(
  args: { organizationId: string; payload: Record<string, unknown> },
  opts?: HrRpcOptions,
): Promise<HrResult<LeavePolicyValidation>> {
  const res = await callHrLeaveRpc(
    "hr_leave_policy_validate",
    { p_organization_id: args.organizationId, p_payload: args.payload },
    opts,
  );
  if (!res.ok) return res;
  const validation = toValidation(res.data);
  return validation
    ? { ok: true, data: validation }
    : {
        ok: false,
        kind: "failed",
        message: "The lawfulness check answered with something we could not read.",
        code: null,
      };
}

// ── save ─────────────────────────────────────────────────────────────────────

/**
 * Lift a `hr_leave_policy_save` refusal out of its envelope.
 *
 * 🚨 THIS IS NOT AN ERROR PATH. `unlawful_configuration`, `warnings_unacknowledged` and
 * `accrual_method_change_requires_owner` are the rejection UX arriving with its evidence. The
 * caller renders the blocking dialog from what comes back here and leaves the form alone.
 */
export function leaveSaveRefusal(denied: HrDenied): LeaveSaveRefusal {
  const p = denied.payload ?? {};
  return {
    reason: denied.reason,
    detail: denied.detail,
    validation: toValidation(p.validation),
    payload:
      p.payload !== null && typeof p.payload === "object" && !Array.isArray(p.payload)
        ? (p.payload as Record<string, unknown>)
        : null,
    saveAnyway: p.saveAnyway === true,
    affectedEnrollments: num(p.affectedEnrollments),
  };
}

/**
 * `hr_leave_policy_save`. `acceptWarnings` is §2.6's **Save anyway** — an advisory rule may
 * never block a customer's configuration, so the second call is the same call with the
 * acknowledgment attached, never a different door.
 */
export async function saveLeavePolicy(
  args: {
    organizationId: string;
    payload: Record<string, unknown>;
    acceptWarnings?: boolean;
  },
  opts?: HrRpcOptions,
): Promise<HrResult<LeavePolicySaved>> {
  const res = await callHrLeaveRpc(
    "hr_leave_policy_save",
    {
      p_organization_id: args.organizationId,
      p_payload: args.payload,
      p_accept_warnings: args.acceptWarnings ?? false,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      policyId: str(r.policyId),
      version: num(r.version),
      isActive: bool(r.isActive),
      validation: toValidation(r.validation),
    },
  };
}

// ── enrollment ───────────────────────────────────────────────────────────────

function toSkip(raw: unknown): LeaveEnrollSkip {
  const r = bag(raw);
  return {
    employmentId: str(r.employmentId),
    reason: str(r.reason),
    detail: str(r.detail),
    workerClass: str(r.workerClass),
  };
}

/**
 * `hr_leave_enroll`. Per-employment outcomes, never all-or-nothing: a contractor and an
 * already-enrolled person come back as typed skips while everybody else is enrolled.
 */
export async function enrollInLeavePolicy(
  args: { leavePolicyId: string; employmentIds: string[]; effectiveFrom?: string | null },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveEnrollResult>> {
  const res = await callHrLeaveRpc(
    "hr_leave_enroll",
    {
      p_leave_policy_id: args.leavePolicyId,
      p_employment_ids: args.employmentIds,
      p_effective_from: args.effectiveFrom ?? undefined,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: { enrolled: num(r.enrolled), skipped: list(r.skipped).map(toSkip) },
  };
}

// ── balances ─────────────────────────────────────────────────────────────────

function toBalanceRow(raw: unknown): LeaveBalanceRow {
  const r = bag(raw);
  return {
    ...toFigures(r),
    employmentId: str(r.employmentId),
    employeeName: str(r.employeeName),
    sentence: str(r.sentence),
    ledgerHref: str(r.ledgerHref),
  };
}

/**
 * `hr_leave_balances(p_organization_id, p_scope, p_filters)` — route 44.
 *
 * 🚨 THE LIVE DOOR APPLIES EXACTLY TWO FILTERS: `leave_policy_id` and `negative_only`. Its
 * body reads no other key out of `p_filters`. §5.1 lists department / location / manager /
 * capped-out / expiring-carryover as well, and this signature deliberately does NOT accept
 * them: a filter control that sends a key the server ignores is a control that silently
 * returns the wrong list.
 *
 * 🚨 AND THE SCOPE IS CLAMPED SERVER-SIDE. Asking for `organization` as a manager returns
 * `team`; the answer's own `scope_label` is what the surface renders (THE VIEW LAW).
 */
export async function fetchLeaveBalances(
  args: {
    organizationId: string;
    scope?: "mine" | "team" | "organization";
    leavePolicyId?: string | null;
    negativeOnly?: boolean;
  },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveBalanceList>> {
  const filters: Record<string, unknown> = {};
  if (args.leavePolicyId) filters.leave_policy_id = args.leavePolicyId;
  if (args.negativeOnly) filters.negative_only = true;

  const res = await callHrLeaveRpc(
    "hr_leave_balances",
    {
      p_organization_id: args.organizationId,
      p_scope: args.scope ?? "organization",
      p_filters: filters,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      scope: str(r.scope),
      scopeLabel: str(r.scopeLabel),
      rung: str(r.rung),
      canAdjust: r.canAdjust === true,
      rows: list(r.rows).map(toBalanceRow),
    },
  };
}

// ── calendar ─────────────────────────────────────────────────────────────────

function toCalendarEntry(raw: unknown): LeaveCalendarEntry {
  const r = bag(raw);
  return {
    employmentId: str(r.employmentId),
    employeeName: str(r.employeeName),
    startsOn: str(r.startsOn),
    endsOn: str(r.endsOn),
    partialDay: bool(r.partialDay),
    viewerRung: str(r.viewerRung),
    label: str(r.label),
    existenceStatement: str(r.existenceStatement),
    hours: num(r.hours),
    href: str(r.href),
    caseLinked: bool(r.caseLinked),
  };
}

/**
 * `hr_leave_calendar(p_organization_id, p_from, p_to, p_filters)` — route 43.
 *
 * 🚨 `p_filters` IS DECLARED AND THE LIVE BODY READS NOTHING OUT OF IT (verified 2026-08-27).
 * So this signature accepts no filters: sending `{leave_kind: 'sick'}` would return the FULL
 * month unfiltered, and a chip that claims to be filtering while showing everything is a lie
 * about who is out. §10's team / type / policy filters need the door to grow them first.
 */
export async function fetchLeaveCalendar(
  args: { organizationId: string; from: string; to: string },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveCalendar>> {
  const res = await callHrLeaveRpc(
    "hr_leave_calendar",
    {
      p_organization_id: args.organizationId,
      p_from: args.from,
      p_to: args.to,
      p_filters: {},
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      from: str(r.from),
      to: str(r.to),
      rung: str(r.rung),
      entries: list(r.entries).map(toCalendarEntry),
      emptyStatement: str(r.emptyStatement),
    },
  };
}

// ── adjustment ───────────────────────────────────────────────────────────────

/** Lift a `hr_leave_adjust` refusal out of its envelope, with the numbers it names. */
export function leaveAdjustRefusal(denied: HrDenied): LeaveAdjustRefusal {
  const p = denied.payload ?? {};
  return {
    reason: denied.reason,
    detail: denied.detail,
    floor: num(p.floor),
    resultingBalance: num(p.resultingBalance),
  };
}

/**
 * `hr_leave_adjust` — §6. The ONLY write reachable from a balance, and it APPENDS.
 *
 * Direction is `add` / `remove`, never a raw signed number; the note minimum (20, or 60 for
 * `other`) is enforced by the door and re-stated by the dialog so the person is not told after
 * typing. `confirmBelowFloor` is the second confirmation, and only an `hr_owner` gets that far.
 */
export async function adjustLeaveBalance(
  args: {
    employmentId: string;
    leavePolicyId: string;
    direction: "add" | "remove";
    hours: number;
    reasonCategory: string;
    note: string;
    confirmBelowFloor?: boolean;
  },
  opts?: HrRpcOptions,
): Promise<HrResult<LeaveAdjustResult>> {
  const res = await callHrLeaveRpc(
    "hr_leave_adjust",
    {
      p_employment_id: args.employmentId,
      p_leave_policy_id: args.leavePolicyId,
      p_direction: args.direction,
      p_hours: args.hours,
      p_reason_category: args.reasonCategory,
      p_note: args.note,
      p_confirm_below_floor: args.confirmBelowFloor ?? false,
    },
    opts,
  );
  if (!res.ok) return res;
  const r = res.data;
  return {
    ok: true,
    data: {
      entryId: str(r.entryId),
      balanceBefore: num(r.balanceBefore),
      balanceAfter: num(r.balanceAfter),
      notify: str(r.notify),
    },
  };
}
