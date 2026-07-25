"use client";

// features/agents/browse/components/BrowseToolbar.tsx
//
// One row: search, the filters that actually change the server query, the view
// switcher, and density. Deliberately flat — /agents/all buried sort + show +
// favorites + archived + categories + tags behind a popover whose badge read
// "1" before the user touched anything.

import {
  Search,
  X,
  Loader2,
  FileSearch,
  Star,
  Archive,
  Table2,
  LayoutGrid,
  List,
  Rows3,
  Rows2,
  RotateCcw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import type { BrowseQuery } from "../types";

interface Props {
  query: BrowseQuery;
  isFetching: boolean;
  view: ListViewPrefs["view"];
  density: ListViewPrefs["density"];
  onSearch: (value: string) => void;
  onPatchQuery: (patch: Partial<BrowseQuery>) => void;
  onViewChange: (view: ListViewPrefs["view"]) => void;
  onDensityChange: (density: ListViewPrefs["density"]) => void;
  onResetView: () => void;
}

function ToggleButton({
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
  isFetching,
  view,
  density,
  onSearch,
  onPatchQuery,
  onViewChange,
  onDensityChange,
  onResetView,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-9 min-w-64 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
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
            <ToggleButton
              active={query.deep}
              label="Also search inside prompts"
              onClick={() => onPatchQuery({ deep: !query.deep })}
            >
              <FileSearch className="h-3.5 w-3.5" />
            </ToggleButton>
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

      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <ToggleButton
          active={query.favoritesOnly}
          label="Favorites only"
          onClick={() => onPatchQuery({ favoritesOnly: !query.favoritesOnly })}
        >
          <Star
            className={cn("h-3.5 w-3.5", query.favoritesOnly && "fill-current")}
          />
        </ToggleButton>
        <ToggleButton
          active={query.archived !== "active"}
          label={
            query.archived === "active"
              ? "Show archived"
              : query.archived === "all"
                ? "Showing all — click for archived only"
                : "Showing archived only — click to hide archived"
          }
          onClick={() =>
            onPatchQuery({
              archived:
                query.archived === "active"
                  ? "all"
                  : query.archived === "all"
                    ? "archived"
                    : "active",
            })
          }
        >
          <Archive className="h-3.5 w-3.5" />
        </ToggleButton>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <ToggleButton
          active={view === "table"}
          label="Table"
          onClick={() => onViewChange("table")}
        >
          <Table2 className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          active={view === "cards"}
          label="Cards"
          onClick={() => onViewChange("cards")}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          active={view === "rows"}
          label="Compact list"
          onClick={() => onViewChange("rows")}
        >
          <List className="h-3.5 w-3.5" />
        </ToggleButton>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <ToggleButton
          active={density === "compact"}
          label={density === "compact" ? "Comfortable rows" : "Compact rows"}
          onClick={() =>
            onDensityChange(density === "compact" ? "comfortable" : "compact")
          }
        >
          {density === "compact" ? (
            <Rows2 className="h-3.5 w-3.5" />
          ) : (
            <Rows3 className="h-3.5 w-3.5" />
          )}
        </ToggleButton>
        <ToggleButton
          active={false}
          label="Reset view to defaults"
          onClick={onResetView}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </ToggleButton>
      </div>
    </div>
  );
}
