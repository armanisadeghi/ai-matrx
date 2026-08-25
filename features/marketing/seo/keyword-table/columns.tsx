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

import Link from "next/link";

import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/styles/themes/utils";
import {
  buildGscMetricColumns,
  GSC_COMPACT_COLUMN_LABELS,
} from "@/features/marketing/search-console/lib/columns";
import type { GscBreakdownRow } from "@/features/marketing/search-console/types";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";
import { WhyScoreHint } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import {
  ClassCell,
  StampCell,
} from "@/features/marketing/seo/keyword-workbench/components/cells";
import { ServiceCell } from "@/features/marketing/seo/keyword-workbench/components/ServiceCell";
import { OFFERING_UNPLACED } from "@/features/marketing/seo/keyword-workbench/components/OfferingPicker";
import type { SiteServices } from "@/features/marketing/seo/keyword-workbench/hooks/useSiteServices";
import type { KeywordServicePlacement } from "@/features/marketing/seo/keyword-workbench/data";
import { marketingRoutes } from "@/features/marketing/lib/routes";
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
  /** Take a ruling back — the same write with `p_clear`. */
  onQuickClear: (
    keywordIds: string[],
    valueId: string,
    dimensionLabel: string,
  ) => void;
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
  /**
   * "This isn't something we offer" is a traffic class, not an offering — so
   * the Offering cell's door writes THIS value through the class path the
   * Class column already uses. Looked up, never hardcoded past a key: if the
   * platform vocabulary ever stops carrying it, the door disappears rather
   * than writing a class that does not exist.
   */
  const mismatchClass = (classDimension?.values ?? []).find(
    (value) => value.key === "mismatch" && !value.abstain,
  );

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
    columns.push(
      buildKeywordOfferingColumn({
        siteId,
        services,
        serviceFor,
        onPlace: handlers.onPlaceService,
        onFilter: handlers.onFilterByService,
        onNotOffered:
          // The SAME write the Class column makes — one path, one ruling.
          mismatchClass && classDimension
            ? (row) => {
                if (!row.keyword_id) return;
                handlers.onQuickAssign([row.keyword_id], {
                  dimensionId: classDimension.dimension_id,
                  dimensionSlug: classDimension.slug,
                  dimensionLabel: classDimension.label,
                  valueId: mismatchClass.value_id,
                  valueLabel: mismatchClass.label,
                });
              }
            : undefined,
      }),
    );
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
          onClear={() => {
            const current = valueFor(row)?.traffic_class ?? null;
            const value = (classDimension?.values ?? []).find(
              (v) => v.key === current,
            );
            if (!row.keyword_id || !value || !classDimension) return;
            handlers.onQuickClear(
              [row.keyword_id],
              value.value_id,
              classDimension.label,
            );
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
        return hit.decided_by === "unresolved"
          ? "~unresolved"
          : hit.location_name;
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
        if (!dimension) {
          return (
            <span
              className="block h-5 w-20 animate-pulse rounded bg-muted"
              aria-label={`Loading ${label} choices`}
            />
          );
        }
        return (
          <StampCell
            siteId={siteId}
            dimension={dimension}
            dimensions={data.dimensionCatalog}
            current={
              stamp
                ? {
                    dimensionId: dimension.dimension_id,
                    dimensionSlug: dimension.slug,
                    dimensionLabel: dimension.label,
                    valueId: stamp.valueId,
                    valueLabel: stamp.valueLabel,
                  }
                : null
            }
            source={stamp?.source ?? null}
            notes={stamp?.notes ?? null}
            onPick={(picked) =>
              handlers.onQuickAssign([row.keyword_id as string], picked)
            }
            onAssignWithReason={() =>
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
            onClear={
              stamp
                ? () =>
                    handlers.onQuickClear(
                      [row.keyword_id as string],
                      stamp.valueId,
                      dimension.label,
                    )
                : undefined
            }
            onFilter={
              stamp
                ? () => handlers.onFilterByStamp(slug, stamp.value)
                : undefined
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
      header: GSC_COMPACT_COLUMN_LABELS.score,
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
      header: GSC_COMPACT_COLUMN_LABELS.level,
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

/**
 * THE OFFERING COLUMN — "the first thing I wanna know is what service they map
 * to" (Arman, 2026-08-24), and "the other critical thing to put here would be
 * the one where you map it to an offering" (2026-08-25, MSR-06, said of the
 * Search Console → Queries table).
 *
 * It lives here rather than inside `buildKeywordColumns` because TWO tables now
 * carry it — the keyword table and the Search Console dimension table — and a
 * second definition is how the two would quietly stop agreeing about what
 * sorts, what filters, and what an unplaced keyword says. Both read the SAME
 * per-site offering catalog (`useSiteServices` over the topic tree) and write
 * through the SAME one placement RPC (`setKeywordService`); this module only
 * owns how the column looks and what it offers.
 *
 * Sort and filter are both SERVER-side (`gsc_perf_breakdown`: `p_sort: 'topic'`
 * and the `topic` filter, which takes a topic id — meaning that topic and
 * everything under it — or `none` for "nobody has placed this yet"). Filtering
 * to `none` is the whole point of the column: it is how a person finds the
 * keywords still waiting to be mapped.
 */
export function buildKeywordOfferingColumn({
  siteId,
  services,
  serviceFor,
  onPlace,
  onFilter,
  onNotOffered,
  width = 300,
}: {
  siteId: string;
  services: SiteServices;
  serviceFor: (row: GscBreakdownRow) => KeywordServicePlacement | undefined;
  /** Place one keyword on an offering, or take it off the tree with `null`. */
  onPlace: (keywordId: string, topicId: string | null, keyword: string) => void;
  /** Show every keyword that maps to this offering — the pattern-spotting door. */
  onFilter?: (topicId: string) => void;
  /**
   * "This isn't something we offer" — a traffic CLASS, not an offering. Pass it
   * only where the caller owns a class write that can carry the reason the
   * server demands for `mismatch`; the door disappears otherwise rather than
   * opening onto a rejected write.
   */
  onNotOffered?: (row: GscBreakdownRow) => void;
  width?: number;
}): MatrxColumnDef<GscBreakdownRow> {
  /**
   * EMPTY IS A REAL ANSWER. A site whose offering catalog is empty gets the
   * sentence and the door to the screen that owns the vocabulary — never a
   * dropdown with nothing in it, which reads as a broken control rather than
   * as work not done yet. The flat site path resolves the brand itself, so the
   * door is real from a surface that only knows the site id.
   */
  const manageHref = marketingRoutes.site(null, siteId, "/value/offerings");
  const noVocabulary = !services.loading && services.options.length === 0;

  return {
    id: "topic",
    header: "Offering",
    sortable: true,
    filter: "select",
    filterSingle: true,
    filterOptions: [
      { value: OFFERING_UNPLACED, label: "Not placed yet" },
      ...services.options.map((option) => ({
        value: option.topicId,
        label:
          option.depth > 0
            ? `${option.rootName} › ${option.name}`
            : option.name,
      })),
    ],
    width,
    accessorFn: (row) => serviceFor(row)?.topicName ?? "",
    cell: (row) => {
      if (!row.keyword_id) {
        return <span className="text-[11px] text-muted-foreground">—</span>;
      }
      if (noVocabulary) {
        return (
          <Link
            href={manageHref}
            onClick={(event) => event.stopPropagation()}
            className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            No offerings defined yet — define them
          </Link>
        );
      }
      return (
        // The cell IS a control, and on a table whose row click drills
        // somewhere else (Search Console) picking an offering must not also
        // open the row — one gesture, one meaning.
        <span
          className="flex min-w-0"
          onClick={(event) => event.stopPropagation()}
        >
          <ServiceCell
            siteId={siteId}
            services={services}
            placement={serviceFor(row)}
            onPlace={(topicId) =>
              onPlace(row.keyword_id as string, topicId, row.key)
            }
            {...(onFilter ? { onFilter } : {})}
            {...(onNotOffered ? { onNotOffered: () => onNotOffered(row) } : {})}
          />
        </span>
      );
    },
  };
}
