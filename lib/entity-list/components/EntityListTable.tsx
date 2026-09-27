"use client";

// lib/entity-list/components/EntityListTable.tsx
//
// The default view. Built on the canonical MatrxDataTable (sticky header,
// zebra, inline edit + save pill) in CONTROLLED mode: the table owns none of
// the querying, so sort, filter and pagination are real server operations over
// the WHOLE result set — never a re-sort of the loaded page.
//
// Three behaviours worth stating plainly:
//   * Every DECLARED capability is server-owned. Sort/filter controls map 1:1
//     onto `<feature>_list_scoped(p_filters)`; an explicit `false` stays false
//     when a source cannot truthfully serve that capability.
//   * The WHOLE ROW fires the surface's onOpenRow. The kebab carries the full
//     ItemMenu — the ONE action list.
//   * Declared-editable columns edit in place; edits stay local until the
//     floating Save pill commits them.

import { useEffect, useSyncExternalStore } from "react";
import { MoreVertical, Star } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableMobileCardControls,
  MatrxDataTableSelectionConfig,
} from "@ai-matrx/design-system/data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { cn } from "@/lib/utils";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import type { EntityListConfig, EntityRowActions } from "../config";
import { entityColumnSortable } from "../columns";
import { entityListDoorColumnId, entityListRowHref } from "../doors";
import { EntityPhoneCard, resolvePhoneCardLayout } from "../phoneCards";
import { lookalikeNotesFor } from "../lookalikes";
import { NONE_VALUE, type EntityFacets, type EntityFilters } from "../types";
import {
  buildDefaultTableRowMenuDescriptor,
  createTableRowMenuDescriptor,
} from "@/features/context-menu-v3/table-row-context-registry";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { itemMenuConfigToExtraSections } from "@/components/official/item/itemMenuToV3";
import { resolveItemMenuConfig } from "@/components/official/item/types";
import type { ReadOutcome } from "@/components/read-state/ReadGate";
import { fitColumnWidths } from "../columnWidths";
import type { SavedListView } from "@/lib/redux/preferences/userPreferencesSlice";

/**
 * The row's own menu merged into the table's ONE primary "Row" section (an
 * approved heading — a primary section must carry one, and a second "Row"
 * would repeat it). Its sections are kept apart by separators; the table's
 * edit commands follow.
 */
function withRowMenu<TRow>(
  actions: EntityRowActions<TRow>,
  row: TRow,
  tableSections: ContextMenuExtraSection[],
): ContextMenuExtraSection[] {
  const menu = resolveItemMenuConfig(actions.menuFor(row));
  if (!Array.isArray(menu.sections) || menu.sections.length === 0) return tableSections;
  const rowItems = itemMenuConfigToExtraSections(menu).flatMap((section, i) =>
    i === 0
      ? section.items
      : [{ kind: "separator" as const, id: `sep-${section.id}` }, ...section.items],
  );
  const tableRow = tableSections.find((section) => section.id === "table-row");
  const editItems = tableRow?.items ?? [];
  return [
    {
      id: "table-row",
      label: "Row",
      primary: true,
      anchor: "after-clipboard",
      items: editItems.length
        ? [...rowItems, { kind: "separator" as const, id: "sep-table-edit" }, ...editItems]
        : rowItems,
    },
    ...tableSections.filter((section) => section !== tableRow),
  ];
}

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
  /**
   * BULK SELECTION, or nothing at all.
   *
   * 🚨 `undefined` IS THE CONTRACT FOR EVERY SURFACE THAT DID NOT OPT IN. The
   * prop is spread conditionally below, so the table receives no `selection`
   * key whatsoever and renders exactly what it rendered before this capability
   * existed — no leading column, no bulk bar, no `data-matrx-table-selection-*`
   * node. Passing a zero-state selection object instead would add a checkbox
   * column to eighteen list surfaces on the strength of a default.
   */
  selection?: MatrxDataTableSelectionConfig<TRow>;
  onQueryChange: (next: {
    page: number;
    pageSize: number;
    sort: string;
    direction: "asc" | "desc";
    filters: EntityFilters;
    /** Present only in table-toolbar mode, where the search box is the table's. */
    search?: string;
  }) => void;
  /**
   * `config.tableToolbar` is on: the table's own title row carries search,
   * saved views and the column picker (see EntityListConfig.tableToolbar).
   */
  tableToolbar?: {
    tableId: string;
    search: string;
    searchPlaceholder: string;
    onRefresh: () => void;
    onHiddenColumnsChange: (hidden: string[]) => void;
  };
  /**
   * The page's own toolbar row, when the page draws one (not table-toolbar
   * mode). The table's remaining toolbar controls (copy / export, the eraser
   * while something is filtered) are drawn INTO it, so a list page has two
   * chrome rows, never three (page-pass 2026-09-27). `null` while that row is
   * mounting: the table draws nothing rather than flash a row of its own.
   */
  pageToolbarSlot?: HTMLElement | null;
  /** Where the table's "+" views are kept — this surface's view preferences. */
  viewTabsStore?: {
    views: readonly SavedListView[];
    onChange: (views: SavedListView[]) => void;
  };
  emptyAction?: React.ReactNode;
  /** The outcome of the list read (RC-B12 r13) — the table shows `emptyState` only after it succeeded. */
  read?: ReadOutcome;
  /** Resolved empty state from the page (which knows if a search/filter is on). */
  emptyState?: {
    title: string;
    description: string;
    action?: React.ReactNode;
  };
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

