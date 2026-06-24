"use client";

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
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {Array.from({ length: colCount }).map((_, ci) => {
                const cell = Array.isArray(row) ? row[ci] : undefined;
                return (
                  <td
                    key={ci}
                    className="max-w-[220px] truncate whitespace-nowrap border border-border px-2 py-1 text-foreground"
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
