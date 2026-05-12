/**
 * TablesContent — renders the actual table cell data as HTML tables, not JSON.
 *
 * Each detected table becomes a card with its page number, dimensions, a
 * fully rendered grid, and a copy-as-markdown button. Falls back to the
 * server-provided markdown when the cells array is empty.
 */

"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";
import {
  asObject,
  findResult,
  type TableCellPayload,
  type TablePayload,
  type TablesPayload,
} from "./utils";

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
}

export function TablesContent({ results, onJumpToPage }: Props) {
  const result = findResult(results, "tables");
  const payload = asObject<TablesPayload>(result?.payload);
  const tables = payload?.tables ?? [];

  if (!tables.length) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        No tables detected in this document.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tables.map((t, idx) => (
        <TableCard key={`${t.page_number}-${idx}`} table={t} onJumpToPage={onJumpToPage} />
      ))}
    </div>
  );
}

function TableCard({
  table,
  onJumpToPage,
}: {
  table: TablePayload;
  onJumpToPage?: (page: number) => void;
}) {
  const grid = useGridFromCells(table.cells, table.row_count, table.col_count);

  return (
    <div className="rounded border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">
          Table · {table.row_count} × {table.col_count}
        </span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] uppercase tracking-wider text-muted-foreground">
          page {table.page_number}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onJumpToPage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onJumpToPage(table.page_number)}
              className="h-7 text-[10px]"
            >
              Open page
            </Button>
          ) : null}
          {table.markdown ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(table.markdown ?? "")
              }
              className="h-7 text-[10px]"
            >
              <Copy className="h-3 w-3 mr-1" /> Copy md
            </Button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {grid.length ? (
          <table className="w-full table-fixed border-collapse text-[11px]">
            <tbody>
              {grid.map((row, ri) => (
                <tr
                  key={ri}
                  className={cn(
                    ri === 0 ? "bg-muted/40 font-medium" : "",
                  )}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="break-words border border-border/60 px-2 py-1 align-top"
                    >
                      {cell ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : table.markdown ? (
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-snug">
            {table.markdown}
          </pre>
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No cell data for this table.
          </div>
        )}
      </div>
    </div>
  );
}

function useGridFromCells(
  cells: TableCellPayload[],
  rowCount: number,
  colCount: number,
): (string | null)[][] {
  if (!cells.length) return [];
  const r = Math.max(rowCount, 0);
  const c = Math.max(colCount, 0);
  if (!r || !c) {
    const maxR = cells.reduce((m, x) => Math.max(m, x.row), 0) + 1;
    const maxC = cells.reduce((m, x) => Math.max(m, x.col), 0) + 1;
    return _build(cells, maxR, maxC);
  }
  return _build(cells, r, c);
}

function _build(
  cells: TableCellPayload[],
  r: number,
  c: number,
): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: r }, () =>
    Array.from({ length: c }, () => null),
  );
  for (const cell of cells) {
    if (cell.row < r && cell.col < c) {
      grid[cell.row][cell.col] = cell.text ?? null;
    }
  }
  return grid;
}
