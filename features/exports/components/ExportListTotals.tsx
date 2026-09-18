"use client";

// features/exports/components/ExportListTotals.tsx
//
// BOTH NUMBERS, ALWAYS — and the SAME numbers the strip above is showing.
//
// `filtered` is what the filter matches and `total` is the whole export; a
// line that showed only one of them, or showed the rows on screen as if they
// were everything, is the lie this feature is judged on.
//
// 🚨 It is its own component, taking the already-derived `ExportCounts`, for
// defect D6: while it was inline JSX reading the last items response directly,
// it was a SECOND reader of a quantity the summary strip was also rendering,
// and mid-index the two disagreed on screen ("158 of 4,000 … with an
// attachment" beside "WITH A FILE —"). Neither this line nor the strip reads a
// response any more; both render one object (`../counts`).

import { formatExportCount, type ExportCounts } from "../counts";

export function ExportListTotals({ counts }: { counts: ExportCounts }) {
  // Nothing has been read yet. A "0 of 0" here would be a number nobody
  // measured, so the line is simply absent until a read has happened.
  if (counts.filtered.value === null || counts.total.value === null) return null;

  const noun = counts.total.value === 1 ? "item" : "items";

  return (
    <p className="text-xs text-muted-foreground">
      {formatExportCount(
        { ...counts.filtered, partial: false },
        counts.indexing,
      )}{" "}
      of{" "}
      {formatExportCount({ ...counts.total, partial: false }, counts.indexing)}{" "}
      {noun} in this export
      {counts.indexing ? " read so far" : ""}
      {counts.filterDescription ? ` — ${counts.filterDescription}` : ""}
    </p>
  );
}
