/**
 * Shared MatrxDataTable column builders for every Search Console metric
 * table — the ONE definition of the key/clicks/impressions/CTR/position
 * column set (plus Δ columns when a compare period is active). Consumed by
 * `GscDimensionTable` (breakdown RPC), `DigResultsTable` (dig RPC), and the
 * Watchlist table so the tables can never drift apart. Structural row shape:
 * any row carrying the eight metric fields qualifies.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import { ClassChip } from "@/features/marketing/search-console/components/insights/ClassChip";
import type { GscKeywordValueRow } from "@/features/marketing/search-console/data-insights";
import { WhyScoreHint } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import type { GscDimension } from "@/features/marketing/search-console/types";
import {
  countryLabel,
  deviceLabel,
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";

/** The metric fields every GSC table row carries (breakdown/dig/watch). */
export interface GscMetricRowShape {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  avg_position: number | null;
  cmp_clicks: number | null;
  cmp_impressions: number | null;
  cmp_ctr: number | null;
  cmp_avg_position: number | null;
}

/** Compact spreadsheet headers shared by every keyword-performance table. */
export const GSC_COMPACT_COLUMN_LABELS = {
  clicks: "CLICK",
  impressions: "IMPR",
  ctr: "CTR",
  position: "POS",
  score: "SCORE",
  level: "LEVEL",
} as const;

export function gscKeyCell(dimension: GscDimension, key: string): string {
  if (dimension === "country") return countryLabel(key);
  if (dimension === "device") return deviceLabel(key);
  return key;
}

export function gscDeltaCell(
  cur: number | null | undefined,
  prev: number | null | undefined,
  format: (v: number) => string,
  lowerIsBetter = false,
): { text: string; tone: "up" | "down" | "flat" } | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined)
    return null;
  const delta = cur - prev;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    text: `${delta > 0 ? "+" : ""}${format(delta)}`,
    tone: delta === 0 ? "flat" : improved ? "up" : "down",
  };
}

export function GscDeltaSpan({
  value,
}: {
  value: { text: string; tone: "up" | "down" | "flat" } | null;
}) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={
        value.tone === "flat"
          ? "text-xs tabular-nums text-muted-foreground"
          : value.tone === "up"
            ? "text-xs font-medium tabular-nums text-success"
            : "text-xs font-medium tabular-nums text-destructive"
      }
    >
      {value.text}
    </span>
  );
}

/**
 * THE DOOR LAW for every Search Console table at once.
 *
 * A page-dimension row names a canonical page that HAS an id (`page_id`, which
 * every `gsc_perf_*` RPC returns) and a route — so the key must be reachable,
 * not just printed. `recordHref` returns the record's destination for one row
 * (`null`/`undefined` = this row names nothing openable, e.g. a query row or a
 * URL Search Console reported that never matched a canonical page).
 *
 * The door is a trailing anchor rather than the whole cell on purpose: in these
 * tables the row click is the DRILLDOWN (queries for this page, pages for this
 * query), and swallowing that gesture would trade one destination for another.
 * The anchor is a real `next/link` — cmd-click, middle-click and keyboard focus
 * all work — and it stops propagation so the drill still belongs to the row.
 */