/**
 * The table's `columnFilters` → our bag. Empty entries drop out entirely.
 *
 * The text value is kept EXACTLY AS TYPED. This table is controlled: whatever
 * comes back out of here is re-rendered into the header's filter box on the
 * next keystroke, so normalising here rewrites what the user is still typing.
 * Trimming made a space impossible to enter — "New" + space came straight back
 * as "New", and the next letter landed as "NewY". Whitespace-only still means
 * "no filter" — that is a test on the value, not a rewrite of it. A trailing
 * space then reaches the RPC verbatim, which is correct: `ILIKE '%New %'` is
 * exactly what "New " was asked to mean.
 */
function fromTableFilters(state: ColumnFiltersState): EntityFilters {
  const out: EntityFilters = {};
  for (const [id, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text") {
      if (f.value?.trim()) out[id] = { kind: "text", value: f.value };
    } else if (f.kind === "select") {
      const values = f.values?.length ? f.values : f.value ? [f.value] : [];
      if (values.length > 0) out[id] = { kind: "select", values };
    } else if (f.kind === "boolean") {
      out[id] = { kind: "boolean", value: f.value };
    }
  }
  return out;
}

const PAGE_OWNS_COLUMN_PICKER = { columns: false } as const;


/**
 * Per list surface: the column widths last fitted to loaded rows. Kept in
 * memory and in this browser's storage, so a skeleton on the NEXT visit is
 * already the loaded table's shape. Derived layout, not a preference — it
 * never syncs across devices, and a browser without storage just falls back
 * to the declared widths.
 */
type FittedWidths = Map<string, string | number | undefined>;
const LAST_FITTED_WIDTHS = new Map<string, FittedWidths>();
const WIDTHS_STORAGE_PREFIX = "matrx:list-fitted-widths:";
const noopSubscribe = () => () => {};

function readFittedWidths(key: string): FittedWidths | undefined {
  const cached = LAST_FITTED_WIDTHS.get(key);
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(WIDTHS_STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const widths: FittedWidths = new Map(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string | number] =>
          typeof e[1] === "number" || typeof e[1] === "string",
      ),
    );
    LAST_FITTED_WIDTHS.set(key, widths);
    return widths;
  } catch {
    return undefined;
  }
}

