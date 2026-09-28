import { formatCost, type CostUnit } from "@ai-matrx/kit/format";

/** Format runtime execution cost without hiding useful sub-cent precision. */
export function formatRuntimeCost(
  value: number | null | undefined,
  unit: CostUnit = "points",
): string {
  return formatCost(value ?? 0, { unit });
}
