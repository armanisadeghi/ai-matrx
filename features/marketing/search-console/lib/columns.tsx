/**
 * Shared MatrxDataTable column builders for every Search Console metric
 * table — the ONE definition of the key/clicks/impressions/CTR/position
 * column set (plus Δ columns when a compare period is active). Consumed by
 * `GscDimensionTable` (breakdown RPC), `DigResultsTable` (dig RPC), and the
 * Watchlist table so the tables can never drift apart. Structural row shape:
 * any row carrying the eight metric fields qualifies.
 */

import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
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

export function buildGscKeyColumn<T extends GscMetricRowShape>(
  dimension: GscDimension,
  header: string,
): MatrxColumnDef<T> {
  return {
    id: "key",
    accessorKey: "key",
    header,
    filter: false,
    cell: (row) => (
      <span
        className="block max-w-[28rem] truncate text-xs font-medium text-foreground sm:max-w-[36rem]"
        title={row.key}
      >
        {gscKeyCell(dimension, row.key)}
      </span>
    ),
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
      header: "Clicks",
      align: "right",
      filter: false,
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
      header: "Impressions",
      align: "right",
      filter: false,
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
      header: "CTR",
      align: "right",
      filter: false,
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
      header: "Position",
      align: "right",
      filter: false,
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
