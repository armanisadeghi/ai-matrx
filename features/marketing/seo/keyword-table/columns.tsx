"use client";

/**
 * THE KEYWORD TABLE — the ONE column set (P26).
 *
 * Arman, 2026-08-24: "This is the bare bones table. The core data doesn't
 * change. The things you can sort and filter by do not change. Now we can add
 * and remove columns, and that's what we have to do — they all need to be one
 * single table at the core."
 *
 * So this module owns every keyword column in the product. A surface picks
 * WHICH of them it opens on (`visible`) and may append its own action column;
 * it never gets to decide whether Clicks sorts, or whether Class filters.
 *
 * Server vs browser: `clicks`, `impressions`, `ctr`, `position`, `key` and
 * `topic` sort in the RPC, and their filters are RPC filters too (metric
 * ranges, the service subtree, the stamp pairs). The remaining columns sort
 * the page on screen and the table SAYS so — sorting 5,823 rows by a stamp the
 * browser never fetched is exactly the quiet lie this system exists to stop.
 */

import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/styles/themes/utils";
import { buildGscMetricColumns } from "@/features/marketing/search-console/lib/columns";
import type { GscBreakdownRow } from "@/features/marketing/search-console/types";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import { WhyScoreHint } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import { ClassCell, StampCell } from "@/features/marketing/seo/keyword-workbench/components/cells";
import { ServiceCell } from "@/features/marketing/seo/keyword-workbench/components/ServiceCell";
import { SERVICE_UNPLACED } from "@/features/marketing/seo/keyword-workbench/components/ServicePicker";
import type { PickedValue } from "@/features/marketing/seo/keyword-workbench/components/DimensionValuePicker";
import { LocationCell } from "@/features/marketing/seo/value-system/locations/LocationCell";
import type { KeywordCoreColumnId } from "./state";
import type { KeywordRowsResult } from "./useKeywordRows";

export interface KeywordColumnHandlers {
  /** Place one keyword on a service (or take it off the tree with `null`). */
  onPlaceService: (
    keywordId: string,
    topicId: string | null,
    keyword: string,
  ) => void;
  /** Filter the whole list to one service subtree (or clear it). */
  onFilterByService: (topicId: string | undefined) => void;
  /** Assign one dimension value to one keyword, no dialog (P23). */
  onQuickAssign: (keywordIds: string[], picked: PickedValue) => void;
  /** Open the reason-carrying assign panel for one keyword. */
  onAssign: (
    keywordId: string,
    keyword: string,
    lockedDimensionSlug?: string,
    initial?: PickedValue | null,
  ) => void;
  /** Toggle one dimension:value pair in the server-side stamp filter. */
  onFilterByStamp: (dimensionSlug: string, valueKey: string) => void;
  /**
   * C10 — filter the whole list to one business location, or to the
   * `unresolved` / `not_local` bucket. Server-side, like every other filter
   * here: "the searches this branch owns" over 45,385 keywords must mean all
   * of them, not the fifty the browser is holding.
   */
  onFilterByLocation: (value: string | undefined) => void;
}

export interface BuildKeywordColumnsInput {
  visible: readonly KeywordCoreColumnId[];
  /** Dimension slugs the user added as columns, in order. */
  dimensions: string[];
  data: KeywordRowsResult;
  siteId: string;
  brandId: string;
  hasCompare: boolean;
  handlers: KeywordColumnHandlers;
}

