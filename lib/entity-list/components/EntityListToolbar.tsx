"use client";

// lib/entity-list/components/EntityListToolbar.tsx
//
// One row: search, Filters & Sort, columns, view, density.
//
// Search is the only always-visible query control. Everything that narrows or
// orders lives behind the Filters & Sort popover — the shape /agents/all
// established and users already know — because a toolbar that exposes ten
// controls at rest is a toolbar nobody reads.

import {
  Search,
  X,
  Loader2,
  FileSearch,
  Table2,
  LayoutGrid,
  List,
  Rows3,
  Rows2,
  RotateCcw,
  Settings2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import type { EntityColumnSpec } from "../columns";
import type { EntityFacetSection, EntityScopeFacetSection } from "../config";
import type {
  EntityFacets,
  EntityListQuery,
  EntityScopeCounts,
} from "../types";
import type { ListScope } from "@/lib/list-scope/types";
import { EntityFilterPanel } from "./EntityFilterPanel";
import { EntityColumnPicker } from "./EntityColumnPicker";

interface Props<TRow> {
  query: EntityListQuery;
  facets: EntityFacets;
  isFetching: boolean;
  prefs: ListViewPrefs;
  showSharedColumns: boolean;
  columns: EntityColumnSpec<TRow>[];
  defaultHidden: string[];
  facetSections?: EntityFacetSection[];
  /** Scope-narrowing sections for the Filters panel. */
  scopeSections?: EntityScopeFacetSection[];
  /** The scope counts the tabs read — the panel shares them, never re-counts. */
  counts?: EntityScopeCounts;
  /** The counts query is still in flight — a scope section says so. */
  countsLoading?: boolean;
  /** The counts query's own failure, printed where its options would be. */
  countsError?: string | null;
  onScopeChange?: (scope: ListScope) => void;
  hasFavorites: boolean;
  hasArchived: boolean;
  /** "Search agents…" */
  searchPlaceholder: string;
  /**
   * The phone's placeholder — "Search decks…". A long desktop placeholder
   * ("Search decks by name, topic, lesson or description…") is cut to a
   * fragment in a 375px box (page-pass 2026-09-27).
   */
  shortSearchPlaceholder?: string;
  /** Label for the deep-search toggle. Absent → no toggle offered. */
  deepSearchLabel?: string;
  /** Which alternate views this surface provides. Table is always offered. */
  hasCards: boolean;
  hasRows: boolean;
  onSearch: (value: string) => void;
  onPatchQuery: (patch: Partial<EntityListQuery>) => void;
  onPatchPrefs: (patch: Partial<ListViewPrefs>) => void;
  onResetFilters: () => void;
  onResetView: () => void;
  /**
   * Receives the element the TABLE draws its own toolbar controls into (copy /
   * export, the eraser while filtered) — one row for page and table.
   */
  tableControlsRef?: (element: HTMLDivElement | null) => void;
}

function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label={label}
          onClick={onClick}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors lg:h-7 lg:w-7",
            active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EntityListToolbar<TRow>({
  query,
  facets,
  isFetching,
  prefs,
  showSharedColumns,
  columns,
  defaultHidden,
  facetSections,
  scopeSections,
  counts,
  countsLoading,
  countsError,
  onScopeChange,
  hasFavorites,
  hasArchived,
  searchPlaceholder,
  shortSearchPlaceholder,
  deepSearchLabel,
  hasCards,
  hasRows,
  onSearch,
  onPatchQuery,
  onPatchPrefs,
  onResetFilters,
  onResetView,
  tableControlsRef,
}: Props<TRow>) {
  const hasAltViews = hasCards || hasRows;
  const isMobile = useIsMobile();
  const placeholder =
    isMobile && shortSearchPlaceholder ? shortSearchPlaceholder : searchPlaceholder;
  return (
    // ONE ROW ON A DESKTOP, TWO ON A PHONE (page-pass 2026-09-27, blind judge on
    // /research/topics at 375px: the table's controls merged into this row
    // crushed the search to an empty 22px pill). On a phone the search owns
    // its line and the controls take the next; from `sm:` up everything sits
    // on the search row and the view-tab strip scrolls inside its own box.
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 lg:flex-nowrap">
      <div className="flex h-12 min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 sm:basis-auto sm:min-w-48 lg:h-9 lg:min-w-56">
        {isFetching ? (
          <Loader2
            role="status"
            aria-label={`Refreshing ${searchPlaceholder.toLowerCase()}`}
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          type="search"
          value={query.search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={searchPlaceholder}
          // ProInput intentionally does not fit this integrated compact search:
          // its mic/menu chrome would duplicate this surface's own controls.
          // The query is still exposed as a surface value/write target, and
          // 16px minimum prevents iOS zoom-on-focus.
          // The browser's own clear (x) is hidden: the "Clear search" button
          // below is the one clear control (two X's once you typed, 2026-09-27).
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-sm [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        {query.search && (
          <>
            {deepSearchLabel && (
              <IconToggle
                active={query.deep}
                label={deepSearchLabel}
                onClick={() => onPatchQuery({ deep: !query.deep })}
              >
                <FileSearch className="h-3.5 w-3.5" />
              </IconToggle>
            )}
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-foreground lg:h-7 lg:w-7"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <div className="[&_button]:h-11 lg:[&_button]:h-9">
        <EntityFilterPanel
          query={query}
          facets={facets}
          columns={columns}
          facetSections={facetSections}
          scopeSections={scopeSections}
          counts={counts}
          countsLoading={countsLoading}
          countsError={countsError}
          onScopeChange={onScopeChange}
          hasFavorites={hasFavorites}
          hasArchived={hasArchived}
          sort={prefs.sort}
          direction={prefs.direction}
          hiddenColumns={prefs.hiddenColumns}
          favoritesFirst={prefs.favoritesFirst}
          onPatchQuery={onPatchQuery}
          onSortChange={(sort, direction) => onPatchPrefs({ sort, direction })}
          onFavoritesFirstChange={(favoritesFirst) =>
            onPatchPrefs({ favoritesFirst })
          }
          onResetFilters={onResetFilters}
        />
      </div>

      {prefs.view === "table" && (
        <EntityColumnPicker
          columns={columns}
          defaultHidden={defaultHidden}
          hiddenColumns={prefs.hiddenColumns}
          showSharedColumns={showSharedColumns}
          onChange={(hiddenColumns) => onPatchPrefs({ hiddenColumns })}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Display options"
            title="Display options"
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>View</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 sm:hidden">
          <DropdownMenuLabel>Display</DropdownMenuLabel>
          {hasAltViews && (
            <DropdownMenuRadioGroup
              value={prefs.view}
              onValueChange={(view) =>
                onPatchPrefs({ view: view as ListViewPrefs["view"] })
              }
            >
              <DropdownMenuRadioItem value="table">
                <Table2 className="mr-2 h-3.5 w-3.5" />
                Table
              </DropdownMenuRadioItem>
              {hasCards && (
                <DropdownMenuRadioItem value="cards">
                  <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                  Cards
                </DropdownMenuRadioItem>
              )}
              {hasRows && (
                <DropdownMenuRadioItem value="rows">
                  <List className="mr-2 h-3.5 w-3.5" />
                  Compact list
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
          )}
          {hasAltViews && <DropdownMenuSeparator />}
          {/* One shape for every row (page-pass 2026-09-27: the menu mixed rows
              with and without icons): the state rides the left gutter, every
              row carries its icon. */}
          <DropdownMenuCheckboxItem
            checked={prefs.density === "compact"}
            onCheckedChange={(checked) =>
              onPatchPrefs({ density: checked ? "compact" : "comfortable" })
            }
          >
            <Rows2 className="mr-2 h-3.5 w-3.5" />
            Compact rows
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem inset onSelect={onResetView}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hasAltViews && (
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 sm:flex">
          <IconToggle
            active={prefs.view === "table"}
            label="Table"
            onClick={() => onPatchPrefs({ view: "table" })}
          >
            <Table2 className="h-3.5 w-3.5" />
          </IconToggle>
          {hasCards && (
            <IconToggle
              active={prefs.view === "cards"}
              label="Cards"
              onClick={() => onPatchPrefs({ view: "cards" })}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </IconToggle>
          )}
          {hasRows && (
            <IconToggle
              active={prefs.view === "rows"}
              label="Compact list"
              onClick={() => onPatchPrefs({ view: "rows" })}
            >
              <List className="h-3.5 w-3.5" />
            </IconToggle>
          )}
        </div>
      )}

      <div className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 sm:flex">
        <IconToggle
          active={prefs.density === "compact"}
          label={
            prefs.density === "compact" ? "Comfortable rows" : "Compact rows"
          }
          onClick={() =>
            onPatchPrefs({
              density: prefs.density === "compact" ? "comfortable" : "compact",
            })
          }
        >
          {prefs.density === "compact" ? (
            <Rows2 className="h-3.5 w-3.5" />
          ) : (
            <Rows3 className="h-3.5 w-3.5" />
          )}
        </IconToggle>
        <IconToggle
          active={false}
          label="Reset view to defaults"
          onClick={onResetView}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </IconToggle>
      </div>

      {tableControlsRef && (
        <div
          ref={tableControlsRef}
          data-entity-list-table-controls
          // The table's row (view tabs + its controls) drawn here: never
          // wrapping, the tab strip bounded and scrolling sideways, so it can
          // neither push a third row nor squeeze the search. The tab strip may
          // SHRINK (flex-initial, never flex-none): on a 375px phone a rigid
          // strip pushed the copy button past the 16px gutter (page-pass
          // /connected-sources, 2026-09-27).
          // ON A PHONE THE VIEW TABS TAKE THEIR OWN LINE (list-shell fix D,
          // 2026-09-28): beside Filters · Columns · View at 375px the strip was
          // squeezed to "Defau…" with its "+" pushed off-screen. Below `sm` the
          // row is full-width and the strip is bounded by it, not by 14rem.
          className="flex min-w-0 flex-1 items-center justify-end empty:hidden max-sm:basis-full max-sm:justify-start sm:flex-none [&>*]:w-auto [&>*]:min-w-0 max-sm:[&>*]:w-full [&_[data-matrx-table-toolbar]]:flex-nowrap [&_[data-matrx-table-toolbar-tabs]]:flex-initial [&_[data-matrx-table-toolbar-tabs]]:basis-auto sm:[&_[data-matrx-table-toolbar-tabs]]:max-w-[14rem] [&_[data-matrx-table-toolbar-tabs]]:min-w-0 [&_[data-matrx-table-tabs]]:border-b-0"
        />
      )}
    </div>
  );
}
