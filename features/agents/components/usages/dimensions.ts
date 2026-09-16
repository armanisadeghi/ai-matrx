/**
 * The DIMENSIONS the Find Usages surface watches — every kind of place an
 * agent can be used from, in ONE list, so the counts strip can show every one
 * of them (including zero) and nobody has to guess whether a dimension is
 * empty or merely unshown.
 *
 * `mandate` is the one dimension that is NOT an `AgentUsageType`: mandates are
 * graded by the server's impact read (`features/mandates/admin/impact.ts`),
 * not by the `agx_usage_scan` RPC. This list is where the two meet.
 */

import { Briefcase, History, type LucideIcon } from "lucide-react";
import type { AgentUsageType } from "@/features/agents/redux/usages/usages.types";
import { USAGE_TYPE_META, USAGE_TYPE_ORDER } from "./usageTypeMeta";

export type UsageDimension = AgentUsageType | "mandate";

export interface DimensionMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
}

export const DIMENSION_META: Record<UsageDimension, DimensionMeta> = {
  mandate: { label: "Mandate", plural: "Mandates", icon: Briefcase },
  ...USAGE_TYPE_META,
};

/**
 * Display order — mandates first (the dimension the agent-change-impact
 * mandate was about), then the usage types in their existing order.
 */
export const DIMENSION_ORDER: readonly UsageDimension[] = [
  "mandate",
  ...USAGE_TYPE_ORDER,
];

/** The historical tile — context only, never drift-checked. */
export const HISTORY_TILE = { label: "History", icon: History } as const;

export function dimensionMeta(dimension: UsageDimension): DimensionMeta {
  return DIMENSION_META[dimension];
}
