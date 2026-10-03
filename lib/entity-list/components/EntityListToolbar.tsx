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
import { useIsMobile } from "@ai-matrx/kit/media-query";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import type { EntityColumnSpec } from "../columns";
import type { EntityFacetSection, EntityPanelSwitch, EntityScopeFacetSection } from "../config";
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
  /** Shown columns with no room at this width (columnPriority.ts) — the picker says so. */
  noRoomColumns?: readonly string[];
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
  /** The organization filter's setter — an organization section in the panel writes it. */
  onOrgChange?: (orgId: string | null) => void;
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
  /** Boolean filter toggles shown in the box while something is typed (config.searchToggles). */
  searchToggles?: Array<{ id: string; label: string }>;
  /** Page-owned switches for the Filters panel (config.panelSwitches). */
  panelSwitches?: EntityPanelSwitch[];
  onPatchQuery: (patch: Partial<EntityListQuery>) => void;
  onPatchPrefs: (patch: Partial<ListViewPrefs>) => void;
  onResetFilters: () => void;
  onResetView: () => void;
  /**
   * Receives the element the TABLE draws its own toolbar controls into (copy /
   * export, the eraser while filtered) — one row for page and table.
   */
  tableControlsRef?: (element: HTMLDivElement | null) => void;
  /**
   * Below `sm` the page draws this toolbar INSIDE its lane row (EntityListPage): search becomes an
   * icon that opens the box in place, Filters and View are icons, and the columns move into View.
   */
  phoneRow?: { searchOpen: boolean; onSearchOpenChange: (open: boolean) => void };
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
            "inline-flex h-6 w-6 items-center justify-center rounded transition-colors",
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
  noRoomColumns,
  columns,
  defaultHidden,
  facetSections,
  scopeSections,
  counts,
  countsLoading,
  countsError,
  onScopeChange,
  onOrgChange,
  hasFavorites,
  hasArchived,
  searchPlaceholder,
  shortSearchPlaceholder,
  deepSearchLabel,
  hasCards,
  hasRows,
  onSearch,
  searchToggles,
  panelSwitches,
  onPatchQuery,
  onPatchPrefs,
  onResetFilters,
  onResetView,
  tableControlsRef,
  phoneRow,
}: Props<TRow>) {
  const hasAltViews = hasCards || hasRows;
  const isMobile = useIsMobile();
  const placeholder =
    isMobile && shortSearchPlaceholder ? shortSearchPlaceholder : searchPlaceholder;
  const searchBox = (
      <div
        data-entity-list-search-box=""
        className="flex h-7 min-w-0 flex-1 basis-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 sm:basis-auto sm:min-w-40 lg:min-w-56">
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
          // The shell's row keys find the box by this (`/` focuses it; config.rowKeys).
          data-entity-list-search=""
          value={query.search}
          onChange={(e) => onSearch(e.target.value)}
          // The phone row opens the box from its search icon: focus it, and an empty box closes
          // again when the person leaves it.
          autoFocus={Boolean(phoneRow)}
          onBlur={() => {
            if (phoneRow && !query.search) phoneRow.onSearchOpenChange(false);
          }}
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
            {searchToggles?.map((toggle) => {
              const entry = query.filters[toggle.id];
              const on = entry?.kind === "boolean" && entry.value === true;
              return (
                <button
                  key={toggle.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = { ...query.filters };
                    if (on) delete next[toggle.id];
                    else next[toggle.id] = { kind: "boolean", value: true };
                    onPatchQuery({ filters: next });
                  }}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center rounded px-1.5 text-xs font-medium transition-colors",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {toggle.label}
                </button>
              );
            })}
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
              onClick={() => {
                onSearch("");
                phoneRow?.onSearchOpenChange(false);
              }}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
  );
  const filterPanel = (
        <EntityFilterPanel
          compact={Boolean(phoneRow)}
          query={query}
          facets={facets}
          columns={columns}
          facetSections={facetSections}
          scopeSections={scopeSections}
          counts={counts}
          countsLoading={countsLoading}
          countsError={countsError}
          onScopeChange={onScopeChange}
          onOrgChange={onOrgChange}
          hasFavorites={hasFavorites}
          hasArchived={hasArchived}
          panelSwitches={panelSwitches}
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
  );
  const viewMenu = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Display options"
            title="Display options"
            // ONE "View" MENU BELOW `xl` (DATA-HOME-3E, 2026-10-01): at 1024 px the inline view
            // and density groups pushed the table's controls past the right edge; the phone's
            // menu already held all of them, so it now serves every width under 1280.
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground xl:hidden"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {phoneRow ? null : <span>View</span>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 xl:hidden">
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
          {phoneRow && prefs.view === "table" ? (
            <>
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              {columns
                .filter((c) => (showSharedColumns || !c.scopedToShared) && !c.locked)
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!prefs.hiddenColumns.includes(c.id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      onPatchPrefs({
                        hiddenColumns: checked
                          ? prefs.hiddenColumns.filter((id) => id !== c.id)
                          : [...prefs.hiddenColumns, c.id],
                      })
                    }
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
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
  );

  if (phoneRow) {
    // ONE ROW ON A PHONE (DATA-HOME-3E, 2026-10-01): the lane select and the organization filter
    // share this row with a search icon, Filters and View; the search opens in place of them and
    // the table's own row (saved views, copy, group) stays off the phone. Four rows of chrome sat
    // above the first card before (Linear and Notion phones: one).
    const searching = phoneRow.searchOpen || query.search !== "";
    return (
      <div
        data-entity-list-phone-controls=""
        className={cn("flex min-w-0 items-center gap-1.5", searching ? "flex-1" : "shrink-0")}
      >
        {searching ? (
          searchBox
        ) : (
          <button
            type="button"
            aria-label={searchPlaceholder}
            title={searchPlaceholder}
            onClick={() => phoneRow.onSearchOpenChange(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        {filterPanel}
        {viewMenu}
        {tableControlsRef && <div ref={tableControlsRef} data-entity-list-table-controls hidden />}
      </div>
    );
  }

  return (
    // ONE ROW ON A DESKTOP, TWO ON A PHONE (page-pass 2026-09-27, blind judge on
    // /research/topics at 375px: the table's controls merged into this row
    // crushed the search to an empty 22px pill). On a phone the search owns
    // its line and the controls take the next; from `sm:` up everything sits
    // on the search row and the view-tab strip scrolls inside its own box.
    <div data-entity-list-toolbar="" className="matrx-tap-ring flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 lg:flex-nowrap">
      {searchBox}

      {filterPanel}

      {prefs.view === "table" && (
        <EntityColumnPicker
          columns={columns}
          defaultHidden={defaultHidden}
          hiddenColumns={prefs.hiddenColumns}
          noRoomColumns={noRoomColumns}
          showSharedColumns={showSharedColumns}
          onChange={(hiddenColumns) => onPatchPrefs({ hiddenColumns })}
        />
      )}

      {viewMenu}


      {hasAltViews && (
        <div className="hidden h-7 items-center gap-0.5 rounded-lg border border-border bg-card px-0.5 xl:flex">
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

      <div className="hidden h-7 items-center gap-0.5 rounded-lg border border-border bg-card px-0.5 xl:flex">
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
