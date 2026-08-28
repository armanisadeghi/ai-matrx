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
  /*
   * 🚨 `approved -> approved` IS RE-APPROVAL IN PLACE, not a typo. §4.1 requires an already-approved
   * period to be approved again once a recompute has moved its hours, and the period does not leave
   * `approved` to do it (§2.4 calls it a banner state). Without this the export refusal shipped in
   * hr_l3_100 would be a deadlock: refused for want of a re-approval no control could perform.
   * It is not a backward edge — the period does not go anywhere.
   */
  approved: ["exported", "approved"],
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
  /*
   * 🚨 THIS SENTENCE USED TO END "and every included employee has been asked to attest", and this
   * map STRUCTURALLY CANNOT KNOW THAT. It is keyed by state alone, so it made the same claim for
   * every submitted period — including one whose only included employee holds no login and could
   * never be asked at all. A state means what the STATE means; who was actually asked is a fact
   * about the rows, and `askingSentence` below derives it from them.
   */
  submitted: "The period is closed to new time.",
  /*
   * 🚨 "ready for a payroll export" WAS ASSERTED HERE, and this map cannot know it — same defect as
   * the `submitted` sentence above. A period recomputed since its approval is NOT ready: the export
   * door refuses it (hr_l3_100), and this line was rendering directly above a banner saying so.
   * Readiness is derived beside the flag, in `exportReadinessSentence`.
   */
  approved: "Every timecard has been decided.",
  exported: "A payroll file has been generated for this period.",
  locked: "Nothing in this period is editable. Corrections are adjustments that ride the next export.",
  closed: "Finished. The period is retained as a record and nothing further happens to it.",
  reopened:
    "Reopened for a correction. This does not un-export and does not re-pay — a delivered export is never regenerated.",
};

/**
 * The asking truth, derived from the rows rather than asserted by the state.
 *
 * Flows open when a period is submitted, so rows existing is what makes this answerable at all;
 * with none, the surface says nothing rather than guessing. Takes primitives, not the workflow
 * object, so this module stays free of the read layer and the headless proof can call it directly.
 *
 * 🚨 NO-BLAME REGISTER. An employee who could not be reached did not fail to respond — nobody could
 * ask them. The sentence reports what the platform managed to do, and counts the rest without
 * attributing the gap to the person on the row.
 */
export function askingSentence(rowCount: number, unreachable: number): string | null {
  if (rowCount <= 0) return null;
  if (unreachable <= 0) return "Every included employee has been asked to attest.";
  return (
    "Attestation was requested wherever anyone could be reached — " +
    (unreachable === 1 ? "1 person had" : `${unreachable} people had`) +
    " nobody to ask."
  );
}

/**
 * Whether an approved period is actually exportable, derived rather than asserted by its state.
 *
 * Returns null when the period is stale — the §4.1 banner is already saying what happened and why,
 * and repeating a contradiction of it in the state line is how a surface argues with itself.
 */
export function exportReadinessSentence(
  state: PayPeriodState,
  recomputedSinceApproval: boolean,
): string | null {
  if (state !== "approved") return null;
  return recomputedSinceApproval ? null : "The period is ready for a payroll export.";
}

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

/**
 * 🚨 THE TWO CAPABILITY TOKENS THE SERVER ACTUALLY USES. `hr.pay_period_transition` decides in one
 * line — `case when p_to_state = 'exported' then 'payroll.export' else 'payroll.read' end` — so
 * every transition except export is gated on **`payroll.read`**, and nothing else.
 *
 * Constants rather than inline strings because getting one wrong is invisible: a capability token
 * that does not exist is not a compile error and not a runtime error, it is silently `false`
 * forever.
 */
export const CAP_EXPORT = "payroll.export";
export const CAP_TRANSITION = "payroll.read";

/**
 * Resolve §2.7's three roles from the caller's capability list.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FUNCTION WAS THE S4 BLOCKER: THE SUBMIT BUTTON WAS INERT.
 *
 * It used to test `time.approve_period` and `hr.admin`. **Neither capability exists** — the live
 * set in `hr.access_role` carries 37 tokens and those are not among them, so the `hr_admin` branch
 * could never be reached and every viewer without `payroll.export` collapsed to `manager`, the
 * read-only role. Every transition control rendered DISABLED. A verifier clicked Submit, nothing
 * happened, and probing `hr_pay_period_transition` directly succeeded — because the door was fine
 * and only the client's idea of who may knock was wrong.
 *
 * The lesson worth keeping: an invented capability token fails CLOSED and SILENTLY. There is no
 * error anywhere — the string simply never matches, the button greys out, and the surface looks
 * like a considered permission decision instead of a typo.
 *
 * It lives in THIS module, beside the offer logic it feeds and away from React, so the headless
 * proof can assert it. That is not incidental: this is exactly the kind of rule that has to be
 * provable without a browser.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Still deliberately narrowing: the DEFAULT is `manager`. A capability we cannot see resolves to
 * the least reach — but "cannot see" must now mean genuinely absent, not that we were looking for
 * a name nobody issues.
 */
