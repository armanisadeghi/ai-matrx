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
import { ReservedSlot } from "./ReservedSlot";
import { useReservedSlot } from "./useReservedSlot";

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
   * Receives the element the TABLE draws its saved-view tabs into — the row's
   * LEFT edge (owner, /agents/all 2026-10-04: "They need to be all the way to the left").
   */
  tableTabsRef?: (element: HTMLDivElement | null) => void;
  /** The surface this toolbar belongs to: its two table slots remember their size under it. */
  surfaceKey?: string;
  /**
   * Below `sm` the page draws this toolbar INSIDE its lane row (EntityListPage): search becomes an
   * icon that opens the box in place, Filters and View are icons, and the columns move into View.
   */
  phoneRow?: { searchOpen: boolean; onSearchOpenChange: (open: boolean) => void };
  /** The pane is narrow (EntityListPage measures it): the columns live in the View menu. */
  columnsInViewMenu?: boolean;
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
  tableTabsRef,
  surfaceKey,
  phoneRow,
  columnsInViewMenu = Boolean(phoneRow),
}: Props<TRow>) {
  const hasAltViews = hasCards || hasRows;
  const isMobile = useIsMobile();
  // The tabs and the table's controls land after the first frame; each holds the size it last had.
  const tabsSlot = useReservedSlot(surfaceKey, "tabs", prefs.view === "table", tableTabsRef);
  const controlsSlot = useReservedSlot(surfaceKey, "controls", prefs.view === "table", tableControlsRef);
  const placeholder =
    isMobile && shortSearchPlaceholder ? shortSearchPlaceholder : searchPlaceholder;
  const searchBox = (
      <div
        data-entity-list-search-box=""
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 @3xl/list:min-w-40 @5xl/list:min-w-56">
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
            // ONE "View" MENU BELOW 72rem OF THE PANE (DATA-HOME-3E, 2026-10-01; by the pane, not
            // the viewport, since 2026-10-04): narrower, the inline view and density groups pushed
            // the table's controls past the right edge, so the menu holds them.
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground @6xl/list:hidden"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {phoneRow ? null : <span className="@max-3xl/list:sr-only">View</span>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
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
          {columnsInViewMenu && prefs.view === "table" ? (
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
    // ONE LINE AT EVERY PANE WIDTH (owner, 2026-10-04: two rows, never clipped, never overlapping):
    // below 48rem of the pane the labels go, Columns moves into View, and the view tabs shrink and
    // scroll inside their own strip.
    <div
      data-entity-list-toolbar=""
      // A PHONE'S FIRST FRAME IS THIS DESKTOP ROW (the server cannot know the width; `usePhoneWidth`
      // swaps in the phone row after hydration). The phone row is 44px tall (measured at 390px), so
      // this one holds that height in a pane under 36rem (by the pane, not the viewport — the
      // responsive contract) and the list below it never moves (/data at 390px, CLS 0.034).
      className="matrx-tap-ring flex min-w-0 flex-nowrap items-center gap-1.5 @max-xl/list:min-h-[44px] @3xl/list:gap-2"
    >
      {/* The table's saved-view tabs open the row, far left (`toolbar.tabsPortalInto`); the
          package draws them and scrolls its strip — this slot only places it, at the strip's own
          width (a 16rem cap let two tabs and their "+" run over the search, /research/topics). */}
      {tableTabsRef && (
        <ReservedSlot
          slotRef={tabsSlot.ref}
          style={tabsSlot.style}
          surfaceKey={surfaceKey}
          name="tabs"
          reserve={prefs.view === "table"}
          data-entity-list-table-tabs=""
          className="flex min-w-0 max-w-[45%] shrink-0 items-center empty:hidden @3xl/list:max-w-full"
        />
      )}

      {searchBox}

      {filterPanel}

      {prefs.view === "table" && !columnsInViewMenu && (
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
        <div className="hidden h-7 items-center gap-0.5 rounded-lg border border-border bg-card px-0.5 @6xl/list:flex">
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

      <div className="hidden h-7 items-center gap-0.5 rounded-lg border border-border bg-card px-0.5 @6xl/list:flex">
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

      {/* The table's own controls (copy / export, the eraser while filtered) close the row on
          the right. The package keeps its row on one line (`singleRow`); nothing here reaches
          into it. */}
      {tableControlsRef && (
        <ReservedSlot
          slotRef={controlsSlot.ref}
          style={controlsSlot.style}
          surfaceKey={surfaceKey}
          name="controls"
          reserve={prefs.view === "table"}
          data-entity-list-table-controls=""
          className="ml-auto flex min-w-0 shrink-0 items-center empty:hidden"
        />
      )}
    </div>
  );
}
