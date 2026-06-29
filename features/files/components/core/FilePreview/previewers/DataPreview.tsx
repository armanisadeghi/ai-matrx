/**
 * features/files/components/core/FilePreview/previewers/DataPreview.tsx
 *
 * Tabular preview for structured data files: CSV, TSV, JSON (array-of-objects),
 * and Excel (XLSX/XLS) — restored from the legacy
 * `components/ui/file-preview/previews/DataPreview.tsx` and rewritten to use
 * semantic Tailwind tokens (`bg-card`, `text-foreground`, etc.) instead of
 * the legacy hard-coded gray scales.
 *
 * Behaviour matrix:
 *   csv / tsv  → PapaParse → tabular view (search + sort + paginate)
 *   xlsx / xls → SheetJS dynamic-import → multi-sheet selector + tabular view
 *   json       → array-of-objects → tabular view; otherwise pretty-printed JSON
 *
 * The fetch pipeline mirrors PdfPreview's posture: any HTTP/network failure
 * shows a recoverable error card with an "Open in new tab" fallback that
 * uses the (still-valid) signed URL we have. The previewer never throws —
 * `<PreviewErrorBoundary/>` is the last-resort net for parse-time crashes.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  Copy,
  Database,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Search,
} from "lucide-react";
import Papa from "papaparse";
import { cn } from "@/lib/utils";
import { extname } from "@/features/files/utils/path";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";

const ROWS_PER_PAGE = 25;

export interface DataPreviewProps {
  fileId: string;
  fileName: string;
  className?: string;
}

type Row = Record<string, unknown>;

type DataKind = "json" | "csv" | "tsv" | "xlsx" | "unknown";

function detectKind(fileName: string): DataKind {
  const ext = extname(fileName).toLowerCase();
  if (ext === "json") return "json";
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return "unknown";
}

export function DataPreview({ fileId, fileName, className }: DataPreviewProps) {
  const kind = useMemo(() => detectKind(fileName), [fileName]);

  // Same-origin blob via the Python download endpoint — no S3 CORS to fight.
  const { blob, loading: blobLoading, error: blobError } = useFileBlob(fileId);

  // Tabular state
  const [data, setData] = useState<Row[] | null>(null);
  const [jsonRaw, setJsonRaw] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(true);

  // XLSX-specific
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");

  // Table UI state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [copied, setCopied] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadJson = useCallback(async (b: Blob) => {
    const text = await b.text();
    setJsonRaw(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON we can table-render — keep raw for the JSON view path.
      setData(null);
      return;
    }
    if (Array.isArray(parsed)) {
      setData(parsed as Row[]);
      return;
    }
    if (parsed && typeof parsed === "object") {
      const arrayProp = Object.values(parsed as Record<string, unknown>).find(
        (v) => Array.isArray(v),
      );
      if (Array.isArray(arrayProp)) {
        setData(arrayProp as Row[]);
        return;
      }
      setData([parsed as Row]);
      return;
    }
    setData(null);
  }, []);

  const loadDelimited = useCallback(async (b: Blob, delimiter: string) => {
    const text = await b.text();
    const parsed = Papa.parse<Row>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimiter,
    });
    if (parsed.errors.length) {
      // eslint-disable-next-line no-console
      console.warn("[DataPreview] parse warning:", parsed.errors[0]);
    }
    setData(parsed.data);
  }, []);

  const loadXlsx = useCallback(async (b: Blob, sheetName?: string) => {
    // SheetJS is heavy (~600KB) — only pull it in when an Excel file is
    // actually opened. The dynamic import is a separate chunk.
    const XLSX = await import("xlsx");
    const buf = await b.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });

    const names = wb.SheetNames ?? [];
    if (names.length === 0) {
      setSheetNames([]);
      setActiveSheet("");
      setData([]);
      return;
    }
    setSheetNames(names);
    const sheet = sheetName && names.includes(sheetName) ? sheetName : names[0];
    setActiveSheet(sheet);

    const ws = wb.Sheets[sheet];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    if (aoa.length === 0) {
      setData([]);
      return;
    }
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? ""));
    const rows: Row[] = aoa.slice(1).map((row) => {
      const obj: Row = {};
      const arr = row as unknown[];
      headers.forEach((h, i) => {
        obj[h || `col${i + 1}`] = arr[i] ?? null;
      });
      return obj;
    });
    setData(rows);
  }, []);

  // ── Effect: initial load ─────────────────────────────────────────────────

  useEffect(() => {
    if (!blob) return undefined;
    let cancelled = false;
    setParsing(true);
    setParseError(null);
    setData(null);
    setJsonRaw(null);
    setPage(1);
    setSortKey(null);
    setSortDir("asc");

    const run = async () => {
      try {
        if (kind === "json") {
          await loadJson(blob);
        } else if (kind === "csv") {
          await loadDelimited(blob, ",");
        } else if (kind === "tsv") {
          await loadDelimited(blob, "\t");
        } else if (kind === "xlsx") {
          await loadXlsx(blob);
        } else {
          throw new Error(`Unsupported data format: ${detectKind(fileName)}`);
        }
      } catch (err) {
        if (cancelled) return;
        setParseError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setParsing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [blob, kind, loadJson, loadDelimited, loadXlsx, fileName]);

  const error = parseError ?? blobError;
  const loading = blobLoading || parsing;

  // ── XLSX: sheet swap ─────────────────────────────────────────────────────

  const onSwitchSheet = useCallback(
    async (sheet: string) => {
      if (!blob || kind !== "xlsx") return;
      setParsing(true);
      try {
        await loadXlsx(blob, sheet);
      } catch (err) {
        setParseError(extractErrorMessage(err));
      } finally {
        setParsing(false);
      }
    },
    [blob, kind, loadXlsx],
  );

  // ── Sort + filter + paginate ─────────────────────────────────────────────

  const headers = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      Object.values(row).some((v) =>
        v == null ? false : String(v).toLowerCase().includes(q),
      ),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return -dir;
      if (bv == null) return dir;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return sorted.slice(start, start + ROWS_PER_PAGE);
  }, [sorted, page]);

  const onSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const onCopyJson = useCallback(async () => {
    const payload = jsonRaw ?? (data ? JSON.stringify(data, null, 2) : null);
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable in non-secure context */
    }
  }, [jsonRaw, data]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/20",
          className,
        )}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
          className,
        )}
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Couldn&apos;t load this file</h3>
          <p className="max-w-md text-xs text-muted-foreground break-words">
            {error}
          </p>
        </div>
      </div>
    );
  }

  // JSON whose top level wasn't an array — show pretty-printed JSON view.
  if (kind === "json" && (!data || data.length === 0) && jsonRaw) {
    return (
      <div className={cn("flex h-full w-full flex-col bg-card", className)}>
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">JSON</span>
          </div>
          <button
            type="button"
            onClick={() => void onCopyJson()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-muted/30 p-3 text-xs leading-5 font-mono whitespace-pre-wrap break-words">
          {pretty(jsonRaw)}
        </pre>
      </div>
    );
  }

  // Tabular path (CSV, TSV, JSON-array, XLSX)
  return (
    <div className={cn("flex h-full w-full flex-col bg-card", className)}>
      {/* Header bar */}
      <div className="border-b border-border bg-muted/30 px-2 py-1.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {kind === "json" ? (
              <FileJson className="h-4 w-4 text-amber-500" />
            ) : kind === "xlsx" ? (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            ) : (
              <Database className="h-4 w-4 text-orange-500" />
            )}
            <span className="text-sm font-medium uppercase">
              {kind === "json" ? "JSON" : kind}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length.toLocaleString()} rows
              {search
                ? ` (filtered from ${data?.length.toLocaleString() ?? 0})`
                : ""}
            </span>
          </div>

          {sheetNames.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Sheet:</span>
              <div className="relative">
                <select
                  value={activeSheet}
                  onChange={(e) => void onSwitchSheet(e.target.value)}
                  className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter…"
                className="w-44 rounded-md border border-border bg-background pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="button"
              onClick={() => void onCopyJson()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Copy as JSON"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {headers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No rows.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted z-10">
              <tr>
                {headers.map((h) => {
                  const active = sortKey === h;
                  return (
                    <th
                      key={h}
                      className="border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => onSort(h)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-primary",
                          active && "text-primary",
                        )}
                      >
                        <span className="normal-case">{h || "(empty)"}</span>
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3 transition-transform",
                            active && sortDir === "desc" && "rotate-180",
                            !active && "opacity-30",
                          )}
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border/60 hover:bg-muted/40"
                >
                  {headers.map((h) => {
                    const v = row[h];
                    const empty = v === null || v === undefined || v === "";
                    return (
                      <td
                        key={h}
                        className={cn(
                          "px-3 py-1.5 align-top text-xs whitespace-nowrap max-w-[28ch] truncate",
                          empty && "text-muted-foreground",
                        )}
                        title={empty ? "—" : String(v)}
                      >
                        {empty ? "—" : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: pagination */}
      {sorted.length > ROWS_PER_PAGE && (
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs shrink-0">
          <span className="text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-border bg-background px-2 py-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-border bg-background px-2 py-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default DataPreview;
