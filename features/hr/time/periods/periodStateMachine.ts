/**
 * features/hr/time/periods/periodStateMachine.ts — the two state machines, kept apart, in words.
 *
 * 🚨 THERE ARE TWO STATE MACHINES ON ROUTE 33 AND THE SURFACE LABELS THEM DISTINCTLY
 * (SPEC-TIME §14 D8). The **header** state is `hr.pay_period.state`; the **row** states are
 * `hr.pay_period_employment.state`. They share three token spellings (`approved`, `exported`,
 * `locked`) and mean different things, so this module never lets one be rendered with the other's
 * vocabulary. `submitted` is a period state and is **never** a row state; there is no row-level
 * `reopened` — a reopened period leaves its rows `approved` and reopens their workflow steps
 * (R-L3 U-13). Approving one person never moves the period.
 *
 * 🚨 EVERYTHING BELOW IS COURTESY, NOT AUTHORIZATION (SPEC-TIME §2.1's rule, applied to periods):
 * *"Illegal transitions are not rendered … The server refuses them anyway — the button's absence is
 * courtesy, the refusal is the contract."* Nothing here decides whether a transition may happen.
 * `hr.pay_period_transition` decides, through `hr._pay_period_transition()`, and its refusal is the
 * one that counts. If this file and the server ever disagree, the server is right and this file is
 * the bug.
 *
 * NO CLIENT COMPUTES HOURS: nothing in this module touches a timestamp, an hour or an amount.
 */

import type { PayPeriodRow, PayPeriodState, PayPeriodEmploymentState } from "../api/types";

// ---------------------------------------------------------------------------------------------
// The HEADER machine — hr.pay_period.state
// ---------------------------------------------------------------------------------------------

/**
 * The legal edges, exactly as `hr._pay_period_transition()` holds them:
 * `open → submitted → approved → exported → locked → closed`, plus `locked → reopened → approved`.
 *
 * Note what is absent and why: there is **no `submitted → open`**. SPEC-TIME §14 D7 ruled that a
 * manager's rejection moves the *employment's* row back to `open` and leaves the period `submitted`
 * — one disputed timecard must not un-submit a 400-person pay group.
 */
const PERIOD_EDGES: Record<PayPeriodState, PayPeriodState[]> = {
  open: ["submitted"],
  submitted: ["approved"],
  approved: ["exported"],
  exported: ["locked"],
  locked: ["closed", "reopened"],
  closed: [],
  reopened: ["approved"],
};

/** Period-state labels. Sentence case, never the raw token — LAW 3a: no cell prints a type name. */
export const PERIOD_STATE_LABEL: Record<PayPeriodState, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  exported: "Exported",
  locked: "Locked",
  closed: "Closed",
  reopened: "Reopened",
};

/** What the state MEANS to a payroll administrator, in one sentence, on the badge's hover. */
export const PERIOD_STATE_MEANING: Record<PayPeriodState, string> = {
  open: "Punches are still landing and intervals recompute continuously. No approval is offered yet.",
  submitted:
    "The period is closed to new time and every included employee has been asked to attest.",
  approved: "Every timecard has been decided. The period is ready for a payroll export.",
  exported: "A payroll file has been generated for this period.",
  locked: "Nothing in this period is editable. Corrections are adjustments that ride the next export.",
  closed: "Finished. The period is retained as a record and nothing further happens to it.",
  reopened:
    "Reopened for a correction. This does not un-export and does not re-pay — a delivered export is never regenerated.",
};

/** Semantic tone for the badge. Tokens only; the component maps these to `bg-*`/`text-*`. */
export type StateTone = "neutral" | "progress" | "positive" | "locked" | "warning";

export const PERIOD_STATE_TONE: Record<PayPeriodState, StateTone> = {
  open: "neutral",
  submitted: "progress",
  approved: "positive",
  exported: "positive",
  locked: "locked",
  closed: "locked",
  reopened: "warning",
};

// ---------------------------------------------------------------------------------------------
// The ROW machine — hr.pay_period_employment.state. DIFFERENT MACHINE, DIFFERENT WORDS.
// ---------------------------------------------------------------------------------------------

/**
 * Row labels are deliberately NOT the period labels even where the token matches. A period that is
 * "Approved" is ready to export; a person whose row is "Approved" has had their timecard decided by
 * their manager. Rendering both as the bare word "Approved" in the same viewport is how a payroll
 * administrator reads "N of M approved" as "the period is approved".
 */