function rememberFittedWidths(key: string, widths: FittedWidths): void {
  const previous = LAST_FITTED_WIDTHS.get(key);
  const same =
    previous !== undefined &&
    previous.size === widths.size &&
    [...widths].every(([id, w]) => previous.get(id) === w);
  LAST_FITTED_WIDTHS.set(key, widths);
  if (same) return;
  try {
    window.localStorage.setItem(
      WIDTHS_STORAGE_PREFIX + key,
      JSON.stringify(Object.fromEntries([...widths].filter(([, w]) => w !== undefined))),
    );
  } catch {
    /* storage unavailable (private window) — memory still serves this visit */
  }
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
  emptyState,
  read,
  selection,
  tableToolbar,
  pageToolbarSlot,
  viewTabsStore,
}: Props<TRow>) {
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
        className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground/40 hover:text-amber-500 disabled:hover:text-muted-foreground/40 sm:h-6 sm:w-6"
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

  // THE DOOR LAW: the name cell is a real anchor, resolved once from the
  // config's entity token. A column that declares its own `href` keeps it.
  const doorColumn = entityListDoorColumnId(config);

  // The phone card's layout is derived from the SAME visibility inputs the
  // grid uses, so a column the user turned off stays off on both widths.
  const phoneLayout = resolvePhoneCardLayout(config.columns, {
    doorColumn,
    hiddenColumns,
    showSharedColumns,
  });

  const defaultMobileCards = (
    row: TRow,
    _index: number,
    controls: MatrxDataTableMobileCardControls,
  ) => (
    <EntityPhoneCard
      row={row}
      layout={phoneLayout}
      controls={controls}
      rowId={config.getRowId(row)}
      rowName={config.getRowName(row)}
    />
  );

  // NO TWO ROWS READ ALIKE (cold walk 22, defect D). A cell cannot see its
  // neighbours, so the table computes the lookalike notes over the rows it is
  // about to render and hands each twin's note to the name cell — the same
  // rule and the same words the card and row views use.
  const lookalikeNotes = lookalikeNotesFor(
    rows,
    config.getRowId,
    config.getRowName,
    config.lookalike,
  );
  const nameColumnId =
    doorColumn ??
    config.columns.find((spec) => spec.locked)?.id ??
    config.columns[0]?.id;
  const withLookalikeNote =
    (spec: (typeof config.columns)[number]) =>
    (row: TRow, index: number): React.ReactNode => {
      const note = lookalikeNotes.get(config.getRowId(row));
      const own = spec.column.cell
        ? spec.column.cell(row, index)
        : config.getRowName(row);
      if (!note) return own;
      return (
        <div className="min-w-0">
          {own}
          <div
            className="truncate text-xs text-muted-foreground"
            data-lookalike-note=""
          >
            {note}
          </div>
        </div>
      );
    };

  const declaredColumns: MatrxColumnDef<TRow>[] = config.columns
    .filter(
      (spec) =>
        (showSharedColumns || !spec.scopedToShared) &&
        // In table-toolbar mode the table's own column picker hides columns
        // (controlled `columnState` below), so every column is handed over.
        (Boolean(tableToolbar) || !hiddenColumns.includes(spec.id)),
    )
    .map((spec) => {
      const facetOptions = spec.facet ? facets.byKind[spec.facet] : undefined;
      return {
        ...spec.column,
        label: spec.column.label ?? spec.label,
        cell:
          spec.id === "favorite" && favorite
            ? favoriteCell
            : spec.id === nameColumnId && lookalikeNotes.size > 0
              ? withLookalikeNote(spec)
              : spec.column.cell,
        href:
          spec.column.href ??
          (spec.id === doorColumn
            ? (row: TRow) => entityListRowHref(config, row)
            : undefined),
        // Default to the canonical sortable-column policy, but preserve an
        // explicit false. Inventing a client control when the server has no
        // matching ORDER BY branch silently sorts by its fallback instead.
        sortable: entityColumnSortable(spec),
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
                : `${spec.formatFacetValue?.(v.value) ?? v.value} (${v.count})`,
          })),
        editOptions:
          spec.column.editable === "select" || spec.column.editable === "tags"
            ? facetOptions
                ?.filter((v) => v.value !== NONE_VALUE)
                .map((v) => ({ value: v.value, label: v.value }))
            : undefined,
      };
    });

  // Widths follow the data: mostly-empty columns yield, the name is pinned
  // (../columnWidths.ts).
  // While the skeleton shows, the table keeps the widths it last fitted to
  // real rows (page-pass 2026-09-27: the skeleton drew the declared widths,
  // then the loaded rows yielded their empty columns and everything jumped).
  const fitted = fitColumnWidths(declaredColumns, rows, nameColumnId);
  const widthKey = config.surfaceKey;
  // Remember the fitted widths once real rows are on screen (an effect, never
  // a write during render).
  const fittedSignature =
    rows.length > 0
      ? JSON.stringify(
          fitted.map((c) => [String(c.id ?? c.accessorKey ?? ""), c.width ?? null]),
        )
      : null;
  useEffect(() => {
    if (!fittedSignature) return;
    const entries = JSON.parse(fittedSignature) as [string, string | number | null][];
    rememberFittedWidths(
      widthKey,
      new Map(entries.map(([id, w]) => [id, w ?? undefined])),
    );
  }, [widthKey, fittedSignature]);
  // Client-only (hydration-safe): the server render and the first client
  // render both use the declared widths.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const remembered =
    isLoading && hydrated ? readFittedWidths(widthKey) : undefined;
  const columns = remembered
    ? fitted.map((c) => {
        const width = remembered.get(String(c.id ?? c.accessorKey ?? ""));
        return width === undefined ? c : { ...c, width };
      })
    : fitted;

  return (
    <MatrxDataTable<TRow>
      data={rows}
      columns={columns}
      getRowId={config.getRowId}
      isLoading={isLoading}
      isFetching={isFetching}
      // No row count until the rows arrive (page-pass 2026-09-27): the footer
      // read "0 rows" under the loading skeleton.
      paginationLabelFormat={(start, end, count) =>
        isLoading
          ? ""
          : count === 0
            ? "0 rows"
            : `${start.toLocaleString()}-${end.toLocaleString()} of ${count.toLocaleString()}`
      }
      zebra
      pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
      className={cn(density === "compact" && "text-xs [&_td]:py-1 [&_th]:py-1")}
      // SIZE TO CONTENT (page-pass 2026-09-27): the table's bordered box is
      // full-height by default, so a list of three rows drew ~450px of empty
      // box. A list's box ends at its last row and scrolls only when the rows
      // outgrow the page.
      tableClassName="h-auto max-h-full"
      query={{
        mode: "controlled",
        totalItems: total,
        state: {
          page,
          pageSize,
          search: tableToolbar?.search ?? "",
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
            ...(tableToolbar ? { search: next.search } : {}),
          });
        },
      }}
      // The page owns the search box; a second one inside the table would be
      // two affordances fighting over one query.
      toolbar={
        tableToolbar
          ? {
              search: true,
              searchPlaceholder: tableToolbar.searchPlaceholder,
              refresh: { onRefresh: tableToolbar.onRefresh },
            }
          : {
              search: false,
              // One row inside the page's toolbar row: the table's controls
              // never wrap under its view tabs.
              singleRow: true,
              ...(pageToolbarSlot !== undefined
                ? { portalInto: pageToolbarSlot }
                : {}),
              // The page owns the ONE column picker (EntityColumnPicker, which
              // lists hidden columns too); the table's own Columns modal saw
              // only the visible ones and disagreed with it. `toolbar.columns`
              // ships in @ai-matrx/design-system after 0.48.1.
              ...PAGE_OWNS_COLUMN_PICKER,
            }
      }
      {...(tableToolbar
        ? {
            tableId: tableToolbar.tableId,
            columnState: {
              order: columns.map(
                (column) => column.id ?? String(column.accessorKey ?? ""),
              ),
              hidden: hiddenColumns,
              onChange: (next: { order: string[]; hidden: string[] }) =>
                tableToolbar.onHiddenColumnsChange(next.hidden),
            },
          }
        : {})}
      // THE "+" VIEWS ARE KEPT (page-pass 2026-09-27): the table's view tabs
      // lived in memory, so a "View 2" was gone after a reload. They are stored
      // in this surface's view preferences — named on creation, synced like
      // every other list preference. `viewTabsStore` ships in
      // @ai-matrx/design-system after 0.48.1 (spread so this compiles before).
      {...(viewTabsStore ? { viewTabsStore } : {})}
      // Row click fires the surface's opener. Side panel / row-window stay off —
      // the kebab menu carries every record action the surface declares.
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
      rowActions={(row) => (
        <ItemMenu config={actions.menuFor(row)} align="end">
          <button
            type="button"
            aria-label={`Actions for ${config.getRowName(row)}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </ItemMenu>
      )}
      copy={config.copy}
      // 🚨 RIGHT-CLICK A ROW → THAT ROW'S ACTIONS (page-pass 2026-09-27). The
      // table registers a row-menu resolver for every row, and a registered
      // row descriptor WINS over the shell's ItemContextMenu resolution — so
      // a descriptor carrying only the table's edit commands left every
      // table-view list's right-click with no Open / Delete at all (seen live
      // on /research/topics). The row's own menu rides in the descriptor, for
      // every surface, whether or not it overrides the agent context.
      contextMenu={{
        resolveRowContext: (row, controls) => {
          const descriptor = buildDefaultTableRowMenuDescriptor(
            { id: config.getRowId(row) },
            controls,
          );
          return createTableRowMenuDescriptor({
            ...descriptor,
            // The row's actions lead the primary "Row" section: the thing the
            // person right-clicked answers first, above the universal rows.
            extraSections: withRowMenu(actions, row, descriptor.extraSections),
            context: {
              content: config.getRowAgentContext?.(row) ?? config.getRowName(row),
              context: { id: config.getRowId(row) },
              [CONTEXT_MENU_ENTITY_KEY]: config.getRowEntity?.(row) ?? null,
            },
          });
        },
      }}
      // THE NARROW LAYOUT IS THE PRIMITIVE'S, NOT THE FEATURE'S. A surface may
      // still hand-write its phone card; when it does not, the shell renders
      // the canonical stacked card from the columns the surface already
      // declared, so every list route inherits a phone layout instead of a
      // 3,000px table in a 364px box. See ../phoneCards.tsx.
      mobileCards={config.mobileCards ?? defaultMobileCards}
      // Spread, never `selection={selection}`: a surface that declared no
      // `bulkActions` must reach the table with the key absent (see Props).
      {...(selection ? { selection } : {})}
      emptyState={emptyState ?? { ...config.emptyState, action: emptyAction }}
      read={read}
    />
  );
}
