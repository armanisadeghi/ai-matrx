import { formatCost } from "@ai-matrx/kit/format";

/** Admin ledger values show the charged USD amount beside its points equivalent. */
export function formatAdminCost(
  usd: number | null | undefined,
  options: { short?: boolean; unknown?: string } = {},
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) {
    return options.unknown ?? "—";
  }
  return `${formatCost(usd, { unit: "usd" })} · ${formatCost(usd, { unit: "points", short: options.short })}`;
}

/** Compact chart ticks use USD; the surrounding totals show both units. */
export function formatAdminUsdAxisTick(usd: number): string {
  return formatCost(usd, { unit: "usd" });
}
