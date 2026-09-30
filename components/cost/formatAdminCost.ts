import { formatCost, usdToPoints } from "@ai-matrx/kit/format";
import { currentPointsRate } from "./pointsRate";

/**
 * The points rate for an admin figure: the caller's (a subscribed render path
 * passes `useCostDisplay().rate`), else the viewer's rate read now.
 */
function rateOr(rate: number | null | undefined): number | null {
  return rate === undefined ? currentPointsRate() : rate;
}

export function formatAdminUsd(usd: number | null | undefined): string {
  return formatCost(usd, { unit: "usd", rate: null });
}

export function formatAdminPoints(usd: number | null | undefined, rate?: number | null): string {
  return formatCost(usd, { unit: "points", rate: rateOr(rate) });
}

export function adminCostPoints(usd: number | null | undefined, rate?: number | null): number | null {
  return usdToPoints(usd, { rate: rateOr(rate) });
}

/** Admin ledger values show the charged USD amount beside its points equivalent. */
export function formatAdminCost(
  usd: number | null | undefined,
  options: { short?: boolean; unknown?: string; rate?: number | null } = {},
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) {
    return options.unknown ?? "—";
  }
  return `${formatAdminUsd(usd)} · ${formatCost(usd, { unit: "points", short: options.short, rate: rateOr(options.rate) })}`;
}

/** Compact chart ticks use USD; the surrounding totals show both units. */
export function formatAdminUsdAxisTick(usd: number): string {
  return formatAdminUsd(usd);
}
