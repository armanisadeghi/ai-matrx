"use client";

/**
 * Insights tab — the algorithm layer beyond threshold dig rules. Four
 * views, each backed by its own server-side algorithm RPC (the algorithms
 * compose the accuracy contract ONCE, server-side — see
 * migrations/seo_gsc_insight_rpcs.sql):
 *
 *   CTR gaps        seo.gsc_perf_ctr_gap        — below the site's own
 *                                                 CTR-by-position curve
 *   Cannibalization seo.gsc_perf_cannibalization — pages splitting a query
 *   Declining       seo.gsc_perf_trend (decay)   — sustained losers
 *   Rising          seo.gsc_perf_trend (growth)  — sustained winners
 *
 * Tables are local-mode MatrxDataTable over the RPC's bounded top-200
 * (search/sort/page client-side, like Dig Here). Row click drills to the
 * matching dimension tab — a cannibalized query lands on Pages filtered to
 * that query, which IS the competing-pages view.
 */

import { useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/styles/themes/utils";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  GscDeltaSpan,
  buildGscKeyColumn,
} from "@/features/marketing/search-console/lib/columns";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import {
  useGscCannibalization,
  useGscCtrGap,
  useGscTrend,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { useRowWatch } from "@/features/marketing/search-console/hooks/useWatchState";
import {
  JuiceView,
  QualityView,
  ShiftsView,
} from "@/features/marketing/search-console/components/insights/ClassInsights";
import { withPrevCompare } from "@/features/marketing/search-console/lib/url-state";
import { describeGscWindow } from "@/features/marketing/search-console/lib/format";
import { GscPeriodStrip } from "@/features/marketing/search-console/components/PeriodStrip";
import type { RangeCompareValue } from "@/features/marketing/search-console/components/RangeCompareControl";
import { WatchButton } from "@/features/marketing/search-console/components/watch/WatchButton";
import type {
  GscCannibalizationRow,
  GscCtrGapRow,
  GscInsightKind,
  GscResolvedPeriods,
  GscTrendRow,
} from "@/features/marketing/search-console/types";
import {
  GSC_INSIGHTS,
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";

const DEFAULT_MIN_IMPRESSIONS = 100;
const DEFAULT_MIN_CLICKS = 20;
/** gsc_perf_trend raises below 28 days — gate client-side with a notice. */
const TREND_MIN_DAYS = 28;

type InsightDimension = "query" | "page";

interface CannibalPageEntry {
  url: string;
  page_id: string | null;
  clicks: number;
  impressions: number;
  position: number | null;
  impression_share: number | null;
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatCount(value);
}

function ErrorPanel({ error }: { error: unknown }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="max-w-lg text-center text-xs text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  );
}

export function InsightsTab({
  siteId,
  siteName,
  periods,
  panelRange,
  onRangeChange,
  rangeDisabled,
  insight,
  onSelectInsight,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  panelRange: RangeCompareValue;
  /** Writes range/compare back to URL state — same sink as the header. */
  onRangeChange: (next: RangeCompareValue) => void;
  rangeDisabled?: boolean;
  insight: GscInsightKind | null;
  onSelectInsight: (insight: GscInsightKind) => void;
  onDrill: (dimension: InsightDimension, key: string) => void;
}) {
  const active = insight ?? "quality";
  const [dimension, setDimension] = useState<InsightDimension>("query");
  const [minImpressions, setMinImpressions] = useState(DEFAULT_MIN_IMPRESSIONS);
  const [minClicks, setMinClicks] = useState(DEFAULT_MIN_CLICKS);
  const activeMeta = GSC_INSIGHTS.find((i) => i.key === active);
  const compareAuto = periods.compare === null;
  const classPeriods = compareAuto ? withPrevCompare(periods) : periods;

  const rangeDays =
    (Date.parse(`${periods.current.end}T00:00:00Z`) -
      Date.parse(`${periods.current.start}T00:00:00Z`)) /
      86_400_000 +
    1;
  const trendTooShort = rangeDays < TREND_MIN_DAYS;

  const showsDimensionToggle =
    active === "ctr-gap" || active === "decay" || active === "growth";
  const usesClicksThreshold =
    active === "decay" || active === "growth" || active === "shifts" || active === "juice";
  const showsThreshold = active !== "quality";

  // What the strip states depends on which window the ACTIVE view actually
  // evaluates: class views compare (auto-deriving under compare=none), the
  // algorithm views run over the single current window regardless of the
  // compare setting, and Juice uses a fixed 6-month window of its own.
  const usesCompare = active === "quality" || active === "shifts";
  const stripPeriods = usesCompare
    ? classPeriods
    : { current: periods.current, compare: null };
  const stripNote =
    active === "juice"
      ? "Evaluating the last 6 calendar months — this view uses a fixed monthly window, so the selected date range does not apply."
      : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* WHAT window the results below cover — with the same control the
          header uses, so it can be changed from where the user is looking.
          Both write URL state; they cannot disagree. */}
      <GscPeriodStrip
        periods={stripPeriods}
        compareAuto={usesCompare && compareAuto}
        note={stripNote}
        value={panelRange}
        onChange={onRangeChange}
        disabled={rangeDisabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {GSC_INSIGHTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                active === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => onSelectInsight(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {showsDimensionToggle ? (
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
            {(["query", "page"] as const).map((dim) => (
              <button
                key={dim}
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  dimension === dim
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => setDimension(dim)}
              >
                {dim === "query" ? "Queries" : "Pages"}
              </button>
            ))}
          </div>
        ) : null}
        {showsThreshold ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {active === "juice"
            ? "Min clicks/month"
            : usesClicksThreshold
              ? "Min clicks"
              : "Min impressions"}
          <Input
            type="number"
            min={1}
            className="h-6 w-20 text-xs"
            value={usesClicksThreshold ? minClicks : minImpressions}
            onChange={(e) => {
              // The RPC arg is a SQL int — "150.5" would fail PostgREST's cast.
              const value = Math.max(1, Math.trunc(Number(e.target.value) || 1));
              if (usesClicksThreshold) setMinClicks(value);
              else setMinImpressions(value);
            }}
          />
        </label>
        ) : null}
      </div>
      {activeMeta ? (
        <p className="text-xs text-muted-foreground">{activeMeta.description}</p>
      ) : null}
      <div className="min-h-0 flex-1">
        {active === "quality" ? (
          <QualityView
            siteId={siteId}
            siteName={siteName}
            periods={classPeriods}
            onDrill={onDrill}
          />
        ) : active === "shifts" ? (
          <ShiftsView
            siteId={siteId}
            siteName={siteName}
            periods={classPeriods}
            minClicks={minClicks}
            onDrill={onDrill}
          />
        ) : active === "juice" ? (
          <JuiceView
            siteId={siteId}
            siteName={siteName}
            periods={periods}
            monthMinClicks={minClicks}
            onDrill={onDrill}
          />
        ) : active === "ctr-gap" ? (
          <CtrGapTable
            siteId={siteId}
            siteName={siteName}
            periods={periods}
            dimension={dimension}
            minImpressions={minImpressions}
            onDrill={onDrill}
          />
        ) : active === "cannibalization" ? (
          <CannibalizationTable
            siteId={siteId}
            siteName={siteName}
            periods={periods}
            minImpressions={minImpressions}
            onDrill={onDrill}
          />
        ) : trendTooShort ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Trends need at least {TREND_MIN_DAYS} days
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              The selected range covers {Math.round(rangeDays)} day
              {rangeDays === 1 ? "" : "s"}. Pick 28 days or more so the
              first-half / second-half comparison means something.
            </p>
          </div>
        ) : (
          <TrendTable
            siteId={siteId}
            siteName={siteName}
            periods={periods}
            dimension={dimension}
            direction={active === "decay" ? "decay" : "growth"}
            minClicks={minClicks}
            onDrill={onDrill}
          />
        )}
      </div>
    </div>
  );
}

