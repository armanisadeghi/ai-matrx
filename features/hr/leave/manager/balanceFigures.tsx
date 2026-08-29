/**
 * features/hr/leave/manager/balanceFigures.tsx — the figure CELLS of the leave desk's tables.
 *
 * 🚨 ONE CAPTION, ONE QUANTITY — ON EVERY SCREEN, INCLUDING THE ADMIN'S.
 *
 * Round 42 fixed "Available −16 h" on the EMPLOYEE's own panel by rendering `bookable_now`
 * (`greatest(0, ledger_balance − pending_approval)`) under that caption instead of §5's accounting
 * identity `available` (`ledger_balance − pending_approval`, which legitimately goes negative). The
 * number did not disappear, it MOVED: `/hr/leave/balances` and the policy roster both kept a column
 * ALSO headed "Available" bound to `row.available`, painted red by the `value < 0` branch below. So
 * for one person, on the same afternoon, their own screen said **Available 0 h** and their HR
 * admin's said **Available −24 h** — one word, two quantities, no explanation on either side of it.
 *
 * The rule this file exists to keep is not "hide the negative". HR must see the identity; an
 * overdrawn balance is a real thing an administrator has to act on, and §17 asserts the identity
 * against the ledger. The rule is that the CAPTION has to name the quantity under it:
 *
 *   • **Available** is the bookable figure, `bookableNow`, and it is the same number the employee
 *     reads on `/hr/me/time-off`. It is never negative, because a bookable quantity cannot be.
 *   • **After pending** is the accounting identity, `available`, under a caption that says so. It
 *     goes red when negative — correctly, because the caption is now an accounting caption, and
 *     the sub-caption says what a negative one means.
 *
 * `pending_beyond_balance` is what makes the pair honest rather than a clamp with a lie under it:
 * where it is non-zero the two figures DISAGREE, and both cells say so on the row rather than
 * leaving a silently-floored number on screen. It is the same field driving `hr._leave_sentence`'s
 * overhang branch, whose sentence this table already renders verbatim beside the employee's name.
 *
 * Both leave-desk tables import these cells. They previously wrote their own — `LeaveBalancesSurface`
 * with `formatHours` and a null state, `LeaveEnrollmentSurface` with a bare `{row.available} h` that
 * did not even round — which is exactly the two-implementations-of-one-thing shape that let the
 * caption drift in the first place.
 */

import type { LeaveBalanceRow } from "./api/types";
import { formatHours } from "../components/LeaveBalanceBlock";

/**
 * One raw figure. `null` renders dark and says so; an unlimited policy renders the WORD (§5's
 * rule that a figure the server did not send is not a zero).
 *
 * The `value < 0` branch is deliberate and stays: it belongs to figures whose caption is an
 * accounting caption. It must never sit under a caption that names a bookable quantity.
 */
export function LeaveFigureCell({
  row,
  value,
}: {
  row: LeaveBalanceRow;
  value: number | null;
}) {
  if (row.unlimited === true) {
    return <span className="text-muted-foreground">Unlimited</span>;
  }
  const shown = formatHours(value);
  if (shown === null) return <span className="text-muted-foreground">Not provided</span>;
  return (
    <span
      className={
        value !== null && value < 0
          ? "tabular-nums text-destructive"
          : "tabular-nums text-foreground"
      }
    >
      {shown}
    </span>
  );
}

/**
 * **Available** — what this person can book right now. The employee's own tile renders this exact
 * field under this exact word.
 *
 * Where `pendingBeyondBalance` is non-zero the figure is floored, and the overhang is stated on the
 * row rather than left implicit: a clamped number with nothing under it is the second lie the
 * server grew this field to prevent.
 */
export function LeaveBookableCell({ row }: { row: LeaveBalanceRow }) {
  const overhang = row.pendingBeyondBalance ?? 0;
  return (
    <div className="min-w-0">
      <span className="font-semibold">
        <LeaveFigureCell row={row} value={row.bookableNow} />
      </span>
      {row.unlimited !== true && overhang > 0 ? (
        <span className="block text-xs leading-snug text-amber-600 dark:text-amber-500">
          {formatHours(overhang)} asked for beyond the balance
        </span>
      ) : null}
    </div>
  );
}

/**
 * **After pending** — §5's accounting identity, `latest balance_after − Pending approval`, under a
 * caption that names it. This is the figure §17 asserts and the §12 ledger reconciles against, and
 * it is the one an administrator needs in order to see that somebody has asked for more than they
 * have. Negative is a legitimate answer here, so it is shown, in red, with the reason beside it.
 */
export function LeaveAfterPendingCell({ row }: { row: LeaveBalanceRow }) {
  const overhang = row.pendingBeyondBalance ?? 0;
  return (
    <div className="min-w-0">
      <LeaveFigureCell row={row} value={row.available} />
      {row.unlimited !== true && overhang > 0 ? (
        <span className="block text-xs leading-snug text-muted-foreground">
          Asked for more than they have
        </span>
      ) : null}
    </div>
  );
}

/** The header of the identity column: the caption, and the sentence that keeps it honest. */
export function LeaveAfterPendingHeader() {
  return (
    <span className="block leading-tight">
      After pending
      <span className="block text-[11px] font-normal text-muted-foreground">
        Balance once everything asked for is granted
      </span>
    </span>
  );
}
