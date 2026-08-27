"use client";

/**
 * features/hr/exports/money.tsx — THE ONE RULE for rendering an export's money, so the list and the
 * panel cannot drift apart. (Coordinator ruling, 2026-08-27: "align the list and panel on this one
 * rule".)
 *
 * ═══ THERE ARE THREE STATES, NOT TWO, AND CONFLATING ANY OF THEM IS THE DEFECT ═════════════════
 *
 * The contract makes the distinction for us, and it makes it in the KEY, not in the value:
 *
 *   1. **The key is ABSENT** → the reader has no pay authority. The slot does not render: no label,
 *      no cell, no reserved space. **Absent, not disabled, not masked** (SPEC-UI-IA §4.2, and D19's
 *      pay wall). This is the whole point — an empty box labelled "Total amount" advertises that
 *      there is a figure here you are not allowed to see, which is a disclosure, not a redaction.
 *
 *   2. **The key is PRESENT and the value is `null`** → the reader may see money, but this figure
 *      was WITHHELD: a jurisdiction rule that contributes to it is still `advisory`, so the server
 *      refuses to compute it. 🚨 **This renders as a SENTENCE. Never a dash, never a zero.** The
 *      hours are correct and are payable, and the person reading needs to be told that in words —
 *      a bare "—" says "nothing here", and a "0.00" says "this costs nothing", and both are lies
 *      about a payroll figure.
 *
 *   3. **The key is present with a value** → the server's decimal STRING, verbatim.
 *
 * 🚨 WHY THIS DOES NOT CONSUME `MoneyAmount` FROM `features/hr/time/shared/MoneyAndFlags.tsx`,
 * WHICH IS THE OBVIOUS REUSE AND WOULD BE WRONG HERE.
 * That component is lane L3's canonical withheld-money renderer and its SENTENCE is deliberately
 * echoed below so the two surfaces speak with one voice. But its input type is
 * `MoneyBearing { amount: number | null }` — a **float**. Handing it a payroll total means
 * `Number("241880.12")`, and binary floating point cannot represent that value. Parsing a payroll
 * decimal to render it is the precise defect this lane's first law forbids, so the wording is
 * reused and the type is not.
 * ⚠️ DEBT (both lane owners): `MoneyBearing.amount` should carry the decimal string, at which point
 * this module collapses into `MoneyAmount` and this comment is deleted rather than reconciled.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Does this payload carry money for this reader at all?
 *
 * 🚨 A KEY-PRESENCE TEST (`in`), NEVER A TRUTHINESS OR NULL CHECK — the same test
 * `features/hr/shared/useVisibleFields.ts` makes, for the same reason. The server OMITS the key for
 * a reader without pay authority; a reader who may see money still sees the slot when the value
 * happens to be withheld. `value == null` cannot tell those two apart, and they are the difference
 * between "you are not allowed to know" and "nobody could compute it".
 */
export function hasAmountAuthority(
  source: object,
  key: string = "total_amount",
): boolean {
  return key in source;
}

/** The withheld sentence, echoing `PostLockAdjustments` word-for-word so HR reads as one product. */
export const AMOUNT_WITHHELD_SENTENCE =
  "The hours are correct and are payable. No amount is shown because a rule that contributes " +
  "to it is still awaiting verification — we will not print a figure we cannot stand behind.";

const WITHHELD_TONE =
  "text-amber-700 dark:text-amber-400";

/**
 * One money value, in a cell or a definition list.
 *
 * Call it ONLY after {@link hasAmountAuthority} has said the slot may exist at all — this component
 * deliberately cannot render state 1, because "absent" means the caller renders no element, and a
 * component that returned `null` would still have occupied a `<td>` or a `<dd>`.
 */
export function ExportAmount({
  value,
  className,
}: {
  /** The server's decimal string, or `null` when the figure was withheld. */
  value: string | null | undefined;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs font-medium", WITHHELD_TONE, className)}
        title={AMOUNT_WITHHELD_SENTENCE}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Not calculated
      </span>
    );
  }
  // The server's own figure, character for character. No parsing, no re-formatting, no separators.
  return <span className={cn("font-mono", className)}>{value}</span>;
}

/** The full sentence, for a surface that has room to say it once rather than per cell. */
export function AmountWithheldNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed",
        WITHHELD_TONE,
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{AMOUNT_WITHHELD_SENTENCE}</span>
    </p>
  );
}
