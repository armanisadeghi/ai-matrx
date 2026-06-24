"use client";

/**
 * TableRowsViewer — renders the table_row derivation as ACTUAL TABLES.
 *
 * The table_row derivation emits one rag.kg_chunks row per table row, each
 * carrying metadata { page_number, table_index, row_index, header, cells }.
 * The generic chunk list showed the flat content_text ("PAGE: 1\nTABLE…\n
 * Header: value") which "doesn't look like a table". This viewer groups rows
 * back into their source tables by (page_number, table_index), orders by
 * row_index, and renders a real grid with the column header — page-anchored so
 * the user (and the agent) can see WHERE each table came from.
 */

import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchDerivativeChunks,
  type DerivativeChunkRow,
} from "@/features/rag/api/derivations";
import { ChunkListSkeleton } from "./ChunkList";

interface TableRowMeta {
  page_number?: number;
  table_index?: number;
  row_index?: number;
  header?: Array<string | null> | null;
  cells?: Array<string | null> | null;
}

interface ReconstructedTable {
  key: string;
  page: number;
  tableIndex: number;
  header: string[] | null;
  rows: string[][];
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Group row-chunks back into their source tables. */
function reconstructTables(chunks: DerivativeChunkRow[]): ReconstructedTable[] {
  const groups = new Map<
    string,
    {
      page: number;
      tableIndex: number;
      header: string[] | null;
      rows: Array<{ idx: number; cells: string[] }>;
    }
  >();

  for (const c of chunks) {
    const m = (c.metadata ?? {}) as TableRowMeta;
    const page =
      typeof m.page_number === "number"
        ? m.page_number
        : (c.page_numbers?.[0] ?? 0);
    const tableIndex = typeof m.table_index === "number" ? m.table_index : 0;
    const key = `${page}::${tableIndex}`;
    let g = groups.get(key);
    if (!g) {
      const header = Array.isArray(m.header) ? m.header.map(toStr) : null;
      g = { page, tableIndex, header, rows: [] };
      groups.set(key, g);
    }
    const cells = Array.isArray(m.cells) ? m.cells.map(toStr) : [];
    g.rows.push({
      idx: typeof m.row_index === "number" ? m.row_index : g.rows.length,
      cells,
    });
  }

  return [...groups.values()]
    .map((g) => ({
      key: `${g.page}::${g.tableIndex}`,
      page: g.page,
      tableIndex: g.tableIndex,
      // Drop an all-blank header (mis-detected tables) so we don't show an
      // empty header band.
      header:
        g.header && g.header.some((h) => h.trim().length > 0) ? g.header : null,
      rows: g.rows.sort((a, b) => a.idx - b.idx).map((r) => r.cells),
    }))
    .sort((a, b) => a.page - b.page || a.tableIndex - b.tableIndex);
}

export function TableRowsViewer({
  derivativeId,
  expectedTotal,
  limit = 200,
}: {
  derivativeId: string;
  expectedTotal?: number;
  limit?: number;
}) {
  const [rows, setRows] = useState<DerivativeChunkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchDerivativeChunks(derivativeId, { limit, signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        setRows(res.chunks);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load tables");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [derivativeId, limit]);

  const tables = useMemo(() => reconstructTables(rows), [rows]);

  if (loading) {
    return (
      <div className="space-y-2 p-0.5">
        <ChunkListSkeleton rows={2} />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-[11px] text-destructive px-0.5 py-1">
        Couldn&apos;t load tables: {error}
      </p>
    );
  }
  if (tables.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic px-0.5 py-1">
        No tables found for this representation.
      </p>
    );
  }

  const fetched = rows.length;
  const grandTotal = total || expectedTotal || fetched;

  return (
    <ScrollArea className="max-h-80">
      <div className="space-y-3 p-0.5">
        {tables.map((t) => (
          <div
            key={t.key}
            className="overflow-hidden rounded-md border border-border/60"
          >
            <div className="flex items-center justify-between bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
              <span className="font-medium">
                Table {t.tableIndex + 1} · page {t.page}
              </span>
              <span className="tabular-nums">
                {t.rows.length} row{t.rows.length === 1 ? "" : "s"}
                {t.header ? ` · ${t.header.length} cols` : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                {t.header && (
                  <thead>
                    <tr className="bg-muted/20">
                      {t.header.map((h, i) => (
                        <th
                          key={i}
                          className="border border-border/40 px-2 py-1 text-left align-top font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {t.rows.map((row, ri) => (
                    <tr key={ri} className="even:bg-muted/10">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="whitespace-pre-wrap break-words border border-border/40 px-2 py-1 align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {grandTotal > fetched && (
          <p className="text-[10px] italic text-muted-foreground">
            Showing the first {fetched.toLocaleString()} of{" "}
            {grandTotal.toLocaleString()} rows ({tables.length} tables). Larger
            tables continue beyond this preview.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
