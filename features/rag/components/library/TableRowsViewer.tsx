"use client";

/**
 * TableRowsViewer — renders the table_row derivation as ACTUAL TABLES, full size.
 *
 * The table_row derivation emits one rag.kg_chunks row per table row, each
 * carrying metadata { page_number, table_index, row_index, header, cells }.
 * This viewer fetches EVERY row (paginated — not a 200-row teaser), groups rows
 * back into their source tables by (page_number, table_index), orders by
 * row_index, and renders real grids with the column header — page-anchored so
 * the user (and the agent) can see WHERE each table came from. Built to live in
 * a full-screen surface (DerivativeResultsDialog), not a cramped card.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  fetchDerivativeChunks,
  type DerivativeChunkRow,
} from "@/features/rag/api/derivations";

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

/** Hard ceiling on rows we pull into the browser at once. Loud, not silent. */
const MAX_ROWS = 5000;
const PAGE_SIZE = 500; // backend caps /chunks limit at 500

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
}: {
  derivativeId: string;
  expectedTotal?: number;
}) {
  const [rows, setRows] = useState<DerivativeChunkRow[]>([]);
  const [total, setTotal] = useState(expectedTotal ?? 0);
  const [loaded, setLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch EVERY row, page by page (the backend caps a single call at 500).
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setRows([]);
    setLoaded(0);
    setCapped(false);

    (async () => {
      try {
        const all: DerivativeChunkRow[] = [];
        let offset = 0;
        let grand = 0;
        for (;;) {
          const res = await fetchDerivativeChunks(derivativeId, {
            limit: PAGE_SIZE,
            offset,
            signal: ac.signal,
          });
          if (cancelled) return;
          all.push(...res.chunks);
          grand = res.total || grand;
          offset += res.chunks.length;
          setLoaded(all.length);
          setTotal(grand || all.length);
          if (res.chunks.length < PAGE_SIZE || offset >= grand) break;
          if (all.length >= MAX_ROWS) {
            setCapped(true);
            break;
          }
        }
        if (!cancelled) setRows(all);
      } catch (err) {
        if (!cancelled && !ac.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load tables");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [derivativeId]);

  const tables = useMemo(() => reconstructTables(rows), [rows]);

  // Filter: keep a table if its header matches (show all its rows) or any row
  // matches (show only matching rows).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    const out: ReconstructedTable[] = [];
    for (const t of tables) {
      const headerHit = t.header?.some((h) => h.toLowerCase().includes(q));
      if (headerHit) {
        out.push(t);
        continue;
      }
      const matchRows = t.rows.filter((r) =>
        r.some((c) => c.toLowerCase().includes(q)),
      );
      if (matchRows.length > 0) out.push({ ...t, rows: matchRows });
    }
    return out;
  }, [tables, query]);

  const shownRows = filtered.reduce((n, t) => n + t.rows.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cells across all tables…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
          {loading
            ? `Loading ${loaded.toLocaleString()}${total ? ` / ${total.toLocaleString()}` : ""} rows…`
            : `${tables.length.toLocaleString()} tables · ${shownRows.toLocaleString()}${
                query ? ` of ${rows.length.toLocaleString()}` : ""
              } rows`}
        </span>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
        {error ? (
          <p className="px-1 py-2 text-xs text-destructive">
            Couldn&apos;t load tables: {error}
          </p>
        ) : loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading all rows…
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8 opacity-40" />
            <p className="text-sm">No tables found for this representation.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No rows match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className="space-y-4">
            {capped && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                Showing the first {MAX_ROWS.toLocaleString()} rows of{" "}
                {total.toLocaleString()} — use search to find specific rows.
              </div>
            )}
            {filtered.map((t) => (
              <div
                key={t.key}
                className="overflow-hidden rounded-lg border border-border/60 bg-card"
              >
                <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 text-[11px]">
                  <span className="font-medium text-foreground/80">
                    Table {t.tableIndex + 1}{" "}
                    <span className="font-normal text-muted-foreground">
                      · page {t.page}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.rows.length} row{t.rows.length === 1 ? "" : "s"}
                    {t.header ? ` · ${t.header.length} cols` : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    {t.header && (
                      <thead>
                        <tr className="bg-muted/20">
                          {t.header.map((h, i) => (
                            <th
                              key={i}
                              className="sticky top-0 border border-border/40 bg-muted/60 px-2 py-1.5 text-left align-top font-semibold"
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
          </div>
        )}
      </div>
    </div>
  );
}