export function buildGscKeyColumn<T extends { key: string }>(
  dimension: GscDimension,
  header: string,
  recordHref?: (row: T) => string | null | undefined,
  /**
   * Cap this column's width. Without one the key column is the only unbounded
   * column in the table, so it takes every pixel the others leave and pushes
   * the ones to its right off the screen — measured 2026-08-25 on Queries at
   * 1362px: 592px of key column, and Position / Score / Level entirely
   * off-screen. Pass a width wherever the table carries the value columns.
   */
  width?: number,
): MatrxColumnDef<T> {
  return {
    id: "key",
    accessorKey: "key",
    header,
    ...(width === undefined ? {} : { width }),
    // MSR-03/04 — text contains, wired by the table to the same server-side
    // search the toolbar box already drives (one truth, two entry points).
    filter: "text",
    cell: (row) => {
      const href = recordHref?.(row) ?? null;
      const label = gscKeyCell(dimension, row.key);
      return (
        <span className="flex min-w-0 items-center gap-1">
          <span
            className={
              width === undefined
                ? "block max-w-[28rem] truncate text-xs font-medium text-foreground sm:max-w-[36rem]"
                : // A declared width is only a hint under `table-layout: auto`
                  // — the CELL has to agree to be narrow, or the text just
                  // widens the column back out.
                  "block max-w-[28rem] truncate text-xs font-medium text-foreground"
            }
            style={
              width === undefined
                ? undefined
                : { maxWidth: `${Math.max(width - 28, 120)}px` }
            }
            title={row.key}
          >
            {label}
          </span>
          {href ? (
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              title={`Open ${label} in the page workspace`}
              aria-label={`Open ${label} in the page workspace`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : null}
        </span>
      );
    },
  };
}

/**
 * The four metric columns, each followed by its Δ column when a compare
 * period is active. `sortableDeltas` marks which Δ columns the backing
 * query can actually order by (breakdown serves only delta_clicks; a local
 * table can sort them all).
 */
export function buildGscMetricColumns<T extends GscMetricRowShape>(
  hasCompare: boolean,
  sortableDeltas: "clicks-only" | "all" = "clicks-only",
): MatrxColumnDef<T>[] {
  const deltaSortable = sortableDeltas === "all";
  return [
    {
      id: "clicks",
      accessorKey: "clicks",
      header: GSC_COMPACT_COLUMN_LABELS.clicks,
      align: "right",
      width: 76,
      // MSR-03/04 — server-side range filter (`clicks_min`/`clicks_max`,
      // already live in `gsc_perf_breakdown`).
      filter: "number",
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatCount(row.clicks)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_clicks",
            header: "Δ Clicks",
            align: "right",
            width: 70,
            filter: false,
            accessorFn: (row) => row.clicks - (row.cmp_clicks ?? 0),
            cell: (row) => (
              <GscDeltaSpan
                value={gscDeltaCell(row.clicks, row.cmp_clicks, (v) =>
                  Math.round(v).toLocaleString(),
                )}
              />
            ),
          } satisfies MatrxColumnDef<T>,
        ]
      : []),
    {
      id: "impressions",
      accessorKey: "impressions",
      header: GSC_COMPACT_COLUMN_LABELS.impressions,
      align: "right",
      width: 92,
      filter: "number",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatCount(row.impressions)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_impressions",
            header: "Δ Impr.",
            align: "right",
            width: 76,
            sortable: deltaSortable,
            filter: false,
            accessorFn: (row) => row.impressions - (row.cmp_impressions ?? 0),
            cell: (row) => (
              <GscDeltaSpan
                value={gscDeltaCell(row.impressions, row.cmp_impressions, (v) =>
                  Math.round(v).toLocaleString(),
                )}
              />
            ),
          } satisfies MatrxColumnDef<T>,
        ]
      : []),
    {
      id: "ctr",
      accessorKey: "ctr",
      header: GSC_COMPACT_COLUMN_LABELS.ctr,
      align: "right",
      width: 68,
      // MSR-03/04 — new server-side range (`ctr_min`/`ctr_max`, fraction
      // 0..1 like the underlying value: type 0.02 for "2%").
      filter: "number",
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatCtr(row.ctr)}</span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_ctr",
            header: "Δ CTR",
            align: "right",
            width: 68,
            sortable: deltaSortable,
            filter: false,
            accessorFn: (row) =>
              row.ctr !== null && row.cmp_ctr !== null
                ? row.ctr - row.cmp_ctr
                : null,
            cell: (row) => (
              <GscDeltaSpan
                value={gscDeltaCell(
                  row.ctr,
                  row.cmp_ctr,
                  (v) => `${(v * 100).toFixed(2)}pp`,
                )}
              />
            ),
          } satisfies MatrxColumnDef<T>,
        ]
      : []),
    {
      id: "position",
      accessorKey: "avg_position",
      header: GSC_COMPACT_COLUMN_LABELS.position,
      align: "right",
      width: 76,
      // MSR-03/04 — server-side range filter (`position_min`/`position_max`,
      // already live).
      filter: "number",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatPosition(row.avg_position)}
        </span>
      ),
    },
    ...(hasCompare
      ? [
          {
            id: "delta_position",
            header: "Δ Pos.",
            align: "right",
            width: 70,
            sortable: deltaSortable,
            filter: false,
            accessorFn: (row) =>
              row.avg_position !== null && row.cmp_avg_position !== null
                ? row.avg_position - row.cmp_avg_position
                : null,
            cell: (row) => (
              <GscDeltaSpan
                value={gscDeltaCell(
                  row.avg_position,
                  row.cmp_avg_position,
                  (v) => v.toFixed(1),
                  true,
                )}
              />
            ),
          } satisfies MatrxColumnDef<T>,
        ]
      : []),
  ];
}

