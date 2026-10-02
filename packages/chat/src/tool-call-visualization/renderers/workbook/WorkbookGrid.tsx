"use client";

import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE,
} from "@/components/official/mobile-table/mobileTable";

/**
 * Light read-only grid for a workbook sheet's raw cell values. Used by the
 * workbook tool inline (tiny) + overlay (larger). The full editable spreadsheet
 * is the Univer `WorkbookEditor` at the `/workbooks/[id]` route — too heavy to
 * embed in a chat surface, so we render the real values as a clean grid here.
 */
export function WorkbookGrid({
  values,
  maxRows = 8,
  maxCols = 8,
}: {
  values: unknown[][];
  maxRows?: number;
  maxCols?: number;
}) {
  const rows = values.slice(0, maxRows);
  const colCount = Math.min(
    maxCols,
    rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0),
  );

  if (!rows.length || colCount === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Empty sheet
      </div>
    );
  }

  const truncated =
    values.length > maxRows ||
    rows.some((r) => Array.isArray(r) && r.length > maxCols);

  return (
    <div className="overflow-auto">
      {/* Mobile-first: below `sm` the table sizes to its CONTENT (w-max) so
          this container scrolls it horizontally instead of every column
          being crushed under a 100%-width table, and column A freezes
          (spreadsheet convention) so a row stays identifiable while
          scrolling. `sm:` restores the exact desktop rendering. */}
      <table className={cn("border-collapse text-xs", MOBILE_TABLE)}>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {Array.from({ length: colCount }).map((_, ci) => {
                const cell = Array.isArray(row) ? row[ci] : undefined;
                return (
                  <td
                    key={ci}
                    className={cn(
                      "sm:max-w-[220px] sm:truncate whitespace-nowrap border border-border px-2 py-1 text-foreground",
                      ci === 0 &&
                        "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-card",
                    )}
                  >
                    {cell == null ? "" : String(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated ? (
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          Showing {rows.length} × {colCount} (truncated)
        </div>
      ) : null}
    </div>
  );
}
