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
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Gem, Scale, Tags } from "lucide-react";
import { useOpenKeywordClassificationWindow } from "@/features/overlays/openers/keywordClassificationWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/styles/themes/utils";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
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
  GscClassSummaryRow,
  GscJuiceRow,
  GscResolvedPeriods,
  GscShiftRow,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";
import {
  GSC_TRAFFIC_CLASSES,
  formatCount,
} from "@/features/marketing/search-console/types";
import { ClassChip } from "./ClassChip";
import {
  getValueSummary,
  getValueVocabulary,
} from "@/features/marketing/seo/value-system/data";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import { levelVocabularyHref } from "@/features/marketing/seo/value-system/reason-links";
import type { ValueSummaryRow } from "@/features/marketing/seo/value-system/types";

/**
 * C6 — ONE LEVEL ROW: `seo.gsc_perf_value_summary` returns a row per
 * (band, source), so the same level arrives split between "computed" and
 * "your ruling". A reader asking "how did Platinum do" means the level, not
 * the provenance of the level — so the sources are summed here and the
 * provenance stays where it belongs, on the keyword's receipt.
 */
interface LevelRow {
  value_band: string;
  clicks: number;
  impressions: number;
  queries: number;
  cmp_clicks: number;
  cmp_impressions: number;
  cmp_queries: number;
}

function rollUpLevels(rows: ValueSummaryRow[]): LevelRow[] {
  const byBand = new Map<string, LevelRow>();
  for (const row of rows) {
    const existing = byBand.get(row.value_band);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.queries += row.queries;
      existing.cmp_clicks += row.cmp_clicks ?? 0;
      existing.cmp_impressions += row.cmp_impressions ?? 0;
      existing.cmp_queries += row.cmp_queries ?? 0;
    } else {
      byBand.set(row.value_band, {
        value_band: row.value_band,
        clicks: row.clicks,
        impressions: row.impressions,
        queries: row.queries,
        cmp_clicks: row.cmp_clicks ?? 0,
        cmp_impressions: row.cmp_impressions ?? 0,
        cmp_queries: row.cmp_queries ?? 0,
      });
    }
  }
  return [...byBand.values()].sort((a, b) => b.clicks - a.clicks);
}

function pct(current: number, compare: number): number | null {
  if (compare === 0) return current === 0 ? 0 : null;
  return ((current - compare) / compare) * 100;
}

/**
 * THE HEADLINE Arman reads weekly: "the site is flat while Platinum fell."
 * A site-level number that hides a collapse in the traffic that pays is the
 * exact failure the value system exists to catch — so when the totals barely
 * move and one level moves hard, that divergence IS the story, said in one
 * sentence. When nothing diverges, the sentence stays honest and says so.
 */