function CtrGapTable({
  siteId,
  siteName,
  periods,
  dimension,
  minImpressions,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  dimension: InsightDimension;
  minImpressions: number;
  onDrill: (dimension: InsightDimension, key: string) => void;
}) {
  const query = useGscCtrGap(siteId, periods, dimension, minImpressions);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;
  const columnLabel = dimension === "query" ? "Query" : "Page";
  const rowWatch = useRowWatch(dimension);

  const columns: MatrxColumnDef<GscCtrGapRow>[] = [
    {
      id: "watch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched={rowWatch.isWatched(row)}
          pending={rowWatch.isRowPending(row)}
          onToggle={() => rowWatch.toggleRow(row)}
          noun={dimension}
        />
      ),
    },
    // THE DOOR LAW: a page-dimension row names a canonical page the RPC
    // already resolved (`page_id`) — render the relationship AND link it.
    buildGscKeyColumn<GscCtrGapRow>(dimension, columnLabel, (row) =>
      dimension === "page" && row.page_id
        ? marketingRoutes.sitePage(null, siteId, row.page_id)
        : null,
    ),
    {
      id: "missed_clicks",
      accessorKey: "missed_clicks",
      header: "Missed clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums text-destructive">
          {num(row.missed_clicks)}
        </span>
      ),
    },
    {
      id: "ctr",
      accessorKey: "ctr",
      header: "CTR",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatCtr(row.ctr)}</span>
      ),
    },
    {
      id: "expected_ctr",
      accessorKey: "expected_ctr",
      header: "Expected CTR",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatCtr(row.expected_ctr)}
        </span>
      ),
    },
    {
      id: "position",
      accessorKey: "avg_position",
      header: "Position",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatPosition(row.avg_position)}
        </span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{num(row.impressions)}</span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{num(row.clicks)}</span>
      ),
    },
  ];

  if (query.isError) return <ErrorPanel error={query.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {total > rows.length ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the top {rows.length} of {formatCount(total)} matches —
          tighten the threshold to narrow the set.
        </p>
      ) : null}
    <MatrxDataTable<GscCtrGapRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.key}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      toolbar={{ searchPlaceholder: "Search results…" }}
      copy={{
        label: "CTR gap",
        listLabel: "Search Console — CTR gaps",
        location: webLocation("Search Console — Insights"),
        rowKind: `web-gsc-ctr-gap-${dimension}`,
        listKind: "web-gsc-ctr-gap-results",
        rowDescription: `One ${dimension} whose CTR sits below this site's own CTR-by-position curve.`,
        listDescription:
          "Rankings underperforming the site's own expected CTR at their position, with estimated missed clicks (server-side algorithm).",
        humanRow: (row) =>
          humanLines([
            [columnLabel, row.key],
            ["Missed clicks", num(row.missed_clicks)],
            ["CTR", formatCtr(row.ctr)],
            ["Expected CTR", formatCtr(row.expected_ctr)],
            ["Position", formatPosition(row.avg_position)],
            ["Impressions", num(row.impressions)],
            ["Clicks", num(row.clicks)],
          ]),
        rowAttributes: (row) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: "ctr-gap",
          dimension,
          key: row.key,
          page_id: row.page_id ?? "",
          keyword_id: row.keyword_id ?? "",
        }),
        listAttributes: (visible) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: "ctr-gap",
          dimension,
          visible_rows: visible.length,
          fetched_rows: rows.length,
          total_rows: total,
        }),
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      onRowOpen={(row) => onDrill(dimension, row.key)}
      pageSize={50}
      emptyState={{
        icon: <Lightbulb className="h-8 w-8 text-muted-foreground" />,
        title: "No CTR gaps found",
        description: `Nothing with enough impressions sits below this site's expected CTR curve ${describeGscWindow(periods.current)}. Lower the impressions threshold or widen the range.`,
      }}
      className="min-h-0 flex-1"
    />
    </div>
  );
}

