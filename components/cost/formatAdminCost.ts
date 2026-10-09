import { formatCost, formatUsd, usdToPoints } from "@ai-matrx/kit/format";

// THE RATE IS ALWAYS THE CALLER'S (lane DRILL-CLOSE, VERIFY-DRILL-FINAL L-b). These used to fall back
// to `currentPointsRate()` when no rate was passed. That read is a one-shot peek: on a miss it answers
// null and never re-renders, so a panel whose data landed before the knob snapshot printed
// "$0.0204 · —" for good (the slim spend page's batch savings and estimated cost). The rate is now a
// required argument: a render path passes the SUBSCRIBED rate (`usePointsRate()` /
// `useCostDisplay().rate`), and only code that runs outside render (copy text, a toast) passes
// `currentPointsRate()` — by name, where a reader can see it.

/**
 * `digits: "whole"` is the THRESHOLD voice — a limit an admin set ("Under $1", "Avg run > $0.50"),
 * where the per-call precision would print "$1.00" / "$0.5000".
 */
export function formatAdminUsd(usd: number | null | undefined, options: { digits?: "whole" } = {}): string {
  if (options.digits === "whole") return formatUsd(usd, { digits: "whole" });
  return formatCost(usd, { unit: "usd", rate: null });
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
    /** `"trim"` for a figure that is not a per-call cost (an allowance estimate): `$0.50`, not `$0.5000`. */
    usdDigits?: "adaptive" | "trim";
  },
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) {
    return options.unknown ?? "—";
  }
  const usdText =
    options.usdDigits === "trim" ? formatUsd(usd, { digits: "trim" }) : formatAdminUsd(usd);
  return `${usdText} · ${formatCost(usd, { unit: "points", short: options.short, rate: options.rate })}`;
}

/** Compact chart ticks use USD; the surrounding totals show both units. */
export function formatAdminUsdAxisTick(usd: number): string {
  return formatAdminUsd(usd);
}
