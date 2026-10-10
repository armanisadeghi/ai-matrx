import { type CostUnit } from "@ai-matrx/kit/format";
import { formatViewerCost as formatCost } from "@/components/cost/formatAdminCost";
import { currentCostUnit } from "@/components/cost/costUnit";

/** Format runtime execution cost without hiding useful sub-cent precision. */
export function formatRuntimeCost(
  value: number | null | undefined,
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): string {
  return formatCost(value ?? 0, { rate, unit });
}
