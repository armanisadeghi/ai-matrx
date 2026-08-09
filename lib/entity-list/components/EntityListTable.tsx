"use client";

// lib/entity-list/components/EntityListTable.tsx
//
// The default view. Built on the canonical MatrxDataTable (sticky header,
// zebra, inline edit + save pill) in CONTROLLED mode: the table owns none of
// the querying, so sort, filter and pagination are real server operations over
// the WHOLE result set — never a re-sort of the loaded page.
//
// Three behaviours worth stating plainly:
//   * EVERY column sorts and filters (app policy). The controlled
//     `columnFilters` state maps 1:1 onto `<feature>_list_scoped(p_filters)`,
//     and finite-valued columns get real options with counts from the facets.
//   * The WHOLE ROW fires the surface's onOpenRow. The kebab carries the full
//     ItemMenu — the ONE action list.
//   * Declared-editable columns edit in place; edits stay local until the
//     floating Save pill commits them.

import { MoreVertical, Star } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import {
  ItemContextMenu,
  ItemMenu,
} from "@/components/official/item/ItemMenu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import type { EntityListConfig, EntityRowActions } from "../config";
import { NONE_VALUE, type EntityFacets, type EntityFilters } from "../types";

interface Props<TRow> {
  config: EntityListConfig<TRow>;
  actions: EntityRowActions<TRow>;
  rows: TRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  filters: EntityFilters;
  facets: EntityFacets;
  isLoading: boolean;
  isFetching: boolean;
  density: "compact" | "comfortable";
  showSharedColumns: boolean;
  hiddenColumns: string[];
  onSaveEdits: (edits: Record<string, Partial<TRow>>) => Promise<void>;
  onQueryChange: (next: {
    page: number;
    pageSize: number;
    sort: string;
    direction: "asc" | "desc";
    filters: EntityFilters;
  }) => void;
  emptyAction?: React.ReactNode;
}

/** Our filter bag → the table's controlled `columnFilters` shape. */
function toTableFilters(filters: EntityFilters): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  for (const [id, f] of Object.entries(filters)) {
    if (f.kind === "text") out[id] = { kind: "text", value: f.value };
    else if (f.kind === "select")
      out[id] = { kind: "select", value: f.values[0] ?? "", values: f.values };
    else out[id] = { kind: "boolean", value: f.value };
  }
  return out;
}

/** The table's `columnFilters` → our bag. Empty entries drop out entirely. */
function fromTableFilters(state: ColumnFiltersState): EntityFilters {
  const out: EntityFilters = {};
  for (const [id, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text") {
      if (f.value?.trim()) out[id] = { kind: "text", value: f.value.trim() };
    } else if (f.kind === "select") {
      const values = f.values?.length ? f.values : f.value ? [f.value] : [];
      if (values.length > 0) out[id] = { kind: "select", values };
    } else if (f.kind === "boolean") {
      out[id] = { kind: "boolean", value: f.value };
    }
  }
  return out;
}

