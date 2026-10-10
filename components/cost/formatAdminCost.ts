import { formatCost, formatUsd, usdToPoints, type CostOptions } from "@ai-matrx/kit/format";

// THE RATE IS ALWAYS THE CALLER'S (lane DRILL-CLOSE, VERIFY-DRILL-FINAL L-b). These used to fall back
// to `currentPointsRate()` when no rate was passed. That read is a one-shot peek: on a miss it answers
// null and never re-renders, so a panel whose data landed before the knob snapshot printed
// "$0.0204 · —" for good (the slim spend page's batch savings and estimated cost). The rate is now a
// required argument: a render path passes the SUBSCRIBED rate (`usePointsRate()` /
// `useCostDisplay().rate`), and only code that runs outside render (copy text, a toast) passes
// `currentPointsRate()` — by name, where a reader can see it.

/**
 * SPEND READS IN CENTS (Arman, 2026-10-10: "round everything to only 2 decimal places so 0.01 is
 * the lowest … For spend, always display rounded to the nearest cent."). Every dollar figure an
 * admin reads — a tile, a table cell, a tooltip — is the nearest cent. A real amount under half a
 * cent reads "<$0.01", never a confident "$0.00" (law 4). The one exception is a PRICE someone
 * types or compares (a model's per-token rate): pass `digits: "price"` for the exact figure.
 */
export function formatSpendUsd(usd: number | null | undefined, unknown = "—"): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return unknown;
  if (usd !== 0 && Math.abs(usd) < 0.005) return usd > 0 ? "<$0.01" : "−<$0.01";
  return formatUsd(usd, { digits: 2 });
}

/**
 * THE frontend's `formatCost`: the kit's, except dollars read in cents ({@link formatSpendUsd}).
 * Same signature, so a call site swaps its import and nothing else. The kit pads a per-call cost to
 * six decimals ("$0.003766"); an admin reads spend in cents.
 */
export function formatViewerCost(usd: number | null | undefined, options: CostOptions): string {
  if (options.unit === "usd") return formatSpendUsd(usd, options.unknown ?? "—");
  return formatCost(usd, options);
}

/**
 * `digits: "whole"` is the THRESHOLD voice — a limit an admin set ("Under $1", "Avg run > $0.50"),
 * where the per-call precision would print "$1.00" / "$0.5000".
 */
export function formatAdminUsd(usd: number | null | undefined, options: { digits?: "whole" | "price" } = {}): string {
  if (options.digits === "whole") return formatUsd(usd, { digits: "whole" });
  if (options.digits === "price") return formatUsd(usd, { digits: "trim" });
  return formatSpendUsd(usd);
}

export function formatAdminPoints(usd: number | null | undefined, rate: number | null): string {
  return formatCost(usd, { unit: "points", rate });
}

export function adminCostPoints(usd: number | null | undefined, rate: number | null): number | null {
  return usdToPoints(usd, { rate });
}

/** Admin ledger values show the charged USD amount beside its points equivalent. */
export function formatAdminCost(
  usd: number | null | undefined,
  options: {
    rate: number | null;
    short?: boolean;
    unknown?: string;
    /** `"price"` for a rate someone compares (a model's per-token price): the exact figure, not cents. */
    usdDigits?: "price";
  },
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) {
    return options.unknown ?? "—";
  }
  const usdText = formatAdminUsd(usd, { digits: options.usdDigits });
  return `${usdText} · ${formatCost(usd, { unit: "points", short: options.short, rate: options.rate })}`;
}

/** Compact chart ticks use USD; the surrounding totals show both units. */
export function formatAdminUsdAxisTick(usd: number): string {
  return formatAdminUsd(usd);
}
