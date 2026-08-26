/**
 * features/hr/time/overtime/overtimeVocabulary.ts — the words this lane is allowed to use.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 THE LAW THIS FILE EXISTS TO ENFORCE, BEFORE ANY PRODUCT CONSIDERATION:
 *
 *                        **UNAPPROVED OVERTIME IS STILL PAID.**
 *
 * Hours worked are hours owed. The FLSA pays hours suffered or permitted to be worked, approved or
 * not. Nothing in this lane — no state, no label, no badge, no filter, no sort order — may gate,
 * delay, reduce or condition payment on an approval.
 *
 * Pre-approval is a **management** control over whether overtime is *incurred*. It is never a
 * payroll control over whether it is *paid*. `hr.overtime_preapproval` never gates an
 * `hr.work_interval` row, and any implementation in which a missing pre-approval suppresses,
 * withholds or zeroes an OT line is a **wage violation and a defect**.
 *
 * That is why the labels below are constants rather than inline strings: `worked-unapproved` has
 * exactly one spelling in this product — *"Worked without approval — paid, flagged for review"* —
 * and the words "unpaid", "withheld", "pending", "on hold" and "zeroed" must never appear beside an
 * overtime figure anywhere. A manager reading a bare "Denied" will assume a denial withholds pay
 * unless we tell them otherwise, so {@link DENIAL_DOES_NOT_WITHHOLD_PAY} is rendered at decision
 * time, in words, every time.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * NO CLIENT COMPUTES HOURS: nothing here touches a timestamp, an hour or a rate.
 */

import type { OvertimePreapprovalState } from "../api/types";

/**
 * The queue's five states (SPEC-UI-IA §3.4 row 31a). Four are `hr.overtime_preapproval.state`
 * values; `approaching-threshold` is a live evaluator reading, not a stored row, and is kept in the
 * same union because it is what the watchlist shows beside the requests.
 */
export type OvertimeQueueState =
  | OvertimePreapprovalState
  /** 🚨 Paid. Flagged. Never withheld. */
  | "worked-unapproved"
  | "approaching-threshold";

/**
 * 🚨 EVERY LABEL THAT TOUCHES `worked-unapproved` SAYS "PAID" IN THE LABEL ITSELF.
 * Not in a tooltip, not in a footnote — in the words on the chip, because a chip is what a manager
 * actually reads when they are scanning forty rows.
 */
export const OT_STATE_LABEL: Record<OvertimeQueueState, string> = {
  requested: "Awaiting your decision",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired without a decision",
  withdrawn: "Withdrawn",
  auto_flagged: "Flagged automatically — paid",
  "worked-unapproved": "Worked without approval — paid, flagged for review",
  "approaching-threshold": "Approaching overtime",
};

export const OT_STATE_MEANING: Record<OvertimeQueueState, string> = {
  requested: "Nobody has decided this yet. It never decides itself.",
  approved: "Overtime in this window was authorized in advance.",
  denied:
    "Overtime in this window was not authorized. If it was worked anyway, it is still paid — this is a management record, not a payroll one.",
  expired:
    "The decision deadline passed with no decision. It was NOT auto-approved and NOT auto-denied — it escalated.",
  withdrawn: "The person who raised it took it back before a decision.",
  auto_flagged:
    "Overtime was worked with no request against it. The hours are computed and paid exactly as if approved; this row exists so a human can look.",
  "worked-unapproved":
    "These hours are computed and PAID at the correct overtime rate. There is no held state, no pending category and no zero placeholder. The flag gates the REVIEW, never the pay.",
  "approaching-threshold":
    "This person is close to crossing an overtime threshold. Nothing has happened yet — this is the moment a decision is still cheap.",
};

export type OtTone = "neutral" | "attention" | "positive" | "negative" | "paid-flag";

export const OT_STATE_TONE: Record<OvertimeQueueState, OtTone> = {
  requested: "attention",
  approved: "positive",
  denied: "negative",
  expired: "attention",
  withdrawn: "neutral",
  auto_flagged: "paid-flag",
  "worked-unapproved": "paid-flag",
  "approaching-threshold": "attention",
};

/**
 * 🚨 THE SENTENCE THE MANAGER SEES AT DECISION TIME, EVERY TIME, INCLUDING ON THE DENY PATH.
 *
 * SPEC-TIME §4.4: *"WORKING ANYWAY IS STILL PAID — the surface says so to the manager at decision
 * time."* A manager who believes a denial withholds pay will use denial as a punishment and will be
 * wrong in a way that becomes a wage claim. Deleting this sentence to tidy the panel is the single
 * most expensive edit anybody could make to this lane.
 */
export const DENIAL_DOES_NOT_WITHHOLD_PAY =
  "Denying this does not withhold pay. If these hours are worked anyway they are still paid at the " +
  "correct overtime rate — a denial is a management decision about whether the overtime should be " +
  "incurred, and it is recorded as one. What it does is open a review, not stop a payment.";

/**
 * The flag sentence beside an unapproved-OT figure. Rendered wherever such a figure appears, so the
 * number and the reassurance are never separated by a scroll.
 */
export const UNAPPROVED_OT_IS_PAID =
  "These hours are paid. They are flagged so a manager can look at how they came about, not to " +
  "hold back any part of them.";

/**
 * 🚨 NOTHING AUTO-DECIDES. SPEC-TIME §4.4: *"no action by the deadline … NEVER auto-approves and
 * NEVER auto-denies."* It ticks reminders and escalates up the arbitrary-depth chain.
 */
export const NO_DECISION_ESCALATES =
  "If nobody decides by the deadline this escalates to the next approver. It is never approved by " +
  "default and never denied by default — a decision nobody made is not a decision.";

/**
 * The threshold axes the jurisdiction engine resolves. 🚨 **Daily is not optional**: in California
 * an 8-hour day triggers overtime regardless of the weekly total, so a surface that shows only the
 * weekly number is silently wrong for the jurisdiction that matters most.
 */
export const THRESHOLD_AXIS_LABEL: Record<string, string> = {
  weekly: "Weekly",
  daily: "Daily",
  doubletime: "Double time",
  consecutive_day: "Seventh consecutive day",
  approaching: "Approaching overtime",
  at_overtime: "At overtime",
};

export function thresholdAxisLabel(key: string): string {
  return THRESHOLD_AXIS_LABEL[key] ?? key.replace(/_/g, " ");
}

/**
 * 🚨 EXEMPT EMPLOYEES NEVER ENTER THIS LANE. A request against an FLSA-exempt position assignment is
 * refused at validate with the reason named, because there is no overtime to pre-approve. The
 * refusal is the server's; this is the sentence the surface shows when it arrives.
 */
export const EXEMPT_NOT_APPLICABLE =
  "This assignment is exempt from overtime, so there is no overtime to pre-approve. Pre-approval " +
  "does not apply — this is not a permission problem.";

/**
 * The grace period, said correctly. §4.5: grace is separate from the alert buffer and **does not
 * suppress payment** — the moment a threshold is actually crossed, overtime is computed and owed
 * regardless of grace, buffer, alert or approval.
 */
export function graceSentence(graceMinutes: number): string {
  if (graceMinutes <= 0) {
    return "Overtime opens a review the moment a threshold is crossed.";
  }
  return (
    `A review opens once someone is more than ${graceMinutes} minutes past a threshold, so nobody ` +
    `is paged over a two-minute overrun. This changes nothing about what is computed or paid — ` +
    `overtime is owed from the moment the threshold is crossed.`
  );
}
