import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { gscMetricCopyLines } from "@/features/marketing/search-console/lib/columns";
import {
  formatPosition,
  type GscBreakdownRow,
  type GscDimension,
} from "@/features/marketing/search-console/types";

/**
 * The live RPC can return null when Google has no measurable placement for a
 * breakdown row, even though the generated Postgres return type is non-null.
 * Keep that transport drift contained at the report presentation boundary.
 */
export type ReportBreakdownRow = Omit<
  GscBreakdownRow,
  "avg_position" | "cmp_avg_position"
> & {
  avg_position: number | null;
  cmp_avg_position: number | null;
};

export function formatReportPlacement(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "Not available"
    : `#${formatPosition(value)}`;
}

export function reportPlacementSentence(
  value: number | null | undefined,
): string {
  return value === null || value === undefined
    ? "placement unavailable"
    : `usually result ${formatReportPlacement(value)}`;
}

export function buildReportRowCopy(
  label: string,
  dimension: GscDimension,
  row: ReportBreakdownRow,
) {
  return webCopy({
    kind: "web-search-report-row",
    label,
    description: `${label} from the client Search Console report.`,
    surface: "Marketing Reports",
    data: row,
    lines: gscMetricCopyLines(label, dimension, row),
  });
}
