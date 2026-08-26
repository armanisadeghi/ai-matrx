/**
 * features/hr/time/shared/vocabulary.ts — human labels for the CLOSED vocabularies of §1.
 *
 * 🚨 WHAT THIS FILE IS NOT: it is not a label source for anything the server names.
 *
 * LAW 3a — *no cell prints a type name* — is satisfied by reading the server's own label wherever
 * one exists, and one exists for every figure that carries money or hours:
 *
 *   • an interval's badge label is `WorkIntervalRow.earningCodeName`, **never** `hoursCategory`;
 *   • an exception's sentence is `AttendanceExceptionRow.message`, **never** `exceptionKind`;
 *   • a refusal's sentence is `HrRpcError.userMessage`, verbatim.
 *
 * The maps below exist for the places where a token is genuinely the *subject* rather than the
 * data: a filter option, a group heading on the exceptions strip, a column of punch kinds on the
 * raw evidence lane. Every one of these is a Postgres `text` column with a CHECK, so the set is
 * closed and a missing key is a contract change, not a data value. `labelFor` falls back to the
 * humanized token rather than rendering nothing, so a server that adds a member degrades to a
 * readable word instead of a blank cell.
 */

import type {
  ActorType,
  AttendanceExceptionKind,
  ExceptionResolutionState,
  ExceptionSeverity,
  HoursCategory,
  PayPeriodEmploymentState,
  PayPeriodState,
  PunchKind,
  PunchSource,
} from "../api/types";
import { humanizeToken } from "./format";

export function labelFor<K extends string>(
  map: Partial<Record<K, string>>,
  token: K,
): string {
  return map[token] ?? humanizeToken(token);
}

export const PUNCH_KIND_LABELS: Record<PunchKind, string> = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Break start",
  break_end: "Break end",
  meal_start: "Meal start",
  meal_end: "Meal end",
  transfer: "Transfer",
};

export const PUNCH_SOURCE_LABELS: Record<PunchSource, string> = {
  web: "Web",
  kiosk: "Kiosk",
  mobile: "Mobile",
  manager_entry: "Manager entry",
  import: "Import",
  auto_close: "Automatic close",
};

export const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_admin: "HR administrator",
  kiosk_device: "Kiosk device",
  external_signer: "External signer",
  integration: "Integration",
  automation: "Automation",
  ai_agent: "AI agent",
  platform_admin: "Platform administrator",
};

/** Group headings on the exceptions strip and options in the queue's kind filter. */
export const EXCEPTION_KIND_LABELS: Record<AttendanceExceptionKind, string> = {
  late_arrival: "Late arrival",
  early_departure: "Left early",
  no_show: "No show",
  unscheduled_work: "Worked unscheduled",
  missed_punch: "Missed punch",
  orphan_punch: "Never clocked out",
  auto_closed_estimate: "Automatically closed — estimated",
  unapproved_overtime: "Overtime without approval",
  worked_through_break: "Worked through a break",
  meal_not_provided: "Meal break not provided",
  rest_not_provided: "Rest break not provided",
  over_scheduled_hours: "Worked past the scheduled end",
  call_off: "Called off",
  left_early_approved: "Left early, approved",
  ip_verification_failed: "Location could not be verified",
};

export const SEVERITY_LABELS: Record<ExceptionSeverity, string> = {
  info: "For information",
  warn: "Needs a look",
  violation: "Statutory violation",
};

/** Ordering for "severity then age" (SPEC-TIME §5.4). Higher sorts first. */
export const SEVERITY_RANK: Record<ExceptionSeverity, number> = {
  violation: 3,
  warn: 2,
  info: 1,
};

/**
 * The verbs on a resolution control. Rendered ONLY from a row's own `allowedResolutions` —
 * `excused` is absent on `severity='violation'` and the UI never re-adds it (SPEC-TIME §2.6).
 */
export const RESOLUTION_LABELS: Record<ExceptionResolutionState, string> = {
  open: "Reopen",
  acknowledged: "Acknowledge",
  excused: "Excuse",
  corrected: "Correct the record",
  escalated: "Escalate",
  closed: "Close",
};

/** Which resolutions the server refuses without a note (SPEC-TIME §2.6, §1.3). */
export const RESOLUTIONS_REQUIRING_NOTE: ReadonlySet<ExceptionResolutionState> =
  new Set<ExceptionResolutionState>(["excused"]);

/**
 * 🚨 ROW state — `hr.pay_period_employment.state` (SPEC-TIME §14 D8).
 * There is no `submitted` member and no `reopened` member. A reopened period leaves its rows
 * `approved` and reopens their workflow steps; inventing a row-level "reopened" chip is precisely
 * the mistake D8 was written to prevent.
 */
export const ROW_STATE_LABELS: Record<PayPeriodEmploymentState, string> = {
  open: "Open",
  attested: "Attested by the employee",
  disputed: "Employee disagrees",
  approved: "Approved",
  exported: "Sent to payroll",
  locked: "Locked",
};

/** 🚨 HEADER state — `hr.pay_period.state`. A different machine, labelled differently on screen. */
export const PERIOD_STATE_LABELS: Record<PayPeriodState, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  exported: "Exported",
  locked: "Locked",
  closed: "Closed",
  reopened: "Reopened",
};

export const HOURS_CATEGORY_LABELS: Record<HoursCategory, string> = {
  worked: "Worked",
  paid_leave: "Paid leave",
  unpaid_leave: "Unpaid leave",
  holiday: "Holiday",
  on_call: "On call",
  premium: "Premium",
};

/** The stable column order for a totals-by-category row. */
export const HOURS_CATEGORY_ORDER: HoursCategory[] = [
  "worked",
  "paid_leave",
  "unpaid_leave",
  "holiday",
  "on_call",
  "premium",
];

/**
 * The badge tooltip SPEC-TIME §5.2 requires **verbatim in substance**: paid leave counts toward
 * hours of service and not toward FLSA overtime, and a reader who assumes otherwise files the
 * wrong number.
 */
export const PAID_LEAVE_TOOLTIP =
  "Paid leave counts toward hours of service. It does not count toward overtime under the FLSA.";
