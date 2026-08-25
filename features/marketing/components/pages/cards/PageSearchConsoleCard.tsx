"use client";

/**
 * PageSearchConsoleCard — the Google Search Console pane of the page
 * workspace. Range-selectable (28d / 90d / 12m / all) page totals on one
 * tight line, with the per-query breakdown table as the centerpiece:
 * every stored query reaching this canonical page, strongest first, the
 * page's target keyword pinned + highlighted when it appears.
 *
 * The ambassador and per-query evidence use the surviving
 * `seo.search_performance_daily` path: page split through
 * `gsc_perf_page_class_summary`, query chips through
 * `gsc_keyword_class_by_text`. The compact total remains on the retiring
 * `web.gsc_page_stat` adapter until the separately tracked reader cutover.
 */

import { useState } from "react";
import { Crosshair, Unplug } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  formatDate,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  usePageQueryStats,
  usePageSearchTotals,
} from "@/features/marketing/seo/keyword/hooks";
import {
  GSC_RANGES,
  gscRangeDays,
  normalizeKeywordPhrase,
  type GscRangeKey,
} from "@/features/marketing/seo/keyword/data";
import type { PageQueryStat } from "@/features/marketing/seo/keyword/types";
import type { MarketingPage } from "@/features/marketing/types";
import { GscClassBar } from "@/features/marketing/search-console/components/ambassador/GscClassBar";
import { useGscKeywordValueByText } from "@/features/marketing/search-console/hooks/useGscQuery";
import { buildGscValueColumns } from "@/features/marketing/search-console/lib/columns";

function formatCtr(ctr: number | null): string {
  return ctr === null ? "—" : `${(ctr * 100).toFixed(2)}%`;
}

function queryCtr(row: PageQueryStat): number | null {
  return row.impressions > 0 ? row.clicks / row.impressions : null;
}

/** Target-keyword row pinned first, everything else stays clicks-desc. */
function orderWithTarget(
  rows: PageQueryStat[],
  target: string,
): PageQueryStat[] {
  if (!target) return rows;
  const index = rows.findIndex(
    (row) => normalizeKeywordPhrase(row.query) === target,
  );
  if (index <= 0) return rows;
  return [rows[index], ...rows.slice(0, index), ...rows.slice(index + 1)];
}

