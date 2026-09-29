import { formatCost, usdToPoints } from "@ai-matrx/kit/format";

export function formatAdminUsd(usd: number | null | undefined): string {
  return formatCost(usd, { unit: "usd" });
}

export function formatAdminPoints(usd: number | null | undefined): string {
  return formatCost(usd, { unit: "points" });
}

export function adminCostPoints(usd: number | null | undefined): number | null {
  return usdToPoints(usd);
}

/** Admin ledger values show the charged USD amount beside its points equivalent. */
export function formatAdminCost(
  usd: number | null | undefined,
  options: { short?: boolean; unknown?: string } = {},
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) {
    return options.unknown ?? "—";
  }
  return `${formatAdminUsd(usd)} · ${formatCost(usd, { unit: "points", short: options.short })}`;
}

/** Compact chart ticks use USD; the surrounding totals show both units. */
export function formatAdminUsdAxisTick(usd: number): string {
  return formatAdminUsd(usd);
}
