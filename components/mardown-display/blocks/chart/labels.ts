/**
 * Pie-slice label text for <ChartCanvas>'s recharts <Pie label={...}>.
 *
 * A SCREEN NEVER LIES. Recharts omits `percent` whenever it cannot compute
 * one — an all-zero data set, a non-numeric `dataKey`, a slice rendered
 * before the sum is known. The original label read
 * `e.percent != null ? Math.round(e.percent * 100) : 0` and printed "0%",
 * which tells the reader the slice is empty when the truth is that nobody
 * knows its share. Unknown reads as the em-dash (the fleet convention set by
 * `formatFileSize` in `@ai-matrx/kit/format`); a slice whose share is REALLY
 * zero still prints "0%".
 *
 * Lives in its own module rather than inline so it can be tested without
 * pulling recharts into the Jest module graph.
 */

import { formatPercentFromFraction } from "@/lib/format/honest";

export interface PieSliceLabelInput {
  name?: string;
  percent?: number;
}

export function pieSliceLabel(e: PieSliceLabelInput): string {
  return `${e.name ?? ""} ${formatPercentFromFraction(e.percent)}`;
}