export function PageSearchConsoleCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const [range, setRange] = useState<GscRangeKey>("28d");
  const days = gscRangeDays(range);
  const totals = usePageSearchTotals(page.id, days);
  const queries = usePageQueryStats(site.id, page.id, days);

  const rangeLabel =
    GSC_RANGES.find((entry) => entry.key === range)?.label ?? range;
  const targetNormalized = normalizeKeywordPhrase(page.target_keyword ?? "");
  const rows = orderWithTarget(queries.data?.stats ?? [], targetNormalized);
  // KI-026 — Class · Score · Level for exactly the queries on screen, through
  // the ONE stamp resolver (`gsc_keyword_value_for`), never a re-derived
  // local class.
  const keywordValues = useGscKeywordValueByText(
    site.id,
    rows.map((row) => row.query),
  );
  const truncated = Boolean(totals.data?.truncated || queries.data?.truncated);
  const isLoading = totals.isLoading || queries.isLoading;
  const isError = totals.isError || queries.isError;
  const hasAnyData = Boolean(
    (totals.data && totals.data.impressions > 0) || rows.length > 0,
  );
  const neverSynced = !site.gsc_synced_at;
  const columns: MatrxColumnDef<PageQueryStat>[] = [
    {
      id: "query",
      accessorKey: "query",
      header: "Query",
      filter: "text",
      cellKind: "text",
      cell: (row) => {
        const isTarget =
          targetNormalized !== "" &&
          normalizeKeywordPhrase(row.query) === targetNormalized;
        return (
          <span
            className={
              isTarget ? "font-medium text-primary" : "text-foreground"
            }
            title={row.query}
          >
            {isTarget ? (
              <Crosshair className="mr-1 inline h-3 w-3 align-[-1px]" />
            ) : null}
            {row.query}
          </span>
        );
      },
    },
    // KI-026 — the shared Class · Score · Level cells (`buildGscValueColumns`),
    // resolved through `gsc_keyword_value_for` for exactly these rows — the
    // same definition the Queries breakdown and Dig Here use, not a copy.
    ...buildGscValueColumns<PageQueryStat>(
      (row) => keywordValues.data.get(normalizeKeywordPhrase(row.query)),
      {
        siteId: site.id,
        brandId: site.brand_id,
        keywordOf: (row) => row.query,
      },
    ),
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      cell: (row) => row.clicks.toLocaleString(),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      cell: (row) => row.impressions.toLocaleString(),
    },
    {
      id: "ctr",
      accessorFn: queryCtr,
      header: "CTR",
      filter: "number",
      align: "right",
      cell: (row) => formatCtr(queryCtr(row)),
    },
    {
      id: "position",
      accessorKey: "position",
      header: "Position",
      filter: "number",
      align: "right",
      cell: (row) => (row.position === null ? "—" : row.position.toFixed(1)),
    },
  ];

  const copy = webCopy({
    kind: "web-page-search-console",
    label: "GSC",
    description:
      "Stored GSC performance for this canonical page over the selected range: page totals plus the per-query breakdown.",
    surface: `GSC — ${page.url}`,
    data: {
      url: page.url,
      range: rangeLabel,
      totals: totals.data ?? null,
      queries: rows,
      truncated,
      site_synced_at: site.gsc_synced_at,
    },
    lines: [
      ["URL", page.url],
      ["Range", rangeLabel],
      ["Clicks", totals.data?.clicks],
      ["Impressions", totals.data?.impressions],
      ["CTR", formatCtr(totals.data?.ctr ?? null)],
      ["Average position", totals.data?.position?.toFixed(1)],
      ["Queries", rows.length],
      ...rows.map((row): [string, string] => [
        row.query,
        `${row.clicks} clicks · ${row.impressions} impressions · CTR ${formatCtr(
          queryCtr(row),
        )}${row.position === null ? "" : ` · pos ${row.position.toFixed(1)}`}`,
      ]),
      ["Site last synced", site.gsc_synced_at],
    ],
    attributes: { page_id: page.id, range: rangeLabel },
  });

  const rangeControl = (
    <div
      role="group"
      aria-label="Search Console date range"
      className="flex items-center rounded-md border border-border p-0.5"
    >
      {GSC_RANGES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-pressed={range === entry.key}
          onClick={() => setRange(entry.key)}
          className={cn(
            "h-5 rounded px-1.5 text-[11px] leading-none transition-colors",
            range === entry.key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="grid gap-2 p-3">
        <div className="h-6 animate-pulse rounded-md bg-muted/40" />
        <div className="h-32 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  } else if (isError) {
    body = (
      <QueryError
        error={totals.error ?? queries.error}
        onRetry={() => {
          void totals.refetch();
          void queries.refetch();
        }}
      />
    );
  } else if (neverSynced && !hasAnyData) {
    body = (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Unplug className="h-4 w-4 shrink-0" />
        GSC has never been synced for this site — connect and run a sync from
        site integrations to see real search performance here.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col">
        <GscClassBar
          siteId={site.id}
          siteName={site.name}
          pageId={page.id}
          range={range === "all" ? "12m" : range}
          heading={false}
          className="m-2"
        />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-3 py-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Clicks</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.clicks.toLocaleString() ?? "—"}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Impr</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.impressions.toLocaleString() ?? "—"}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">CTR</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatCtr(totals.data?.ctr ?? null)}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Avg pos</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.position?.toFixed(1) ?? "—"}
            </span>
          </span>
          <Badge
            variant={hasAnyData ? "success" : "outline"}
            className="ml-auto"
          >
            {hasAnyData ? "Reporting" : "No page data"}
          </Badge>
        </div>
        <div className="p-2">
          <MatrxDataTable
            urlState={{ id: "page-search-console" }}
            data={rows}
            columns={columns}
            getRowId={(row) => row.query}
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            emptyState={{
              title: "No query-level Search Console rows",
              description:
                "No query-level Search Console rows are stored for this page in the selected range.",
            }}
          />
        </div>
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Site sync last completed {formatDate(site.gsc_synced_at)}. Sync runs
          site-wide from site integrations — there is no page-only refresh.
          {truncated
            ? " Numbers are a floor: the bounded read capped out before the full range."
            : null}
        </p>
      </div>
    );
  }

  return (
    <SectionCard
      title="GSC"
      collapsible
      anchor="gsc_metrics_28d"
      headerExtra={rangeControl}
      copy={copy}
    >
      {body}
    </SectionCard>
  );
}
