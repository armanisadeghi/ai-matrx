"use client";

// features/agents/browse/components/BrowseToolbar.tsx
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
  Check,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { BrowseFilterPanel } from "./BrowseFilterPanel";
import { ColumnPicker } from "./ColumnPicker";
import type { BrowseFacets, BrowseQuery } from "../types";

interface Props {
  query: BrowseQuery;
  facets: BrowseFacets;
  isFetching: boolean;
  prefs: ListViewPrefs;
  showSharedColumns: boolean;
  onSearch: (value: string) => void;
  onPatchQuery: (patch: Partial<BrowseQuery>) => void;
  onPatchPrefs: (patch: Partial<ListViewPrefs>) => void;
  onResetFilters: () => void;
  onResetView: () => void;
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
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
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

export function BrowseToolbar({
  query,
  facets,
  isFetching,
  prefs,
  showSharedColumns,
  onSearch,
  onPatchQuery,
  onPatchPrefs,
  onResetFilters,
  onResetView,
}: Props) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:flex-wrap sm:gap-2">
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 sm:min-w-56">
        {isFetching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          type="search"
          value={query.search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search agents…"
          // 16px minimum prevents iOS zoom-on-focus.
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {query.search && (
          <>
            <IconToggle
              active={query.deep}
              label="Also search inside prompts"
              onClick={() => onPatchQuery({ deep: !query.deep })}
            >
              <FileSearch className="h-3.5 w-3.5" />
            </IconToggle>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <BrowseFilterPanel
        query={query}
        facets={facets}
        sort={prefs.sort}
        direction={prefs.direction}
        favoritesFirst={prefs.favoritesFirst}
        onPatchQuery={onPatchQuery}
        onSortChange={(sort, direction) => onPatchPrefs({ sort, direction })}
        onFavoritesFirstChange={(favoritesFirst) =>
          onPatchPrefs({ favoritesFirst })
        }
        onResetFilters={onResetFilters}
      />

      {prefs.view === "table" && (
        <ColumnPicker
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
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 sm:hidden">
          <DropdownMenuLabel>Display</DropdownMenuLabel>
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
            <DropdownMenuRadioItem value="cards">
              <LayoutGrid className="mr-2 h-3.5 w-3.5" />
              Cards
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="rows">
              <List className="mr-2 h-3.5 w-3.5" />
              Compact list
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              onPatchPrefs({
                density:
                  prefs.density === "compact" ? "comfortable" : "compact",
              })
            }
          >
            {prefs.density === "compact" ? (
              <Check className="mr-2 h-3.5 w-3.5" />
            ) : (
              <span className="mr-2 h-3.5 w-3.5" />
            )}
            Compact rows
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onResetView}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 sm:flex">
        <IconToggle
          active={prefs.view === "table"}
          label="Table"
          onClick={() => onPatchPrefs({ view: "table" })}
        >
          <Table2 className="h-3.5 w-3.5" />
        </IconToggle>
        <IconToggle
          active={prefs.view === "cards"}
          label="Cards"
          onClick={() => onPatchPrefs({ view: "cards" })}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </IconToggle>
        <IconToggle
          active={prefs.view === "rows"}
          label="Compact list"
          onClick={() => onPatchPrefs({ view: "rows" })}
        >
          <List className="h-3.5 w-3.5" />
        </IconToggle>
      </div>

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
    </div>
  );
}