function CannibalizationTable({
  siteId,
  siteName,
  periods,
  minImpressions,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  minImpressions: number;
  onDrill: (dimension: InsightDimension, key: string) => void;
}) {
  const query = useGscCannibalization(siteId, periods, minImpressions);
  const total = query.data?.total ?? 0;
  const rowWatch = useRowWatch("query");
  const rows = useMemo(
    () =>
      (query.data?.rows ?? []).map((row) => ({
        ...row,
        key: row.query,
        page_id: null as string | null,
      })),
    [query.data],
  );
  type Row = (typeof rows)[number];

  const columns: MatrxColumnDef<Row>[] = [
    {
      id: "watch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched={rowWatch.isWatched(row)}
          pending={rowWatch.isRowPending(row)}
          onToggle={() => rowWatch.toggleRow(row)}
          noun="query"
        />
      ),
    },
    buildGscKeyColumn<Row>("query", "Query"),
    {
      id: "competing_pages",
      accessorKey: "competing_pages",
      header: "Pages",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums text-warning">
          {row.competing_pages}
        </span>
      ),
    },
    {
      id: "top_share",
      accessorKey: "top_share",
      header: "Top page share",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{pct(row.top_share, 0)}</span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{num(row.impressions)}</span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{num(row.clicks)}</span>
      ),
    },
    {
      id: "position",
      accessorKey: "avg_position",
      header: "Position",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatPosition(row.avg_position)}
        </span>
      ),
    },
  ];

  if (query.isError) return <ErrorPanel error={query.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {total > rows.length ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the top {rows.length} of {formatCount(total)} matches —
          tighten the threshold to narrow the set.
        </p>
      ) : null}
    <MatrxDataTable<Row>
      data={rows}
      columns={columns}
      getRowId={(row) => row.key}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      toolbar={{ searchPlaceholder: "Search queries…" }}
      copy={{
        label: "Cannibalized query",
        listLabel: "Search Console — Cannibalization",
        location: webLocation("Search Console — Insights"),
        rowKind: "web-gsc-cannibalization",
        listKind: "web-gsc-cannibalization-results",
        rowDescription:
          "One query where two or more of this site's pages split the impressions.",
        listDescription:
          "Queries with multiple competing pages (each holding ≥20% of impressions), detected server-side on the query×page profile.",
        humanRow: (row) =>
          humanLines([
            ["Query", row.query],
            ["Competing pages", String(row.competing_pages)],
            ["Top page share", pct(row.top_share, 0)],
            ["Impressions", num(row.impressions)],
            ["Clicks", num(row.clicks)],
            ["Position", formatPosition(row.avg_position)],
            ...(Array.isArray(row.pages)
              ? (row.pages as unknown as CannibalPageEntry[]).map(
                  (page, index): [string, string | null] => [
                    `Page ${index + 1}`,
                    `${page.url} — ${formatCount(page.impressions)} impressions (${pct(page.impression_share, 0)}), ${formatCount(page.clicks)} clicks, pos ${page.position ?? "—"}`,
                  ],
                )
              : []),
          ]),
        rowAttributes: (row) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: "cannibalization",
          query: row.query,
          keyword_id: row.keyword_id ?? "",
        }),
        listAttributes: (visible) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: "cannibalization",
          visible_rows: visible.length,
          fetched_rows: rows.length,
          total_rows: total,
        }),
      }}
      detail={{
        enabled: true,
        title: (row) => row.query,
        render: (row) => (
          <div className="space-y-2 p-2">
            <p className="text-xs text-muted-foreground">
              {row.competing_pages} pages compete for this query. Click the
              row to open the Pages tab filtered to it.
            </p>
            {Array.isArray(row.pages)
              ? (row.pages as unknown as CannibalPageEntry[]).map((page) => (
                  <div
                    key={page.url}
                    className="rounded-md border border-border bg-card p-2"
                  >
                    <p
                      className="truncate text-xs font-medium text-foreground"
                      title={page.url}
                    >
                      {page.url}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatCount(page.impressions)} impressions (
                      {pct(page.impression_share, 0)}) ·{" "}
                      {formatCount(page.clicks)} clicks · pos{" "}
                      {page.position ?? "—"}
                    </p>
                  </div>
                ))
              : null}
          </div>
        ),
      }}
      window={{ enabled: false }}
      onRowOpen={(row) => onDrill("query", row.query)}
      pageSize={50}
      emptyState={{
        icon: <Lightbulb className="h-8 w-8 text-muted-foreground" />,
        title: "No cannibalization detected",
        description: `No query has two or more pages each holding a meaningful share of its impressions ${describeGscWindow(periods.current)}.`,
      }}
      className="min-h-0 flex-1"
    />
    </div>
  );
}