/** Human copy lines for one metric row — the shared Copy/Copy-for-AI body. */
export function gscMetricCopyLines(
  columnLabel: string,
  dimension: GscDimension,
  row: GscMetricRowShape,
): [string, string | null][] {
  return [
    [columnLabel, gscKeyCell(dimension, row.key)],
    ["Clicks", formatCount(row.clicks)],
    ["Impressions", formatCount(row.impressions)],
    ["CTR", formatCtr(row.ctr)],
    ["Position", formatPosition(row.avg_position)],
    [
      "Prev clicks",
      row.cmp_clicks != null ? formatCount(row.cmp_clicks) : null,
    ],
    [
      "Prev position",
      row.cmp_avg_position != null
        ? formatPosition(row.cmp_avg_position)
        : null,
    ],
  ];
}


/**
 * C6/C5 — Class · Score · Level for a keyword-bearing row, resolved by
 * `seo.gsc_keyword_value_for` for EXACTLY the rows on screen (THE SCOPE RULE:
 * never the whole site from the browser). ONE definition, shared by the
 * Queries breakdown table and the Dig Here results table — the second copy
 * of this block was the drift waiting to happen.
 *
 * A level names nothing (P18): it is a threshold word over the score, and the
 * title says where the number came from rather than dressing it up.
 */
