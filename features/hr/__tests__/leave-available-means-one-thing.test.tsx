/*
  🚨 "AVAILABLE" NAMES ONE QUANTITY, ON EVERY SCREEN THAT SAYS THE WORD.

  Round 42 found `Available −16 h`, in red, on an employee's own panel — §5's accounting identity
  (`ledger_balance − pending_approval`, which legitimately goes negative) rendered under a caption
  that promises a bookable figure. The fix gave the employee tile `bookable_now` and left the two
  MANAGER tables reading `row.available` under the identical word, so the negative number did not
  disappear: it moved onto the HR admin's screen. For one person, on one afternoon, their own page
  said **Available 0 h** and their administrator's said **Available −24 h**.

  This test is the thing that would have caught that, and it is deliberately written as a
  CROSS-SURFACE assertion rather than three separate per-file ones — the defect was never inside a
  file, it was between them. It renders the real cells and compares the real captions.

  The overdrawn row here is synthetic ON PURPOSE. `pending_beyond_balance > 0` needs somebody to
  have asked for more leave than they hold, and no such row exists in any seeded employer (proven
  2026-08-28: `/hr/leave/balances`'s "Only negative balances" filter returns nothing). A state that
  cannot be produced on demand is exactly the state a regression walks straight back into.
*/

import { renderToStaticMarkup } from "react-dom/server";

import {
  LeaveAfterPendingCell,
  LeaveAfterPendingHeader,
  LeaveBookableCell,
  LeaveFigureCell,
} from "../leave/manager/balanceFigures";
import type { LeaveBalanceRow } from "../leave/manager/api/types";

function text(node: React.ReactNode): string {
  return renderToStaticMarkup(node as never)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every field `hr.leave_figures` sends, so nothing below leans on a default. */
function row(over: Partial<LeaveBalanceRow>): LeaveBalanceRow {
  return {
    ok: true,
    refused: null,
    unlimited: false,
    asOf: "2026-08-28",
    policyId: "p1",
    policyName: "PTO bank",
    leaveKind: "pto",
    accruedToDate: 40,
    usedTaken: 0,
    approvedUpcoming: 16,
    pendingApproval: 8,
    available: 16,
    bookableNow: 16,
    pendingBeyondBalance: 0,
    pendingLatestStart: null,
    ledgerBalance: 24,
    removed: 0,
    identityHolds: true,
    accrualMethod: "per_month",
    accrualRate: 8,
    accrualPerUnits: null,
    incrementMinutes: 15,
    balanceCap: null,
    carryoverAllowed: true,
    negativeBalanceAllowed: false,
    negativeBalanceFloor: null,
    statutoryBasisRuleClass: null,
    employmentId: "e1",
    employeeName: "Tomo Iversen-G32",
    sentence: null,
    ledgerHref: null,
    ...over,
  } as LeaveBalanceRow;
}

/**
 * The round-42 case, as the server actually reports it: 24 hours in the bank, 40 hours already
 * asked for. The identity is −16; the bookable figure is 0; the overhang is 16.
 */
const OVERDRAWN = row({
  pendingApproval: 40,
  ledgerBalance: 24,
  available: -16,
  bookableNow: 0,
  pendingBeyondBalance: 16,
});

describe('the caption "Available" means the bookable figure everywhere', () => {
  it("never renders a negative number under it, however overdrawn the person is", () => {
    const shown = text(<LeaveBookableCell row={OVERDRAWN} />);
    expect(shown).toContain("0 h");
    expect(shown).not.toContain("-16");
    expect(shown).not.toContain("−16");
  });

  it("says why it is floored instead of leaving a silently-clamped number", () => {
    // A clamp with no explanation is the second lie, not the fix for the first.
    expect(text(<LeaveBookableCell row={OVERDRAWN} />)).toContain(
      "16 h asked for beyond the balance",
    );
    // …and says nothing extra on an ordinary row.
    expect(text(<LeaveBookableCell row={row({})} />)).toBe("16 h");
  });

  it("would have failed on the column as it shipped — the pre-fix render, reconstructed", () => {
    /*
      A guard that cannot fail proves nothing, so the defect is pinned as well as the fix. This is
      exactly what `LeaveBalancesSurface` rendered under the header "Available" until 2026-08-28:
      `row.available` through the figure cell, whose `value < 0` branch paints it red. Run the two
      assertions below against that markup and the first one fails — which is the whole report.
    */
    const asItShipped = renderToStaticMarkup(
      <LeaveFigureCell row={OVERDRAWN} value={OVERDRAWN.available} /> as never,
    );
    expect(asItShipped).toContain("-16 h");
    expect(asItShipped).toContain("text-destructive");

    // The same row, through the cell that carries the caption today.
    const asItRendersNow = renderToStaticMarkup(<LeaveBookableCell row={OVERDRAWN} /> as never);
    expect(asItRendersNow).not.toContain("-16 h");
  });

  it("renders the SAME field the employee's own tile renders", () => {
    /*
      `LeaveBalanceBlock` renders `figures.bookableNow` under "Available" (see the tile's own
      header). If a future edit repoints either side at `available`, these two stop agreeing —
      which is the entire defect, expressed as an equality.
    */
    const asManagerSeesIt = text(<LeaveBookableCell row={OVERDRAWN} />);
    const asEmployeeSeesIt = `${OVERDRAWN.bookableNow} h`;
    expect(asManagerSeesIt.startsWith(asEmployeeSeesIt)).toBe(true);
  });
});

describe("the accounting identity keeps its own name, and stays visible", () => {
  it("is captioned as what it is, not as something bookable", () => {
    const header = text(<LeaveAfterPendingHeader />);
    expect(header).toContain("After pending");
    expect(header).toContain("Balance once everything asked for is granted");
    expect(header).not.toContain("Available");
  });

  it("still shows HR the negative — an overdrawn balance is a real thing to act on", () => {
    const shown = text(<LeaveAfterPendingCell row={OVERDRAWN} />);
    expect(shown).toContain("-16 h");
    expect(shown).toContain("Asked for more than they have");
  });

  it("paints a negative identity as a warning, and an ordinary one plainly", () => {
    const markup = renderToStaticMarkup(<LeaveFigureCell row={OVERDRAWN} value={-16} /> as never);
    expect(markup).toContain("text-destructive");
    const ordinary = renderToStaticMarkup(<LeaveFigureCell row={row({})} value={16} /> as never);
    expect(ordinary).not.toContain("text-destructive");
  });
});

describe("§5's two rules that outrank tidiness", () => {
  it("renders the WORD for an unlimited policy — no number, no zero, no bar", () => {
    const unlimited = row({ unlimited: true, bookableNow: null, available: null });
    expect(text(<LeaveBookableCell row={unlimited} />)).toBe("Unlimited");
    expect(text(<LeaveAfterPendingCell row={unlimited} />)).toBe("Unlimited");
  });

  it("says a figure was not sent rather than printing a zero nobody computed", () => {
    const silent = row({ bookableNow: null, available: null });
    expect(text(<LeaveBookableCell row={silent} />)).toBe("Not provided");
    expect(text(<LeaveAfterPendingCell row={silent} />)).toBe("Not provided");
  });
});