export function buildKeywordColumns({
  visible,
  dimensions,
  data,
  siteId,
  brandId,
  hasCompare,
  handlers,
}: BuildKeywordColumnsInput): MatrxColumnDef<GscBreakdownRow>[] {
  const {
    stampFor,
    valueFor,
    serviceFor,
    locationFor,
    locationsReady,
    classDimension,
    services,
  } = data;
  const shown = new Set<string>(visible);
  const columns: MatrxColumnDef<GscBreakdownRow>[] = [];

  if (shown.has("key")) {
    columns.push({
      id: "key",
      header: "Keyword",
      sortable: true,
      filter: "text",
      accessorKey: "key",
      // NEVER truncated — a keyword you cannot read is a row you cannot judge.
      cell: (row) => (
        <span className="block break-words text-xs text-foreground">
          {row.key}
        </span>
      ),
    });
  }

  if (shown.has("topic")) {
    columns.push({
      /**
       * THE SERVICE COLUMN — "the first thing I wanna know is what service
       * they map to". It sits next to the keyword because that is the order a
       * person reads: the phrase, then what it is FOR, then how we classify
       * it, then the dimensions, then the numbers.
       */
      id: "topic",
      header: "Service",
      sortable: true,
      filter: "select",
      filterSingle: true,
      filterOptions: [
        { value: SERVICE_UNPLACED, label: "Not placed yet" },
        ...services.options.map((option) => ({
          value: option.topicId,
          label:
            option.depth > 0 ? `${option.rootName} › ${option.name}` : option.name,
        })),
      ],
      width: 300,
      accessorFn: (row) => serviceFor(row)?.topicName ?? "",
      cell: (row) => {
        if (!row.keyword_id) {
          return <span className="text-[11px] text-muted-foreground">—</span>;
        }
        return (
          <ServiceCell
            siteId={siteId}
            services={services}
            placement={serviceFor(row)}
            onPlace={(topicId) =>
              handlers.onPlaceService(row.keyword_id as string, topicId, row.key)
            }
            onFilter={(topicId) => handlers.onFilterByService(topicId)}
          />
        );
      },
    });
  }

  if (shown.has("traffic_class")) {
    columns.push({
      id: "traffic_class",
      header: "Class",
      sortable: true,
      filter: "select",
      filterSingle: true,
      filterOptions: (classDimension?.values ?? [])
        .filter((v) => !v.abstain)
        .map((v) => ({ value: v.key, label: v.label })),
      width: 140,
      accessorFn: (row) => valueFor(row)?.traffic_class ?? "",
      cell: (row) => (
        <ClassCell
          current={valueFor(row)?.traffic_class ?? null}
          source={valueFor(row)?.class_source ?? null}
          options={(classDimension?.values ?? []).filter((v) => !v.abstain)}
          disabled={!row.keyword_id}
          onPick={(value) => {
            if (!row.keyword_id || !classDimension) return;
            handlers.onQuickAssign([row.keyword_id], {
              dimensionId: classDimension.dimension_id,
              dimensionSlug: classDimension.slug,
              dimensionLabel: classDimension.label,
              valueId: value.value_id,
              valueLabel: value.label,
            });
          }}
          onAssignWithReason={() => {
            if (!row.keyword_id) return;
            handlers.onAssign(row.keyword_id, row.key, "traffic_class");
          }}
          onMakeYourOwn={() => {
            if (!row.keyword_id) return;
            // No locked dimension: the picker opens on the whole catalog and
            // will create a dimension of their own from whatever they type.
            handlers.onAssign(row.keyword_id, row.key);
          }}
        />
      ),
    });
  }

  if (shown.has("location")) {
    /**
     * C10 — WHICH BRANCH. Options are the brand's real locations plus the two
     * buckets the Which-location panel already names, so the filter and the
     * panel cannot disagree about what "unresolved" means.
     *
     * With no locations recorded the column still earns its width: every row
     * reads "No location" or "Not local", which is the honest state and the
     * reason to go add one — never a silent dash over a missing feature.
     */
    columns.push({
      id: "location",
      header: "Location",
      sortable: true,
      filter: "select",
      filterSingle: true,
      filterOptions: [
        ...data.brandLocations.map((location) => ({
          value: location.id,
          label: location.locality
            ? `${location.name} — ${location.locality}`
            : location.name,
        })),
        { value: "unresolved", label: "Local — no location yet" },
        { value: "not_local", label: "Not location-specific" },
      ],
      width: 180,
      accessorFn: (row) => {
        const hit = locationFor(row);
        if (!hit) return "";
        return hit.decided_by === "unresolved" ? "~unresolved" : hit.location_name;
      },
      cell: (row) => (
        <LocationCell
          attribution={locationFor(row)}
          ready={locationsReady}
          onFilter={handlers.onFilterByLocation}
        />
      ),
    });
  }

  for (const slug of dimensions) {
    const dimension = data.dimensionCatalog.find((d) => d.slug === slug);
    // A site dimension's slug carries a `site_<8 hex>_` prefix that exists so
    // two sites can both own "Buyer stage". It is plumbing, and a header that
    // reads "SITE 38EFF4C9 BUYER STAGE" while the catalog loads is plumbing on
    // the user's screen.
    const label =
      dimension?.label ?? humanizeSlug(slug.replace(/^site_[0-9a-f]{8}_/, ""));
    columns.push({
      id: `dim:${slug}`,
      header: label,
      sortable: true,
      filter: "select",
      filterOptions: (dimension?.values ?? [])
        .filter((v) => !v.abstain)
        .map((v) => ({ value: v.key, label: v.label })),
      filterSingle: true,
      width: 150,
      // An INTENTIONAL phone column set: keyword, class, clicks, level. A
      // phone that opens onto eight columns of horizontal scroll is a phone
      // nobody reads the meaning columns on anyway.
      mobileHidden: true,
      accessorFn: (row) => stampFor(row, slug)?.valueLabel ?? "",
      cell: (row) => {
        const stamp = stampFor(row, slug);
        if (!row.keyword_id) {
          return <span className="text-[11px] text-muted-foreground">—</span>;
        }
        return (
          <StampCell
            label={stamp?.valueLabel ?? null}
            source={stamp?.source ?? null}
            notes={stamp?.notes ?? null}
            onAssign={() =>
              handlers.onAssign(
                row.keyword_id as string,
                row.key,
                slug,
                stamp && dimension
                  ? {
                      dimensionId: dimension.dimension_id,
                      dimensionSlug: dimension.slug,
                      dimensionLabel: dimension.label,
                      valueId: stamp.valueId,
                      valueLabel: stamp.valueLabel,
                    }
                  : null,
              )
            }
            onFilter={
              stamp ? () => handlers.onFilterByStamp(slug, stamp.value) : undefined
            }
          />
        );
      },
    });
  }

  /**
   * THE METRIC COLUMNS. `buildGscMetricColumns` ships them with `filter: false`
   * because most Search Console tables have no server-side metric filter to
   * back one. This table does (`clicks_min/max`, `impressions_min/max`,
   * `position_min/max` on `gsc_perf_breakdown`), so here they filter — P26:
   * a surface may change which columns SHOW, never whether they sort or filter.
   */
  const metricFilterable = new Set(["clicks", "impressions", "position"]);
  for (const column of buildGscMetricColumns<GscBreakdownRow>(
    hasCompare,
    "clicks-only",
  )) {
    const id = column.id ?? "";
    if (id === "delta_clicks" || id === "delta_impressions") {
      if (shown.has("clicks") || shown.has("impressions")) columns.push(column);
      continue;
    }
    if (!shown.has(id as KeywordCoreColumnId)) continue;
    columns.push(
      metricFilterable.has(id) ? { ...column, filter: "number" } : column,
    );
  }

  if (shown.has("value_score")) {
    columns.push({
      id: "value_score",
      header: "Score",
      sortable: true,
      filter: false,
      align: "right",
      width: 76,
      mobileHidden: true,
      accessorFn: (row) => valueFor(row)?.value_score ?? null,
      cell: (row) => {
        const value = valueFor(row);
        return (
          <span className="text-xs tabular-nums text-foreground">
            {value?.value_score == null
              ? "—"
              : Math.round(Number(value.value_score)).toLocaleString()}
          </span>
        );
      },
    });
  }

  if (shown.has("value_band")) {
    columns.push({
      id: "value_band",
      header: "Level",
      sortable: true,
      // Level filters on the SERVER (`levels` → `lv=`), so the funnel on this
      // column means the whole list, not the fifty rows on screen.
      filter: "select",
      filterSingle: true,
      filterOptions: data.bands.map((band) => ({
        value: band.value,
        label: band.label,
      })),
      width: 130,
      accessorFn: (row) => valueFor(row)?.value_band ?? "",
      cell: (row) => {
        const value = valueFor(row);
        if (!value)
          return <span className="text-[11px] text-muted-foreground">—</span>;
        return (
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
                value.value_band === "negative"
                  ? "text-destructive"
                  : value.value_band === "unvalued"
                    ? "text-muted-foreground"
                    : "text-foreground",
              )}
            >
              {value.value_band ? humanizeSlug(value.value_band) : "—"}
            </span>
            <WhyScoreHint
              subject={{
                keywordId: row.keyword_id,
                keyword: row.key,
                valueBand: value.value_band,
                valueScore: value.value_score,
                valueSource: value.value_source,
                reasons: value.reasons,
              }}
              context={{ brandId, siteId, keyword: row.key }}
            />
          </span>
        );
      },
    });
  }

  return columns;
}