export function EntityListTable<TRow>({
  config,
  actions,
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  filters,
  facets,
  isLoading,
  isFetching,
  density,
  showSharedColumns,
  hiddenColumns,
  onSaveEdits,
  onQueryChange,
  emptyAction,
}: Props<TRow>) {
  const isMobile = useIsMobile();
  const { favorite } = config;

  // ONE star: clickable, sortable, filterable. A separate read-only "Fav"
  // column beside an interactive star would show the same bit twice.
  const favoriteCell = (row: TRow) =>
    favorite ? (
      <button
        type="button"
        aria-label={
          favorite.isFavorite(row)
            ? "Remove from favorites"
            : "Add to favorites"
        }
        disabled={!favorite.canToggle(row)}
        title={favorite.canToggle(row) ? undefined : favorite.disabledTitle}
        onClick={(e) => {
          e.stopPropagation();
          actions.onToggleFavorite?.(row);
        }}
        className="rounded p-0.5 text-muted-foreground/40 hover:text-amber-500 disabled:hover:text-muted-foreground/40"
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            favorite.isFavorite(row) && "fill-amber-400 text-amber-500",
          )}
        />
      </button>
    ) : null;

  const noneLabels = config.noneLabels ?? {};

  const columns: MatrxColumnDef<TRow>[] = config.columns
    .filter(
      (spec) =>
        (showSharedColumns || !spec.scopedToShared) &&
        !hiddenColumns.includes(spec.id),
    )
    .map((spec) => {
      const facetOptions = spec.facet ? facets.byKind[spec.facet] : undefined;
      return {
        ...spec.column,
        cell:
          spec.id === "favorite" && favorite ? favoriteCell : spec.column.cell,
        // Every column sorts — the RPC's ORDER BY whitelist covers all of them.
        sortable: true,
        // Finite value sets get real options WITH counts, so the user picks
        // from what exists instead of guessing at a text box. Columns that
        // declare their own fixed options (the date buckets) keep them.
        filterOptions:
          spec.column.filterOptions ??
          facetOptions?.map((v) => ({
            value: v.value,
            label:
              v.value === NONE_VALUE
                ? (noneLabels[spec.id] ?? "None")
                : `${v.value} (${v.count})`,
          })),
        editOptions:
          spec.column.editable === "select" || spec.column.editable === "tags"
            ? facetOptions
                ?.filter((v) => v.value !== NONE_VALUE)
                .map((v) => ({ value: v.value, label: v.value }))
            : undefined,
      };
    });

  return (
    <MatrxDataTable<TRow>
      data={rows}
      columns={columns}
      getRowId={config.getRowId}
      isLoading={isLoading}
      isFetching={isFetching}
      zebra
      pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
      className={cn(density === "compact" && "text-xs [&_td]:py-1 [&_th]:py-1")}
      query={{
        mode: "controlled",
        totalItems: total,
        state: {
          page,
          pageSize,
          search: "",
          anyOf: "",
          columnFilters: toTableFilters(filters),
          sort: { id: sort, direction },
        },
        onStateChange: (next) => {
          onQueryChange({
            page: next.page,
            pageSize: next.pageSize,
            sort: next.sort?.id ?? sort,
            direction: next.sort?.direction ?? direction,
            filters: fromTableFilters(next.columnFilters),
          });
        },
      }}
      // The page owns the search box; a second one inside the table would be
      // two affordances fighting over one query.
      toolbar={{ search: false }}
      // Row click fires the surface's opener. Side panel / row-window stay off —
      // the kebab menu already carries Quick look and every other record action.
      detail={{ enabled: false }}
      window={{ enabled: false }}
      onRowOpen={actions.onOpenRow}
      edit={
        config.edit
          ? {
              enabled: true,
              onSave: async (edits) => {
                await onSaveEdits(edits as Record<string, Partial<TRow>>);
              },
            }
          : undefined
      }
      // RIGHT-CLICK, from the SAME `ItemMenuConfig` the kebab uses — so the two
      // can never offer different actions. `agentActionRegistry` and
      // `features/agents/browse/FEATURE.md` both claimed the config already
      // drove right-click; it never did on any view, and both docs were
      // corrected earlier in this sweep. This is the code catching up.
      //
      // One change reaches every consumer of the shell (`/agents/all` and
      // `/transcripts` today). Not a fragmentation risk: the eslint ban targets
      // `MenuContent`/`MobileMenuContent`, the heavy layer, which stays behind
      // the shell's existing dynamic edge — `ItemMenu`/`ItemContextMenu` are
      // the thin wrappers and are already statically imported here.
      // DESKTOP ONLY, and not for the reason you'd guess. Right-click being a
      // pointer gesture is the small half; the load-bearing half is that
      // `ContextMenuV3`'s mobile branch wraps its children in a real
      // `<div style="display:contents">` to catch long-press, and a `<div>`
      // between `<tbody>` and `<tr>` is invalid HTML. The desktop branch uses
      // Radix's `asChild`, which merges onto the `<tr>` and adds no node —
      // which is the only reason a row wrapper is safe here at all. Any future
      // `rowWrapper` consumer owes the same check.
      rowWrapper={(row, children) => (
        <ItemContextMenu
          config={actions.menuFor(row)}
          enabled={!isMobile}
        >
          {children}
        </ItemContextMenu>
      )}
      rowActions={(row) => (
        <ItemMenu config={actions.menuFor(row)} align="end">
          <button
            type="button"
            aria-label={`Actions for ${config.getRowName(row)}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </ItemMenu>
      )}
      copy={config.copy}
      emptyState={{
        title: config.emptyState.title,
        description: config.emptyState.description,
        action: emptyAction,
      }}
    />
  );
}