function levelHeadline(
  levels: LevelRow[],
  labelOf: (band: string) => string,
): { text: string; tone: "alarm" | "calm" } | null {
  const totals = levels.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      cmp: acc.cmp + row.cmp_clicks,
    }),
    { clicks: 0, cmp: 0 },
  );
  if (totals.clicks === 0 && totals.cmp === 0) return null;
  const sitePct = pct(totals.clicks, totals.cmp);
  // "Real" levels only — `unvalued` is the absence of a verdict, so a swing in
  // it is a meaning gap, not a business signal, and it never leads.
  const ranked = levels
    .filter(
      (row) =>
        row.value_band !== "unvalued" && (row.clicks > 0 || row.cmp_clicks > 0),
    )
    .map((row) => ({ row, delta: pct(row.clicks, row.cmp_clicks) }))
    .filter((entry) => entry.delta !== null)
    .sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number));
  const worst = ranked[0];
  if (!worst) return null;
  const worstPct = worst.delta as number;
  const label = labelOf(worst.row.value_band);
  const move = `${worstPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(worstPct))}%`;
  const siteMove =
    sitePct === null
      ? "Overall clicks have no comparable period"
      : Math.abs(sitePct) < 5
        ? `Clicks are flat overall (${sitePct >= 0 ? "+" : ""}${Math.round(sitePct)}%)`
        : `Clicks are ${sitePct >= 0 ? "up" : "down"} ${Math.abs(Math.round(sitePct))}% overall`;
  const diverges =
    sitePct !== null && Math.abs(sitePct) < 5 && Math.abs(worstPct) >= 15;
  return {
    text: diverges
      ? `${siteMove} — but ${label} is ${move}.`
      : `${siteMove}. ${label} moved the most: ${move}.`,
    tone: diverges || worstPct <= -15 ? "alarm" : "calm",
  };
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
  // C6 — the second decomposition. Class says what KIND of traffic; level says
  // what it is WORTH. Both filter the same movers list, independently.
  const [valueLevel, setValueLevel] = useState<string | null>(null);
  const [direction, setDirection] = useState<"gain" | "loss">("loss");
  const openClassificationWindow = useOpenKeywordClassificationWindow();
  const summary = useGscClassSummary(siteId, periods);
  const valueSummary = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "value-summary",
      siteId,
      periods.current.start,
      periods.current.end,
      periods.compare?.start ?? null,
      periods.compare?.end ?? null,
    ],
    queryFn: ({ signal }) =>
      getValueSummary(
        siteId,
        periods.current.start,
        periods.current.end,
        periods.compare?.start ?? null,
        periods.compare?.end ?? null,
        signal,
      ),
    staleTime: 60_000,
  });
  const vocabulary = useQuery({
    queryKey: ["marketing", "gsc", "value-vocabulary", siteId],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const levelLabel = (band: string) =>
    (vocabulary.data ?? []).find((def) => def.value === band)?.label ??
    humanizeSlug(band);
  const levelRows = rollUpLevels(valueSummary.data ?? []);
  const headline = levelHeadline(levelRows, levelLabel);
  const movers = useGscClassMovers(
    siteId,
    periods,
    dimension,
    trafficClass,
    direction,
    valueLevel ? [valueLevel] : [],
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
    // THE DOOR LAW: a page-dimension mover names a canonical page the RPC
    // already resolved (`page_id`) — that page has a route, so it gets a door.
    buildGscKeyColumn<GscClassMoverRow>(
      dimension,
      dimension === "query" ? "Query" : "Page",
      (row) =>
        dimension === "page" && row.page_id
          ? marketingRoutes.sitePage(null, siteId, row.page_id)
          : null,
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
      // The row's dominant level, resolved server-side by the one resolver.
      id: "value_band",
      header: "Level",
      sortable: false,
      filter: false,
      width: 110,
      accessorFn: (row) => row.value_band ?? "",
      cell: (row) => (
        <span
          className={cn(
            "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
            row.value_band === "negative"
              ? "text-destructive"
              : row.value_band === "unvalued"
                ? "text-muted-foreground"
                : "text-foreground",
          )}
        >
          {row.value_band ? levelLabel(row.value_band) : "—"}
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
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {num(row.clicks)}
          <span className="text-muted-foreground">
            {" "}
            / {num(row.cmp_clicks)}
          </span>
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
  const summaryColumns: MatrxColumnDef<GscClassSummaryRow>[] = [
    {
      id: "traffic_class",
      accessorKey: "traffic_class",
      header: "Class",
      filter: "select",
      cell: (row) => <ClassChip trafficClass={row.traffic_class} />,
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      cell: (row) => num(row.clicks),
    },
    {
      id: "click_delta",
      accessorFn: (row) => row.clicks - (row.cmp_clicks ?? 0),
      header: "Click change",
      filter: "number",
      align: "right",
      cell: (row) => deltaSpan(row.clicks, row.cmp_clicks ?? 0),
    },
    {
      id: "click_share",
      accessorFn: (row) => (totals.clicks > 0 ? row.clicks / totals.clicks : 0),
      header: "Click share",
      filter: "number",
      align: "right",
      cell: (row) =>
        totals.clicks > 0
          ? `${((row.clicks / totals.clicks) * 100).toFixed(0)}%`
          : "—",
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      cell: (row) => num(row.impressions),
    },
    {
      id: "impression_delta",
      accessorFn: (row) => row.impressions - (row.cmp_impressions ?? 0),
      header: "Impression change",
      filter: "number",
      align: "right",
      cell: (row) => deltaSpan(row.impressions, row.cmp_impressions ?? 0),
    },
    {
      id: "queries",
      accessorKey: "queries",
      header: "Queries",
      filter: "number",
      align: "right",
      cell: (row) => num(row.queries),
    },
  ];

  const levelTotals = levelRows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      cmp: acc.cmp + row.cmp_clicks,
    }),
    { clicks: 0, cmp: 0 },
  );
  const levelColumns: MatrxColumnDef<LevelRow>[] = [
    {
      id: "value_band",
      accessorKey: "value_band",
      header: "Level",
      filter: "select",
      cell: (row) => (
        <span
          className={cn(
            "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
            row.value_band === "negative"
              ? "text-destructive"
              : row.value_band === "unvalued"
                ? "text-muted-foreground"
                : "text-foreground",
          )}
        >
          {levelLabel(row.value_band)}
        </span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      cell: (row) => num(row.clicks),
    },
    {
      id: "click_delta",
      accessorFn: (row) => row.clicks - row.cmp_clicks,
      header: "Click change",
      filter: "number",
      align: "right",
      cell: (row) => deltaSpan(row.clicks, row.cmp_clicks),
    },
    {
      id: "click_share",
      accessorFn: (row) =>
        levelTotals.clicks > 0 ? row.clicks / levelTotals.clicks : 0,
      header: "Click share",
      filter: "number",
      align: "right",
      cell: (row) =>
        levelTotals.clicks > 0
          ? `${((row.clicks / levelTotals.clicks) * 100).toFixed(0)}%`
          : "—",
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      cell: (row) => num(row.impressions),
    },
    {
      id: "queries",
      accessorKey: "queries",
      header: "Keywords",
      filter: "number",
      align: "right",
      cell: (row) => num(row.queries),
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
      {headline ? (
        // The weekly read, in one sentence, in the place Arman already looks.
        <p
          className={cn(
            "flex shrink-0 items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
            headline.tone === "alarm"
              ? "border-warning/40 bg-warning/10 text-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <Gem className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">{headline.text}</span>
        </p>
      ) : null}
      <div className="shrink-0 overflow-hidden rounded-md border border-border p-2">
        <MatrxDataTable
          urlState={{ id: "gsc-class-summary", selectedRow: false }}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          data={summaryRows}
          columns={summaryColumns}
          getRowId={(row) => row.traffic_class}
          isLoading={summary.isLoading}
          pageSize={10}
          selectedId={trafficClass}
          onRowOpen={(row) =>
            setTrafficClass((current) =>
              current === row.traffic_class
                ? null
                : (row.traffic_class as GscTrafficClass),
            )
          }
          rowActions={(row) => (
            <Link
              href={`/marketing/sites/${siteId}/keywords?view=classification&f_traffic_class=select:${row.traffic_class}`}
              className="whitespace-nowrap text-[11px] text-primary hover:underline"
              title={
                row.traffic_class === "unclassified"
                  ? "Open the classification queue — every unclassified keyword, biggest impressions first"
                  : `Review and override ${row.traffic_class} keywords`
              }
            >
              {row.traffic_class === "unclassified" ? "Classify →" : "Review →"}
            </Link>
          )}
          emptyState={{
            title: "No traffic-class data",
            description: `No data ${describeGscWindow(periods.current)}.`,
          }}
        />
        {summaryRows.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Total: {num(totals.clicks)} clicks (
            {deltaSpan(totals.clicks, totals.cmp)}) · {num(totals.impressions)}{" "}
            impressions ({deltaSpan(totals.impressions, totals.cmpImpressions)})
            · {num(totals.queries)} queries
          </p>
        ) : null}
      </div>
      {/* BY LEVEL — the decomposition beside the class one, same shape, same
          click-to-filter behaviour. Class and Level answer different questions
          and are never merged into one table. */}
      {/* No `overflow-hidden` here: this block sizes to its content, and a
          clipping wrapper around an auto-height table hides the last row
          instead of scrolling it (useClippedContentGuard catches exactly
          that). */}
      <div className="shrink-0 rounded-md border border-border p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-foreground">By level</p>
          <Link
            href={levelVocabularyHref({ brandId: null, siteId })}
            className="text-[11px] text-primary hover:underline"
            title="Levels are your words and your thresholds — edit them"
          >
            Edit the level vocabulary →
          </Link>
        </div>
        {valueSummary.isError ? (
          <ErrorPanel error={valueSummary.error} />
        ) : (
          <MatrxDataTable<LevelRow>
            urlState={{ id: "gsc-value-summary", selectedRow: false }}
            data={levelRows}
            columns={levelColumns}
            getRowId={(row) => row.value_band}
            isLoading={valueSummary.isLoading}
            isFetching={valueSummary.isFetching}
            pageSize={10}
            // A level row is a FILTER, not a record. Opening a detail drawer
            // on it shows raw column names and a slug ("negative") in place of
            // the reader's own word for the level — the row's real door is
            // "Review →".
            detail={{ enabled: false }}
            window={{ enabled: false }}
            selectedId={valueLevel}
            onRowOpen={(row) =>
              setValueLevel((current) =>
                current === row.value_band ? null : row.value_band,
              )
            }
            rowActions={(row) => (
              <Link
                href={`/marketing/sites/${siteId}/value?band=${encodeURIComponent(row.value_band)}`}
                className="whitespace-nowrap text-[11px] text-primary hover:underline"
                title={`Review the keywords sitting at ${levelLabel(row.value_band)}`}
              >
                Review →
              </Link>
            )}
            emptyState={{
              title: "No level data",
              description: `No keyword carries a level ${describeGscWindow(periods.current)}. Give a topic worth, or rule a level directly, and this fills in.`,
            }}
          />
        )}
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
        ) : null}
        {valueLevel ? (
          <button
            type="button"
            className="rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setValueLevel(null)}
          >
            Level: {levelLabel(valueLevel)} ✕
          </button>
        ) : null}
        {!trafficClass && !valueLevel ? (
          <span className="text-xs text-muted-foreground">
            Click a class or level row above to filter the movers.
          </span>
        ) : null}
      </div>
      <div className="min-h-[20rem] flex-1">
        {movers.isError ? (
          <ErrorPanel error={movers.error} />
        ) : (
          <MatrxDataTable<GscClassMoverRow>
            urlState={{ id: "gsc-class-movers" }}
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
              listDescription: `${direction === "gain" ? "Gaining" : "Losing"} ${dimension === "query" ? "queries" : "pages"}${trafficClass ? ` in the ${trafficClass} class` : ""}${valueLevel ? ` at the ${levelLabel(valueLevel)} level` : ""}, decomposed by traffic class and value level server-side.`,
              humanRow: (row) =>
                humanLines([
                  [dimension === "query" ? "Query" : "Page", row.key],
                  ["Class", row.traffic_class],
                  ["Level", row.value_band ? levelLabel(row.value_band) : "—"],
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
                value_level: valueLevel ?? "all",
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
              description: `No ${trafficClass ? `${trafficClass} ` : ""}${valueLevel ? `${levelLabel(valueLevel)} ` : ""}row moved in this direction ${describeGscWindow(periods.current)} vs the compare period.`,
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
          Showing the top {rows.length} of {formatCount(total)} shifted queries.
        </p>
      ) : null}
      <MatrxDataTable<GscShiftRow>
        urlState={{ id: "gsc-class-shifts" }}
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
    // Every juice row IS a page — `gsc_perf_juice` returns its `page_id`.
    buildGscKeyColumn<GscJuiceRow>("page", "Page", (row) =>
      row.page_id ? marketingRoutes.sitePage(null, siteId, row.page_id) : null,
    ),
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
        urlState={{ id: "gsc-link-juice" }}
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