function TrendTable({
  siteId,
  siteName,
  periods,
  dimension,
  direction,
  minClicks,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  dimension: InsightDimension;
  direction: "decay" | "growth";
  minClicks: number;
  onDrill: (dimension: InsightDimension, key: string) => void;
}) {
  const query = useGscTrend(siteId, periods, dimension, direction, minClicks);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;
  const columnLabel = dimension === "query" ? "Query" : "Page";
  const rowWatch = useRowWatch(dimension);

  const columns: MatrxColumnDef<GscTrendRow>[] = [
    {
      id: "watch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched={rowWatch.isWatched(row)}
          pending={rowWatch.isRowPending(row)}
          onToggle={() => rowWatch.toggleRow(row)}
          noun={dimension}
        />
      ),
    },
    // Same door as the CTR-gap table: a page row reaches its page workspace.
    buildGscKeyColumn<GscTrendRow>(dimension, columnLabel, (row) =>
      dimension === "page" && row.page_id
        ? marketingRoutes.sitePage(null, siteId, row.page_id)
        : null,
    ),
    {
      id: "change_clicks",
      accessorKey: "change_clicks",
      header: "Δ Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <GscDeltaSpan
          value={
            row.change_clicks === null
              ? null
              : {
                  text: `${row.change_clicks > 0 ? "+" : ""}${formatCount(row.change_clicks)}`,
                  tone:
                    row.change_clicks === 0
                      ? "flat"
                      : row.change_clicks > 0
                        ? "up"
                        : "down",
                }
          }
        />
      ),
    },
    {
      id: "change_pct",
      accessorKey: "change_pct",
      header: "Δ %",
      align: "right",
      filter: false,
      cell: (row) => (
        <GscDeltaSpan
          value={
            row.change_pct === null
              ? null
              : {
                  text: `${row.change_pct > 0 ? "+" : ""}${row.change_pct.toFixed(0)}%`,
                  tone:
                    row.change_pct === 0
                      ? "flat"
                      : row.change_pct > 0
                        ? "up"
                        : "down",
                }
          }
        />
      ),
    },
    {
      id: "first_half_clicks",
      accessorKey: "first_half_clicks",
      header: "First half",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.first_half_clicks)}
        </span>
      ),
    },
    {
      id: "second_half_clicks",
      accessorKey: "second_half_clicks",
      header: "Second half",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.second_half_clicks)}
        </span>
      ),
    },
    {
      id: "slope_per_week",
      accessorKey: "slope_per_week",
      header: "Weekly slope",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.slope_per_week === null
            ? "—"
            : `${row.slope_per_week > 0 ? "+" : ""}${row.slope_per_week.toFixed(1)}/wk`}
        </span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{num(row.clicks)}</span>
      ),
    },
    {
      id: "position",
      accessorKey: "avg_position",
      header: "Position",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatPosition(row.avg_position)}
        </span>
      ),
    },
  ];

  if (query.isError) return <ErrorPanel error={query.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {total > rows.length ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the top {rows.length} of {formatCount(total)} matches —
          tighten the threshold to narrow the set.
        </p>
      ) : null}
    <MatrxDataTable<GscTrendRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.key}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      toolbar={{ searchPlaceholder: "Search results…" }}
      copy={{
        label: direction === "decay" ? "Declining item" : "Rising item",
        listLabel:
          direction === "decay"
            ? "Search Console — Declining"
            : "Search Console — Rising",
        location: webLocation("Search Console — Insights"),
        rowKind: `web-gsc-trend-${direction}-${dimension}`,
        listKind: `web-gsc-trend-${direction}-results`,
        rowDescription: `One ${dimension} with a sustained ${direction === "decay" ? "decline" : "rise"} across the period (half-vs-half plus weekly slope, computed server-side).`,
        listDescription: `${direction === "decay" ? "Declining" : "Rising"} ${dimension === "query" ? "queries" : "pages"}: second half of the period vs the first, with weekly trend slope.`,
        humanRow: (row) =>
          humanLines([
            [columnLabel, row.key],
            ["Δ clicks", num(row.change_clicks)],
            [
              "Δ %",
              row.change_pct === null ? null : `${row.change_pct.toFixed(0)}%`,
            ],
            ["First half", num(row.first_half_clicks)],
            ["Second half", num(row.second_half_clicks)],
            [
              "Weekly slope",
              row.slope_per_week === null
                ? null
                : `${row.slope_per_week.toFixed(1)}/wk`,
            ],
            ["Clicks", num(row.clicks)],
            ["Position", formatPosition(row.avg_position)],
          ]),
        rowAttributes: (row) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: direction,
          dimension,
          key: row.key,
          page_id: row.page_id ?? "",
          keyword_id: row.keyword_id ?? "",
        }),
        listAttributes: (visible) => ({
          ...gscScopeAttributes(siteId, siteName, periods, {}),
          insight: direction,
          dimension,
          visible_rows: visible.length,
          fetched_rows: rows.length,
          total_rows: total,
        }),
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      onRowOpen={(row) => onDrill(dimension, row.key)}
      pageSize={50}
      emptyState={{
        icon: <Lightbulb className="h-8 w-8 text-muted-foreground" />,
        title:
          direction === "decay"
            ? "Nothing is declining"
            : "Nothing is rising yet",
        description: `No row with enough clicks moved meaningfully between the two halves of the period ${describeGscWindow(periods.current)}. Lower the clicks threshold or widen the range.`,
      }}
      className="min-h-0 flex-1"
    />
    </div>
  );
}
