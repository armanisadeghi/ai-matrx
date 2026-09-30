/**
 * features/action-requests/components/spendAmount.ts
 *
 * The amount a person approves on an `approve_spend` ask, in THEIR unit.
 *
 * Arman, 2026-09-27: people see points, never dollars; only a system admin who
 * flipped "Show costs in dollars" sees $. The server records the approval in
 * USD (`ApproveSpendResult.approved_amount_usd`, stored to the cent), so a
 * member types POINTS and this module converts at the one platform rate
 * (`@ai-matrx/kit/format`). The USD is rounded UP to the cent, so what the
 * server records is never below what the person typed.
 */

import { POINTS_PER_USD, usdToPoints, type CostUnit } from "@ai-matrx/kit/format";

/** aidream's own ceiling on one approval (`ApproveSpendResult.approved_amount_usd`). */
export const MAX_APPROVAL_USD = 100_000;

/** Up to the next whole cent, with float noise snapped away first. */
export function centsUp(usd: number): number {
  return Math.ceil(Math.round(usd * 1_000_000) / 10_000) / 100;
}

/** The text the amount box starts with: whole points, or dollars to the cent. */
export function initialAmountText(usd: number, unit: CostUnit): string {
  return unit === "usd" ? usd.toFixed(2) : String(usdToPoints(usd) ?? 0);
}

/**
 * Typed text → the USD the server records, or `null` when it is not an amount.
 * Dollars: up to two decimals; "$", spaces and commas forgiven. Points: whole
 * numbers; commas, spaces and a trailing "points"/"pts" forgiven.
 */
export function parseApprovalUsd(text: string, unit: CostUnit): number | null {
  if (unit === "usd") {
    const cleaned = text.replace(/[\s$,]/g, "");
    if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) && value <= MAX_APPROVAL_USD ? value : null;
  }
  const cleaned = text.replace(/[\s,]/g, "").replace(/(points?|pts)$/i, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const usd = centsUp(Number(cleaned) / POINTS_PER_USD);
  return Number.isFinite(usd) && usd <= MAX_APPROVAL_USD ? usd : null;
}
