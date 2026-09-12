/**
 * Pie-slice label text for <ChartCanvas>'s recharts <Pie label={...}>.
 *
 * Extracted from the inline arrow so it can be tested without pulling
 * recharts into the Jest module graph.
 */

export interface PieSliceLabelInput {
  name?: string;
  percent?: number;
}

export function pieSliceLabel(e: PieSliceLabelInput): string {
  return `${e.name ?? ""} ${e.percent != null ? Math.round(e.percent * 100) : 0}%`;
}
