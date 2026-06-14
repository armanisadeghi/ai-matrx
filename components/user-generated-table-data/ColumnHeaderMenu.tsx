"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Filter, ListX, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnHeaderMenuProps {
  fieldName: string;
  displayName: string;
  /** True when this column is the active sort column. */
  isSorted: boolean;
  sortDirection: "asc" | "desc";
  filterValue: string;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onFilterChange: (value: string) => void;
}

/**
 * Per-column header control. Exposes explicit sort (asc/desc/clear) and a
 * live text filter for the column, opened from a compact trigger icon so the
 * header stays scannable. Active sort/filter state is reflected on the trigger.
 */
const ColumnHeaderMenu = ({
  fieldName,
  displayName,
  isSorted,
  sortDirection,
  filterValue,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onFilterChange,
}: ColumnHeaderMenuProps) => {
  const hasFilter = filterValue.trim().length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "h-6 w-6 flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-300/60 dark:hover:bg-gray-600/60",
            (hasFilter || isSorted) && "text-primary",
          )}
          title={`Sort or filter ${displayName}`}
        >
          <Filter className={cn("h-3.5 w-3.5", hasFilter && "fill-current")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-1 pb-2">
          <p className="truncate text-sm font-semibold text-foreground" title={displayName}>
            {displayName}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <Button
            variant={isSorted && sortDirection === "asc" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 justify-start gap-2 px-2 text-xs font-normal"
            onClick={onSortAsc}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Sort ascending
          </Button>
          <Button
            variant={isSorted && sortDirection === "desc" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 justify-start gap-2 px-2 text-xs font-normal"
            onClick={onSortDesc}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Sort descending
          </Button>
          {isSorted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground"
              onClick={onClearSort}
            >
              <ListX className="h-3.5 w-3.5" />
              Clear sort
            </Button>
          )}
        </div>

        <div className="my-2 h-px bg-border" />

        <div className="px-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Filter
          </label>
          <div className="relative">
            <Input
              autoFocus
              value={filterValue}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={`Contains…`}
              className="h-8 pr-7 text-sm"
              style={{ fontSize: "16px" }}
            />
            {hasFilter && (
              <button
                type="button"
                onClick={() => onFilterChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ColumnHeaderMenu;