export function buildGscValueColumns<T>(
  valueFor: (row: T) => GscKeywordValueRow | undefined,
  /**
   * The receipt's link context + how to read a row's keyword text. Present =
   * the Level cell carries its (i) hover receipt, and every step in that
   * receipt links to the screen where it is changed. Omit only where no site
   * context exists (there is no such caller today).
   */
  why?: {
    siteId: string;
    brandId?: string | null;
    keywordOf: (row: T) => string | null;
  },
  /**
   * Make Class editable IN THE CELL (Arman, 2026-08-24: "anything that's
   * editable, I should be able to directly edit from the list… a dropdown and
   * pick the option"). The consumer supplies how to find a row's keyword id —
   * a row without one cannot be ruled — and wires the table's
   * `edit={{ enabled, onSave }}` to `setGscKeywordClass`.
   *
   * `mismatch` is deliberately NOT offered here: the server requires a written
   * reason for it, and a dropdown cannot collect one. It stays in the ruling
   * surfaces that ask for the reason.
   */
  editing?: { keywordIdOf: (row: T) => string | null },
  /**
   * MSR-03/04 — the Level column's filter options, i.e. this SITE's own
   * value-band vocabulary (bands are per-site — there is no fixed enum).
   * Omit to fall back to the two reserved bands every site always has
   * (`unvalued`, `negative`); a caller with the vocabulary loaded should
   * always pass it.
   */
  levelFilterOptions?: Array<{ value: string; label: string }>,
): MatrxColumnDef<T>[] {
  return [
    {
      id: "traffic_class",
      header: "Class",
      // MSR-03/04 — server-side sort (`gsc_perf_breakdown` `p_sort:
      // 'traffic_class'`) and filter (`traffic_classes`, OR-of-selected via
      // the shared class map — resolved for THIS site's window, never the
      // global corpus).
      sortable: true,
      filter: "select",
      filterOptions: [
        { value: "money", label: "Money" },
        { value: "educational", label: "Educational" },
        { value: "brand", label: "Brand" },
        { value: "mismatch", label: "Mismatch" },
        { value: "unclassified", label: "Unclassified" },
      ],
      width: 100,
      accessorFn: (row) => valueFor(row)?.traffic_class ?? "",
      ...(editing
        ? {
            editable: "select" as const,
            editOptions: [
              { value: "money", label: "Money" },
              { value: "educational", label: "Educational" },
              { value: "brand", label: "Brand" },
              { value: "clear", label: "Unclassified" },
            ],
            editableIf: (row: T) => Boolean(editing.keywordIdOf(row)),
          }
        : {}),
      cell: (row) => {
        const v = valueFor(row);
        if (!v) {
          return <span className="text-[11px] text-muted-foreground">—</span>;
        }
        return <ClassChip trafficClass={v.traffic_class} />;
      },
    },
    {
      id: "value_score",
      header: GSC_COMPACT_COLUMN_LABELS.score,
      // MSR-03/04 — server-side sort (`p_sort: 'value_score'`) and range
      // filter (`value_score_min`/`value_score_max`).
      sortable: true,
      filter: "number",
      align: "right",
      width: 72,
      accessorFn: (row) => valueFor(row)?.value_score ?? null,
      cell: (row) => {
        const v = valueFor(row);
        return (
          <span className="text-xs tabular-nums text-foreground">
            {v?.value_score === null || v?.value_score === undefined
              ? "—"
              : Math.round(Number(v.value_score)).toLocaleString()}
          </span>
        );
      },
    },
    {
      id: "value_band",
      header: GSC_COMPACT_COLUMN_LABELS.level,
      // MSR-03/04 — server-side sort (`p_sort: 'value_band'`) and filter
      // (rides the EXISTING `levels` RPC filter, unchanged since C6).
      sortable: true,
      filter: "select",
      filterOptions: levelFilterOptions ?? [
        { value: "unvalued", label: "Unvalued" },
        { value: "negative", label: "Negative" },
      ],
      width: 100,
      accessorFn: (row) => valueFor(row)?.value_band ?? "",
      cell: (row) => {
        const v = valueFor(row);
        if (!v?.value_band) {
          return <span className="text-[11px] text-muted-foreground">—</span>;
        }
        const tone =
          v.value_band === "negative"
            ? "text-destructive"
            : v.value_band === "unvalued"
              ? "text-muted-foreground"
              : "text-foreground";
        return (
          <span className="inline-flex min-w-0 items-center gap-1">
            <span
              className={`rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
              title={
                v.value_source === "override"
                  ? "Your ruling"
                  : v.value_source === "computed"
                    ? "Computed from your dimensions and worth"
                    : "No worth reaches this keyword yet"
              }
            >
              {humanizeSlug(v.value_band)}
            </span>
            {why ? (
              <WhyScoreHint
                subject={{
                  keywordId: v.keyword_id,
                  keyword: why.keywordOf(row),
                  valueBand: v.value_band,
                  valueScore: v.value_score,
                  valueSource: v.value_source,
                  reasons: v.reasons,
                }}
                context={{
                  brandId: why.brandId ?? null,
                  siteId: why.siteId,
                  keyword: why.keywordOf(row),
                }}
              />
            ) : null}
          </span>
        );
      },
    },
  ];
}
