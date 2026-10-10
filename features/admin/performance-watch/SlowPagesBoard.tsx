"use client";

/**
 * features/admin/performance-watch/SlowPagesBoard.tsx
 *
 * The "Slowest pages" section of /administration/reporting/performance: one MatrxDataTable row per route
 * (ops.perf_slow_pages, one call). Real-user p75 LCP / INP / TTFB with n, the page probe's synthetic TTFB p95,
 * HTML KB and first-load JS KB, a 7-day trend and the flagged why; a flag opens the watch that proves it.
 */

import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatDurationMs, formatFileSize } from "@ai-matrx/kit/format";
import {
  PAGE_WHY_LABELS,
  bundleTone,
  orderedFlags,
  pageSampleNote,
  pageTrendValues,
  sparklinePoints,
  vitalTone,
  type SlowPage,
  type Tone,
} from "./model";

function ms(value: number | null | undefined): string {
  return formatDurationMs(value, { style: "compact", precision: "fine" });
}

function toneClass(tone: Tone): string {
  return tone === "over" ? "font-medium text-warning" : "";
}

function Trend({ values, over }: { values: number[]; over: boolean }) {
  const points = sparklinePoints(values, 80, 18);
  if (!points) return <span className="text-muted-foreground">—</span>;
  return (
    <svg width={80} height={18} viewBox="0 0 80 18" className="overflow-visible" role="img" aria-label="7-day LCP trend">
      <polyline
        points={points}
        fill="none"
        className={over ? "stroke-warning" : "stroke-primary"}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A real-user p75 with its n under it; warning tone past the web.dev line, muted n while under the minimum. */
function VitalCell({ metric, value, n, minN }: { metric: "LCP" | "INP" | "TTFB"; value: number | null; n: number; minN: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const note = pageSampleNote(n, minN);
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={`tabular-nums ${toneClass(vitalTone(metric, value))}`}>{ms(value)}</span>
      <span className={`text-[10px] tabular-nums ${note.enough ? "text-muted-foreground" : "text-warning"}`}>{note.label}</span>
    </span>
  );
}

export function SlowPagesBoard({
  rows,
  minN,
  loading,
  onOpenWatch,
}: {
  rows: SlowPage[];
  minN: number;
  loading: boolean;
  onOpenWatch: (watchId: string) => void;
}) {
  const columns: MatrxColumnDef<SlowPage>[] = [
    {
      id: "route",
      header: "Page",
      accessorFn: (r) => r.route,
      width: 280,
      cell: (r) => (
        <div className="truncate font-mono text-xs" title={r.route}>
          {r.route}
        </div>
      ),
    },
    {
      id: "lcp",
      header: "LCP p75",
      accessorFn: (r) => r.lcp_p75 ?? -1,
      filter: "number",
      width: 100,
      align: "right",
      cell: (r) => <VitalCell metric="LCP" value={r.lcp_p75} n={r.n_lcp} minN={minN} />,
    },
    {
      id: "inp",
      header: "INP p75",
      accessorFn: (r) => r.inp_p75 ?? -1,
      filter: "number",
      width: 100,
      align: "right",
      mobileHidden: true,
      cell: (r) => <VitalCell metric="INP" value={r.inp_p75} n={r.n_inp} minN={minN} />,
    },
    {
      id: "ttfb",
      header: "TTFB p75",
      accessorFn: (r) => r.ttfb_p75 ?? -1,
      filter: "number",
      width: 100,
      align: "right",
      cell: (r) => <VitalCell metric="TTFB" value={r.ttfb_p75} n={r.n_ttfb} minN={minN} />,
    },
    {
      id: "probe_ttfb",
      header: "Probe TTFB p95",
      accessorFn: (r) => r.probe_ttfb_p95_ms ?? -1,
      filter: "number",
      width: 120,
      align: "right",
      mobileHidden: true,
      cell: (r) => (
        <span
          className={`tabular-nums ${r.probe_ttfb_p95_ms != null && r.probe_budget_ms != null && r.probe_ttfb_p95_ms > r.probe_budget_ms ? "font-medium text-warning" : ""}`}
          title={r.probe_budget_ms != null ? `Budget ${ms(r.probe_budget_ms)}` : undefined}
        >
          {r.probe_ttfb_p95_ms != null ? ms(r.probe_ttfb_p95_ms) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: "html",
      header: "HTML",
      accessorFn: (r) => r.html_kb ?? -1,
      filter: "number",
      width: 80,
      align: "right",
      mobileHidden: true,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{r.html_kb != null ? formatFileSize(r.html_kb * 1024) : "—"}</span>
      ),
    },
    {
      id: "js",
      header: "First-load JS",
      accessorFn: (r) => r.first_load_js_kb ?? -1,
      filter: "number",
      width: 110,
      align: "right",
      mobileHidden: true,
      cell: (r) => (
        <span
          className={`tabular-nums ${toneClass(bundleTone(r.first_load_js_kb, r.first_load_js_budget_kb))}`}
          title={r.first_load_js_budget_kb != null ? `Budget ${formatFileSize(r.first_load_js_budget_kb * 1024)}` : undefined}
        >
          {r.first_load_js_kb != null ? formatFileSize(r.first_load_js_kb * 1024) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: "trend",
      header: "7 days",
      sortable: false,
      filter: false,
      width: 100,
      mobileHidden: true,
      cell: (r) => <Trend values={pageTrendValues(r.trend)} over={vitalTone("LCP", r.lcp_p75) === "over"} />,
    },
    {
      id: "why",
      header: "Why",
      accessorFn: (r) => orderedFlags(r.flags).map((f) => PAGE_WHY_LABELS[f.why]).join(" "),
      filter: "select",
      width: 260,
      cell: (r) => {
        const flags = orderedFlags(r.flags);
        if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {flags.map((f, i) => {
              const body = (
                <Badge variant="outline" className="border-warning/50 text-warning" title={f.detail}>
                  {PAGE_WHY_LABELS[f.why]}
                </Badge>
              );
              return f.watch_id ? (
                <button
                  key={`${f.why}-${i}`}
                  type="button"
                  className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  title={f.detail}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenWatch(f.watch_id as string);
                  }}
                >
                  {body}
                </button>
              ) : (
                <span key={`${f.why}-${i}`}>{body}</span>
              );
            })}
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-0 flex-1">
      <MatrxDataTable
        tableId="admin-performance-slow-pages"
        data={rows}
        columns={columns}
        getRowId={(r) => r.route}
        isLoading={loading}
        stickyHeader
        density="condensed"
        pageSize={100}
        coverage={{ noun: "page", answeredBy: "client", loaded: rows.length, total: loading ? undefined : rows.length }}
        toolbar={{ title: "Slowest pages", search: true }}
        read={{ status: loading ? "loading" : "ready", what: "the slowest pages" }}
        emptyState={{ icon: <Gauge className="h-5 w-5" />, title: "No page-speed data yet" }}
      />
    </div>
  );
}