export const ROW_STATE_LABEL: Record<PayPeriodEmploymentState, string> = {
  open: "Awaiting decision",
  attested: "Employee attested",
  disputed: "Attested with a disagreement",
  approved: "Manager approved",
  exported: "On a payroll file",
  locked: "Locked",
};

export const ROW_STATE_TONE: Record<PayPeriodEmploymentState, StateTone> = {
  open: "neutral",
  attested: "progress",
  disputed: "warning",
  approved: "positive",
  exported: "positive",
  locked: "locked",
};

// ---------------------------------------------------------------------------------------------
// What the surface offers
// ---------------------------------------------------------------------------------------------

/**
 * The three roles §2.7 enumerates. Resolved from the caller's HR capabilities, never from a guess:
 * an `hr_admin` may do every transition **except export**, and `payroll_admin` is the only role that
 * exports, acknowledges or fails.
 */
export type PeriodViewerRole = "manager" | "hr_admin" | "payroll_admin";

export interface PeriodActionOffer {
  to: PayPeriodState;
  label: string;
  /** Present when the action is NOT offered — always a reason, never a silently missing button. */
  unavailableBecause: string | null;
  /** `hr.pay_period_transition` refuses an empty reason on this transition. */
  reasonRequired: boolean;
  /** Shown in the confirm dialog BEFORE the click. Never discovered in a refusal. */
  consequence: string;
  destructiveTone: boolean;
}

export interface PeriodOfferContext {
  period: PayPeriodRow;
  role: PeriodViewerRole;
  /** `hr.time_and_attendance.allow_period_reopen`. A knob, resolved by the server, never a constant. */
  allowPeriodReopen: boolean;
  /** Today, as an ISO date, in the pay group's own reckoning — passed in, never derived here. */
  todayLocalDate: string;
}

/**
 * 🚨 THE ONE SENTENCE THAT MUST SURVIVE EVERY EDIT OF THIS FILE.
 *
 * The server returns it as `PeriodTransitionResult.notice` and the surface renders the server's
 * copy verbatim. This constant is what the surface says *before* the click, in the confirm dialog,
 * because a consequence discovered in a success toast is a consequence discovered too late.
 */
export const REOPEN_NOTICE =
  "Reopening does not un-export and does not re-pay. A delivered export is never regenerated — " +
  "regenerating in place double-pays. The fix for anything wrong in this period is an adjustment " +
  "that rides the next export, tagged back to this period.";

/**
 * 🚨 THE DISPUTE SENTENCE. §2.7 requires the surface to say this **explicitly, in words** — a
 * disabled button or a warning triangle does not discharge it. Approving over a preserved
 * disagreement is legitimate AND recorded, and the disagreement travels to the export as evidence;
 * the export never quietly resolves it by exporting the manager's number.
 */
export function disputeSentence(disputesOpen: number): string | null {
  if (disputesOpen <= 0) return null;
  // Wording is §2.7's, verbatim: *"3 timecards are approved with an open disagreement. The
  // disagreement travels to the export."* Only the timecard noun agrees with the count — the
  // disagreement stays singular even at three, because it is each timecard's own disagreement, and
  // the second sentence ("The disagreement travels") depends on that reading.
  const noun = disputesOpen === 1 ? "timecard is" : "timecards are";
  return (
    `${disputesOpen} ${noun} approved with an open disagreement. ` +
    `The disagreement travels to the export.`
  );
}

/**
 * 🚨 THE BOUNDARY-WEEKS SENTENCE. §2.7 requires this panel to be named and explained in words, not
 * rendered as a bare id list. A payroll administrator reconciling a period against a workweek total
 * that lands in the *next* period will otherwise conclude the numbers are wrong.
 */
export function boundaryWeeksSentence(boundaryWorkweekIds: string[]): string | null {
  const count = boundaryWorkweekIds.length;
  if (count === 0) return null;
  const noun = count === 1 ? "workweek straddles" : "workweeks straddle";
  return (
    `${count} ${noun} this period's edges. Overtime for those weeks is computed on the whole week ` +
    `and attributed to the period containing the week's end date.`
  );
}