export function resolvePeriodRole(capabilities: string[]): PeriodViewerRole {
  if (capabilities.includes(CAP_EXPORT)) return "payroll_admin";
  if (capabilities.includes(CAP_TRANSITION)) return "hr_admin";
  return "manager";
}

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
  /**
   * §4.1's `recomputed-since-approval`, from `hr.pay_period_get`. Only the DETAIL read carries it,
   * so it defaults to false: a surface that does not know must not offer a re-approval, and the
   * period list does not know.
   */
  recomputedSinceApproval?: boolean;
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
  const stale = ctx.recomputedSinceApproval === true;
  const legal = PERIOD_EDGES[period.state] ?? [];
  const offers: PeriodActionOffer[] = [];

  /**
   * 🚨 THIS MIRRORS THE SERVER'S ONE-LINE RULE AND MUST NOT DRIFT FROM IT.
   *
   * `hr.pay_period_transition`:
   *   `v_cap := case when p_to_state = 'exported' then 'payroll.export' else 'payroll.read' end`
   *
   * So EVERY transition this bar offers — submit, approve, lock, close, reopen — is gated on
   * `payroll.read`, which is the `hr_admin` role here. Only `exported` needs `payroll.export`, and
   * `exported` is never a button (it is reached by an export run completing).
   *
   * Both roles that hold the capability are therefore allowed on every offer. Passing a narrower
   * list is how this surface previously over-tightened `lock` to payroll-admin-only while the
   * server was happy to accept it from an HR admin — a disabled button with a reason that was
   * simply untrue.
   */
  const roleBlock = (allowed: PeriodViewerRole[], what: string): string | null => {
    if (allowed.includes(role)) return null;
    if (role === "manager") {
      return `Managers see this period read-only. ${what} is done by an HR or payroll administrator.`;
    }
    return `${what} requires the payroll administrator role.`;
  };

  /** The transitions gated on `payroll.read` — which is all of them except export. */
  const CAN_TRANSITION: PeriodViewerRole[] = ["hr_admin", "payroll_admin"];

  for (const to of legal) {
    if (to === "submitted") {
      const tooEarly = !endDateHasPassed(period, todayLocalDate);
      offers.push({
        to,
        label: "Submit period",
        unavailableBecause:
          roleBlock(CAN_TRANSITION, "Submitting a period") ??
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
      /*
       * 🚨 RE-APPROVAL IS OFFERED ONLY WHEN THERE IS SOMETHING TO RE-APPROVE. `approved -> approved`
       * exists for §4.1's stale case alone; offering "Approve period" on a period already approved
       * and unchanged is a button with no meaning, and one a payroll admin would reasonably read as
       * "this did not take the first time".
       */
      if (period.state === "approved" && !stale) continue;
      /*
       * 🚨 REFUSED while any timecard is UNDECIDED. PERMITTED with an unresolved dispute.
       *
       * This counted `counts.open` alone and offered an enabled "Approve period" on a period the
       * server then refused with `hr_period_has_open_timecards` — a button that could not work.
       * The server had already fixed the same bug on its side, and its comment says why:
       * "the employee attested has left `open` for `attested` and is still waiting on its manager;
       * counting only `open` let a period reach `approved` with timecards nobody had approved."
       * The client was the stale half of that fix, and the panel beside it already disagreed with
       * the button — it read "0 of 1 timecards approved" while the control said go ahead.
       *
       * The server's rule is `state not in ('approved','exported','locked')`. `exported` and
       * `locked` are states a row only reaches AFTER approval, so where this control is offered the
       * undecided set is `open + attested + disputed`.
       *
       * 🚨 `disputed` IS DELIBERATELY NOT COUNTED HERE, AND THAT IS A KNOWN NARROWER GAP, NOT AN
       * OVERSIGHT. `counts.disputed` is a STATE count server-side
       * (`count(*) filter (where state = 'disputed')`), but this client reads it elsewhere as
       * "approved rows carrying an open disagreement" — `disputeSentence` is built on that reading,
       * and the server's own note distinguishes them: "An unresolved DISAGREEMENT does not block
       * approval — it travels to the export on the approved row." Those are two different
       * populations, and resolving which one this count is takes a change to the read layer rather
       * than a guess here. Counting it would flip a passing contract on a belief I have not proved.
       * So this closes the case that WAS proved — an attested timecard offering an approval the
       * server refuses — and the conflation is reported rather than papered over.
       */
      const stillOpen = period.counts.open + period.counts.attested;
      offers.push({
        to,
        label:
          period.state === "reopened" || period.state === "approved"
            ? "Re-approve period"
            : "Approve period",
        unavailableBecause:
          roleBlock(CAN_TRANSITION, "Approving a period") ??
          (stillOpen > 0
            ? `${stillOpen} ${stillOpen === 1 ? "timecard has" : "timecards have"} not been ` +
              `approved yet. A period is approved when every timecard in it is.`
            : null),
        reasonRequired: false,
        consequence: stale
          ? "The approval is restamped for the hours as they stand now, and the period becomes " +
            "exportable again."
          : disputeSentence(period.counts.disputed) ??
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
        unavailableBecause: roleBlock(CAN_TRANSITION, "Locking a period"),
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
        unavailableBecause: roleBlock(CAN_TRANSITION, "Closing a period"),
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
          roleBlock(CAN_TRANSITION, "Reopening a period") ??
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
