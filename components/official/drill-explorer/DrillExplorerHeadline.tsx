// components/official/drill-explorer/DrillExplorerHeadline.tsx — THE HEADER'S HEADLINE
// (lane DRILL-WAVE1-FIXES, VERIFY-DRILL-WAVE1 F1).
//
// At 390 px the title and the total shared one shrinking row and broke mid-word ("AI usag / e",
// "47,884,9 / 79 points"). The headline is two kinds of thing: the NAME and the NUMBER, which never
// break and stay on one line together, and the secondary facts (the window, where it starts, the
// other Measures), each an unbreakable unit that wraps to the next line as a whole. Linear's and
// Stripe's dashboard headers reflow the same way: the metric never splits, its context wraps.

import type { ReactNode } from "react";

export function DrillExplorerHeadline({
  title,
  total,
  facts,
}: {
  title: string;
  /** The headline number, formatted ("47,884,979 points"). */
  total: string;
  /** Secondary facts, in order ("Last 30 days", "from Aug 31, 11:00 PM", "6,247 requests"); each wraps whole. */
  facts: ReadonlyArray<{ key: string; content: ReactNode; title?: string; attrs?: Record<string, string> }>;
}) {
  return (
    <div data-drill-explorer-headline className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <div className="flex shrink-0 items-baseline gap-3">
        <h1 className="whitespace-nowrap text-sm font-semibold">{title}</h1>
        <span data-drill-explorer-total className="whitespace-nowrap text-2xl font-semibold tabular-nums">
          {total}
        </span>
      </div>
      {facts.length > 0 ? (
        <ul data-drill-explorer-facts className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
          {facts.map((fact, i) => (
            <li key={fact.key} title={fact.title} {...fact.attrs} className="whitespace-nowrap">
              {i > 0 ? <span aria-hidden="true">· </span> : null}
              {fact.content}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A cost column's header: the Measure's name and the unit word its cells print (VERIFY-DRILL-WAVE1
 * F9 — the header said "credits" over cells saying "points"). The platform's cost formatter
 * (`formatCost` in @ai-matrx/kit) prints "points"; when it prints "credits", this follows it.
 */
export function costColumnLabel(label: string, unit: "points" | "usd"): string {
  return unit === "usd" ? `${label} ($)` : `${label} (points)`;
}