/** True once the period's end date has passed. Submit is refused before that (§2.7). */
function endDateHasPassed(period: PayPeriodRow, todayLocalDate: string): boolean {
  // Plain date STRINGS in ISO form compare correctly lexicographically, which is why this is a
  // string comparison and not date arithmetic. Nothing is elapsed here.
  return todayLocalDate > period.periodEndOn;
}

/**
 * What route 33 renders as controls, with a reason attached to every one it does not offer.
 *
 * The reason matters as much as the offer: SPEC-ACCESS §4.2's rule — *"an unexplained denial is how
 * over-tightening hides"* — applies to a greyed button exactly as it applies to a 403.
 */
export function offeredTransitions(ctx: PeriodOfferContext): PeriodActionOffer[] {
  const { period, role, allowPeriodReopen, todayLocalDate } = ctx;
  const legal = PERIOD_EDGES[period.state] ?? [];
  const offers: PeriodActionOffer[] = [];

  const roleBlock = (allowed: PeriodViewerRole[], what: string): string | null => {
    if (allowed.includes(role)) return null;
    if (role === "manager") {
      return `Managers see this period read-only. ${what} is done by an HR or payroll administrator.`;
    }
    return `${what} requires the payroll administrator role.`;
  };

  for (const to of legal) {
    if (to === "submitted") {
      const tooEarly = !endDateHasPassed(period, todayLocalDate);
      offers.push({
        to,
        label: "Submit period",
        unavailableBecause:
          roleBlock(["hr_admin", "payroll_admin"], "Submitting a period") ??
          (tooEarly
            ? `This period runs through ${period.periodEndOn}. It can be submitted once that day has passed.`
            : null),
        reasonRequired: false,
        consequence:
          "Every included employee is asked to attest to their own timecard, and the manager " +
          "approval step opens behind it.",
        destructiveTone: false,
      });
      continue;
    }

    if (to === "approved") {
      // 🚨 REFUSED while any employment is still `open`. PERMITTED with an unresolved dispute.
      const stillOpen = period.counts.open;
      offers.push({
        to,
        label: period.state === "reopened" ? "Re-approve period" : "Approve period",
        unavailableBecause:
          roleBlock(["hr_admin", "payroll_admin"], "Approving a period") ??
          (stillOpen > 0
            ? `${stillOpen} ${stillOpen === 1 ? "timecard is" : "timecards are"} still awaiting a ` +
              `decision. Every timecard must be decided before the period is approved.`
            : null),
        reasonRequired: false,
        consequence:
          disputeSentence(period.counts.disputed) ??
          "The period becomes eligible for a payroll export.",
        destructiveTone: false,
      });
      continue;
    }

    if (to === "exported") {
      // Not a button. `exported` is reached by an export RUN completing, never by a state control —
      // offering it as a transition would let somebody mark a period exported with no file.
      continue;
    }

    if (to === "locked") {
      offers.push({
        to,
        label: "Lock period",
        unavailableBecause: roleBlock(["payroll_admin"], "Locking a period"),
        reasonRequired: false,
        consequence:
          "After lock nothing in this period is editable. Corrections become adjustments that ride " +
          "the next export, tagged back to this period.",
        destructiveTone: true,
      });
      continue;
    }

    if (to === "closed") {
      offers.push({
        to,
        label: "Close period",
        unavailableBecause: roleBlock(["hr_admin", "payroll_admin"], "Closing a period"),
        reasonRequired: false,
        consequence: "The period is finished and retained as a record. Nothing further happens to it.",
        destructiveTone: true,
      });
      continue;
    }

    if (to === "reopened") {
      offers.push({
        to,
        label: "Reopen period",
        unavailableBecause:
          roleBlock(["hr_admin", "payroll_admin"], "Reopening a period") ??
          (allowPeriodReopen
            ? null
            : "Reopening is switched off for this organization (hr.time_and_attendance.allow_period_reopen)."),
        reasonRequired: true,
        consequence: REOPEN_NOTICE,
        destructiveTone: true,
      });
    }
  }

  return offers;
}

/**
 * "N of M approved" — the row-machine progress line, phrased so it can never be mistaken for the
 * header state. Reads the server's counts; sums nothing.
 */
export function rowProgressSentence(period: PayPeriodRow): string {
  const { approved, employments } = period.counts;
  return `${approved} of ${employments} timecards approved`;
}
