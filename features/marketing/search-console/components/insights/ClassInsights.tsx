"use client";

/**
 * Traffic-class insight views — Quality (class summary + class movers),
 * Shifts (page-mix movement per query), and Juice (sustained educational
 * strength vs money return). Backed by `seo_gsc_class_rpcs.sql`; the class
 * resolver (`seo.gsc_keyword_class_map`) runs server-side ONCE — never
 * re-derive a class client-side. Rendered by `InsightsTab`.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Scale, Tags } from "lucide-react";
import { useOpenKeywordClassificationWindow } from "@/features/overlays/openers/keywordClassificationWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/styles/themes/utils";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import {
  GscDeltaSpan,
  buildGscKeyColumn,
  gscDeltaCell,
} from "@/features/marketing/search-console/lib/columns";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { describeGscWindow } from "@/features/marketing/search-console/lib/format";
import {
  useGscClassMovers,
  useGscClassSummary,
  useGscJuice,
  useGscShifts,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import type {
  GscClassMoverRow,
  GscJuiceRow,
  GscResolvedPeriods,
  GscShiftRow,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";
import {
  GSC_TRAFFIC_CLASSES,
  formatCount,
} from "@/features/marketing/search-console/types";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatCount(value);
}

export function ClassChip({ trafficClass }: { trafficClass: string | null }) {
  const meta = GSC_TRAFFIC_CLASSES.find((c) => c.key === trafficClass);
  if (!meta) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
        meta.tone,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
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

function deltaSpan(cur: number, cmp: number) {
  return (
    <GscDeltaSpan
      value={gscDeltaCell(cur, cmp, (v) => Math.round(v).toLocaleString())}
    />
  );
}

/** Traffic quality: the headline class decomposition + class-aware movers. */
export function QualityView({
  siteId,
  siteName,
  periods,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  onDrill: (dimension: "query" | "page", key: string) => void;
}) {
  const [dimension, setDimension] = useState<"query" | "page">("query");
  const [trafficClass, setTrafficClass] = useState<GscTrafficClass | null>(
    null,
  );
  const [direction, setDirection] = useState<"gain" | "loss">("loss");
  const openClassificationWindow = useOpenKeywordClassificationWindow();
  const summary = useGscClassSummary(siteId, periods);
  const movers = useGscClassMovers(
    siteId,
    periods,
    dimension,
    trafficClass,
    direction,
  );
  const moverRows = movers.data?.rows ?? [];
  const moverTotal = movers.data?.total ?? moverRows.length;

  if (summary.isError) return <ErrorPanel error={summary.error} />;

  const summaryRows = summary.data ?? [];
  const totals = summaryRows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      cmp: acc.cmp + (row.cmp_clicks ?? 0),
      impressions: acc.impressions + row.impressions,
      cmpImpressions: acc.cmpImpressions + (row.cmp_impressions ?? 0),
      queries: acc.queries + row.queries,
    }),
    { clicks: 0, cmp: 0, impressions: 0, cmpImpressions: 0, queries: 0 },
  );

  const moverColumns: MatrxColumnDef<GscClassMoverRow>[] = [
    buildGscKeyColumn<GscClassMoverRow>(
      dimension,
      dimension === "query" ? "Query" : "Page",
    ),
    {
      id: "class",
      header: "Class",
      sortable: false,
      filter: false,
      accessorFn: (row) => row.traffic_class,
      cell: (row) => <ClassChip trafficClass={row.traffic_class} />,
    },
    {
      id: "delta_clicks",
      accessorKey: "delta_clicks",
      header: "Δ Clicks",
      align: "right",
      filter: false,
      cell: (row) => deltaSpan(row.clicks, row.cmp_clicks),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.clicks)}
          <span className="text-muted-foreground"> / {num(row.cmp_clicks)}</span>
        </span>
      ),
    },
    {
      id: "delta_impressions",
      accessorKey: "delta_impressions",
      header: "Δ Impr.",
      align: "right",
      filter: false,
      cell: (row) => deltaSpan(row.impressions, row.cmp_impressions),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.impressions)}
          <span className="text-muted-foreground">
            {" "}
            / {num(row.cmp_impressions)}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-0.5">
      {/* The evaluated windows live in the tab-level GscPeriodStrip — ONE
          place, never a second period label here. */}
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Open the classification workbench in a floating panel — rule on keywords without leaving this view"
          onClick={() =>
            openClassificationWindow({
              siteId,
              siteDomain: siteName ?? siteId,
            })
          }
        >
          <Tags className="h-3 w-3" /> Classify in panel
        </button>
      </div>
      <div className="shrink-0 overflow-hidden rounded-md border border-border">
        <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">Class</th>
              <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
              <th className="px-2 py-1.5 text-right font-medium">Δ</th>
              <th className="px-2 py-1.5 text-right font-medium">Share</th>
              <th className="px-2 py-1.5 text-right font-medium">
                Impressions
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Δ</th>
              <th className="px-2 py-1.5 text-right font-medium">Queries</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr
                key={row.traffic_class}
                className={cn(
                  "cursor-pointer border-t border-border hover:bg-accent/50",
                  trafficClass === row.traffic_class && "bg-accent/60",
                )}
                onClick={() =>
                  setTrafficClass(
                    trafficClass === row.traffic_class
                      ? null
                      : (row.traffic_class as GscTrafficClass),
                  )
                }
              >
                <td className="px-2 py-1.5">
                  <ClassChip trafficClass={row.traffic_class} />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {num(row.clicks)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {deltaSpan(row.clicks, row.cmp_clicks ?? 0)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {totals.clicks > 0
                    ? `${((row.clicks / totals.clicks) * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {num(row.impressions)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {deltaSpan(row.impressions, row.cmp_impressions ?? 0)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {num(row.queries)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {/* The classification review queue — the legacy /sites
                      shim resolves the brand and keeps the query intact. */}
                  <Link
                    href={`/marketing/sites/${siteId}/keywords?view=classification&f_traffic_class=select:${row.traffic_class}`}
                    className="whitespace-nowrap text-[11px] text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    title={
                      row.traffic_class === "unclassified"
                        ? "Open the classification queue — every unclassified keyword, biggest impressions first"
                        : `Review and override ${row.traffic_class} keywords`
                    }
                  >
                    {row.traffic_class === "unclassified"
                      ? "Classify →"
                      : "Review →"}
                  </Link>
                </td>
              </tr>
            ))}
            {summaryRows.length > 0 ? (
              <tr className="border-t border-border bg-muted/40 font-medium">
                <td className="px-2 py-1.5 text-muted-foreground">Total</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {num(totals.clicks)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {deltaSpan(totals.clicks, totals.cmp)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  100%
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {num(totals.impressions)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {deltaSpan(totals.impressions, totals.cmpImpressions)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {num(totals.queries)}
                </td>
                <td className="px-2 py-1.5" />
              </tr>
            ) : null}
            {summaryRows.length === 0 && !summary.isLoading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-2 py-4 text-center text-muted-foreground"
                >
                  No data {describeGscWindow(periods.current)}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {(["loss", "gain"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                direction === dir
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setDirection(dir)}
            >
              {dir === "loss" ? "Losing ground" : "Gaining ground"}
            </button>
          ))}
        </div>
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
        {trafficClass ? (
          <button
            type="button"
            className="rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setTrafficClass(null)}
          >
            Class: {trafficClass} ✕
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Click a class row above to filter the movers.
          </span>
        )}
      </div>
      <div className="min-h-[20rem] flex-1">
        {movers.isError ? (
          <ErrorPanel error={movers.error} />
        ) : (
          <MatrxDataTable<GscClassMoverRow>
            data={moverRows}
            columns={moverColumns}
            getRowId={(row) => row.key}
            isLoading={movers.isLoading}
            isFetching={movers.isFetching}
            toolbar={{ searchPlaceholder: "Search movers…" }}
            copy={{
              label: "Class mover",
              listLabel: "Search Console — Traffic quality movers",
              location: webLocation("Search Console — Insights"),
              rowKind: `web-gsc-class-mover-${dimension}`,
              listKind: "web-gsc-class-mover-results",
              rowDescription: `One ${dimension} ${direction === "gain" ? "gaining" : "losing"} clicks vs the compare period, with its traffic class.`,
              listDescription: `${direction === "gain" ? "Gaining" : "Losing"} ${dimension === "query" ? "queries" : "pages"}${trafficClass ? ` in the ${trafficClass} class` : ""}, decomposed by traffic class server-side.`,
              humanRow: (row) =>
                humanLines([
                  [dimension === "query" ? "Query" : "Page", row.key],
                  ["Class", row.traffic_class],
                  ["Δ clicks", num(row.delta_clicks)],
                  ["Clicks", `${num(row.clicks)} vs ${num(row.cmp_clicks)}`],
                  [
                    "Impressions",
                    `${num(row.impressions)} vs ${num(row.cmp_impressions)}`,
                  ],
                ]),
              rowAttributes: (row) => ({
                ...gscScopeAttributes(siteId, siteName, periods, {}),
                insight: "quality",
                dimension,
                direction,
                key: row.key,
                traffic_class: row.traffic_class ?? "",
              }),
              listAttributes: (visible) => ({
                ...gscScopeAttributes(siteId, siteName, periods, {}),
                insight: "quality",
                dimension,
                direction,
                traffic_class: trafficClass ?? "all",
                visible_rows: visible.length,
                fetched_rows: moverRows.length,
                total_rows: moverTotal,
              }),
            }}
            detail={{ enabled: false }}
            window={{ enabled: false }}
            onRowOpen={(row) => onDrill(dimension, row.key)}
            pageSize={25}
            emptyState={{
              icon: <Scale className="h-8 w-8 text-muted-foreground" />,
              title:
                direction === "loss"
                  ? "Nothing is losing ground"
                  : "Nothing is gaining ground",
              description: `No ${trafficClass ? `${trafficClass} ` : ""}row moved in this direction ${describeGscWindow(periods.current)} vs the compare period.`,
            }}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}

/** Shifts: queries whose landing-page mix moved between the periods. */
export function ShiftsView({
  siteId,
  siteName,
  periods,
  minClicks,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  minClicks: number;
  onDrill: (dimension: "query" | "page", key: string) => void;
}) {
  const query = useGscShifts(siteId, periods, minClicks);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: MatrxColumnDef<GscShiftRow>[] = [
    {
      id: "query",
      accessorKey: "query",
      header: "Query",
      filter: false,
      cell: (row) => (
        <span
          className="block max-w-[20rem] truncate text-xs font-medium text-foreground"
          title={row.query}
        >
          {row.query}
        </span>
      ),
    },
    {
      id: "class",
      header: "Class",
      sortable: false,
      filter: false,
      accessorFn: (row) => row.traffic_class,
      cell: (row) => <ClassChip trafficClass={row.traffic_class} />,
    },
    {
      id: "shift_share",
      accessorKey: "shift_share",
      header: "Shift",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums text-warning">
          {row.shift_share === null
            ? "—"
            : `${(row.shift_share * 100).toFixed(0)}%`}
        </span>
      ),
    },
    {
      id: "delta_clicks",
      accessorKey: "delta_clicks",
      header: "Δ Clicks",
      align: "right",
      filter: false,
      cell: (row) => deltaSpan(row.clicks, row.cmp_clicks),
    },
    {
      id: "pages",
      header: "Top page (was → now)",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="flex max-w-[30rem] items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate" title={row.cmp_top_url ?? undefined}>
            {row.cmp_top_url ?? "—"}
          </span>
          {row.top_changed ? (
            <>
              <ArrowRight className="h-3 w-3 shrink-0 text-warning" />
              <span
                className="truncate font-medium text-foreground"
                title={row.cur_top_url ?? undefined}
              >
                {row.cur_top_url ?? "—"}
              </span>
            </>
          ) : (
            <span className="shrink-0 text-muted-foreground">(unchanged)</span>
          )}
        </span>
      ),
    },
  ];

  if (query.isError) return <ErrorPanel error={query.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/* The evaluated windows (and any auto-derived compare) live in the
          tab-level GscPeriodStrip — ONE place. */}
      {total > rows.length ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the top {rows.length} of {formatCount(total)} shifted
          queries.
        </p>
      ) : null}
      <MatrxDataTable<GscShiftRow>
        data={rows}
        columns={columns}
        getRowId={(row) => row.query}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        toolbar={{ searchPlaceholder: "Search queries…" }}
        copy={{
          label: "Traffic shift",
          listLabel: "Search Console — Traffic shifts",
          location: webLocation("Search Console — Insights"),
          rowKind: "web-gsc-shift",
          listKind: "web-gsc-shift-results",
          rowDescription:
            "One query whose landing-page mix moved between the compare and current periods.",
          listDescription:
            "Queries whose page mix shifted (≥15% of impression share moved between pages), with class and click delta — a shift off a money page without click growth is a hidden loss.",
          humanRow: (row) =>
            humanLines([
              ["Query", row.query],
              ["Class", row.traffic_class],
              [
                "Shift",
                row.shift_share === null
                  ? null
                  : `${(row.shift_share * 100).toFixed(0)}% of impression share moved`,
              ],
              ["Δ clicks", num(row.delta_clicks)],
              ["Top page before", row.cmp_top_url],
              ["Top page now", row.cur_top_url],
            ]),
          rowAttributes: (row) => ({
            ...gscScopeAttributes(siteId, siteName, periods, {}),
            insight: "shifts",
            query: row.query,
            traffic_class: row.traffic_class ?? "",
          }),
          listAttributes: (visible) => ({
            ...gscScopeAttributes(siteId, siteName, periods, {}),
            insight: "shifts",
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
                Page mix, compare period vs current. Click the row to open the
                Pages tab filtered to this query.
              </p>
              {Array.isArray(row.pages)
                ? (
                    row.pages as unknown as Array<{
                      url: string;
                      clicks: number;
                      cmp_clicks: number;
                      share: number;
                      cmp_share: number;
                    }>
                  ).map((page) => (
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
                        share {(page.cmp_share * 100).toFixed(0)}% →{" "}
                        {(page.share * 100).toFixed(0)}% · clicks{" "}
                        {formatCount(page.cmp_clicks)} →{" "}
                        {formatCount(page.clicks)}
                      </p>
                    </div>
                  ))
                : null}
            </div>
          ),
        }}
        window={{ enabled: false }}
        onRowOpen={(row) => onDrill("query", row.query)}
        pageSize={25}
        emptyState={{
          icon: <Scale className="h-8 w-8 text-muted-foreground" />,
          title: "No meaningful shifts",
          description: `No query with enough clicks moved a meaningful share of its impressions between pages ${describeGscWindow(periods.current)} vs the compare period.`,
        }}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

/** SEO Juice: sustained educational strength vs money return, per page. */
export function JuiceView({
  siteId,
  siteName,
  periods,
  monthMinClicks,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  monthMinClicks: number;
  onDrill: (dimension: "query" | "page", key: string) => void;
}) {
  const query = useGscJuice(siteId, monthMinClicks, 3);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: MatrxColumnDef<GscJuiceRow>[] = [
    buildGscKeyColumn<GscJuiceRow>("page", "Page"),
    {
      id: "edu_months_active",
      accessorKey: "edu_months_active",
      header: "Months strong",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums text-primary">
          {row.edu_months_active}
        </span>
      ),
    },
    {
      id: "edu_clicks",
      accessorKey: "edu_clicks",
      header: "Edu clicks (90d)",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.edu_clicks)}
          <span className="text-muted-foreground">
            {" "}
            / {num(row.edu_clicks_prior)}
          </span>
        </span>
      ),
    },
    {
      id: "money_clicks",
      accessorKey: "money_clicks",
      header: "Money clicks (90d)",
      align: "right",
      filter: false,
      cell: (row) => (
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            row.money_clicks === 0 ? "text-destructive" : "text-success",
          )}
        >
          {num(row.money_clicks)}
        </span>
      ),
    },
    {
      id: "money_impressions",
      accessorKey: "money_impressions",
      header: "Money impr.",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {num(row.money_impressions)}
        </span>
      ),
    },
    {
      id: "other_clicks",
      accessorKey: "other_clicks",
      header: "Other clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {num(row.other_clicks)}
        </span>
      ),
    },
  ];

  if (query.isError) return <ErrorPanel error={query.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {total > rows.length ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the top {rows.length} of {formatCount(total)} pages.
        </p>
      ) : null}
      <MatrxDataTable<GscJuiceRow>
        data={rows}
        columns={columns}
        getRowId={(row) => row.key}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        toolbar={{ searchPlaceholder: "Search pages…" }}
        copy={{
          label: "Juice page",
          listLabel: "Search Console — SEO Juice",
          location: webLocation("Search Console — Insights"),
          rowKind: "web-gsc-juice-page",
          listKind: "web-gsc-juice-results",
          rowDescription:
            "One page with months of sustained educational traffic, beside its money return.",
          listDescription:
            "Pages strong on educational traffic for 3+ of the last 6 months. Zero money clicks beside months of educational strength means the credibility exists but the funnel to money pages does not.",
          humanRow: (row) =>
            humanLines([
              ["Page", row.key],
              ["Months strong (of 6)", String(row.edu_months_active)],
              [
                "Educational clicks (90d / prior 90d)",
                `${num(row.edu_clicks)} / ${num(row.edu_clicks_prior)}`,
              ],
              ["Money clicks (90d)", num(row.money_clicks)],
              ["Money impressions (90d)", num(row.money_impressions)],
              ["Other clicks (90d)", num(row.other_clicks)],
            ]),
          rowAttributes: (row) => ({
            ...gscScopeAttributes(siteId, siteName, periods, {}),
            insight: "juice",
            key: row.key,
            page_id: row.page_id ?? "",
          }),
          listAttributes: (visible) => ({
            ...gscScopeAttributes(siteId, siteName, periods, {}),
            insight: "juice",
            visible_rows: visible.length,
            fetched_rows: rows.length,
            total_rows: total,
          }),
        }}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        onRowOpen={(row) => onDrill("page", row.key)}
        pageSize={25}
        emptyState={{
          icon: <Scale className="h-8 w-8 text-muted-foreground" />,
          title: "No sustained educational pages yet",
          description:
            "No page has held meaningful educational traffic for 3+ of the last 6 calendar months (this view's fixed window) — or the site's keywords are not classified yet (see the Unclassified bucket under Traffic quality).",
        }}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
