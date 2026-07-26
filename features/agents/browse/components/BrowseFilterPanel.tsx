"use client";

// features/agents/browse/components/BrowseFilterPanel.tsx
//
// Filters & Sort, in the shape /agents/all established (popover, sections,
// radio groups, chips with search) — built on the now-shared primitives in
// components/official/filter-panel/ and driven by SERVER-computed facets.
//
// Every control here maps to an agx_list_scoped parameter, so a filter applies
// to all 2,000 rows, not to the 25 currently on screen.
//
// The badge counts only filters the user actually applied. /agents/all's badge
// read "1" on a untouched page because it counted the sort and the active tab
// as filters — a permanent lie that trained people to ignore the number.

import { useState } from "react";
import { useScrollFade } from "@/components/official/scroll-fade/useScrollFade";
import { SlidersHorizontal, RotateCcw, Star, ArrowUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FacetChips,
  FilterSection,
  NONE_SENTINEL,
  RadioSelect,
  type FacetOption,
} from "@/components/official/filter-panel/parts";
import { cn } from "@/lib/utils";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  countActiveFilters,
  type ArchivedFilter,
  type BrowseFacets,
  type BrowseQuery,
  type FavoritesFilter,
} from "../types";

type SortKey = `${ListViewPrefs["sort"]}-${ListViewPrefs["direction"]}`;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently created" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "category-asc", label: "Category (A–Z)" },
];

const FAV_OPTIONS: { value: FavoritesFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "only", label: "Favorites only" },
  { value: "exclude", label: "Not favorites" },
];

const ARCH_OPTIONS: { value: ArchivedFilter; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "archived", label: "Archived only" },
  { value: "all", label: "Active + archived" },
];

interface Props {
  query: BrowseQuery;
  facets: BrowseFacets;
  sort: ListViewPrefs["sort"];
  direction: ListViewPrefs["direction"];
  favoritesFirst: boolean;
  onPatchQuery: (patch: Partial<BrowseQuery>) => void;
  onSortChange: (
    sort: ListViewPrefs["sort"],
    direction: ListViewPrefs["direction"],
  ) => void;
  onFavoritesFirstChange: (next: boolean) => void;
  onResetFilters: () => void;
}

function toOptions(
  values: { value: string; count: number }[],
  noneLabel: string,
): FacetOption[] {
  return values.map((v) => ({
    value: v.value,
    label: v.value === NONE_SENTINEL ? noneLabel : v.value,
    count: v.count,
  }));
}

export function BrowseFilterPanel({
  query,
  facets,
  sort,
  direction,
  favoritesFirst,
  onPatchQuery,
  onSortChange,
  onFavoritesFirstChange,
  onResetFilters,
}: Props) {
  const [open, setOpen] = useState(false);
  // Same cue as the row menu: when Categories/Tags push the panel past its
  // available height, the bottom edge fades so the eye knows to scroll.
  const scrollFade = useScrollFade();
  const activeCount = countActiveFilters(query);
  const sortKey = `${sort}-${direction}` as SortKey;
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Custom";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-colors",
            activeCount > 0
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
          <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="hidden max-w-28 truncate lg:inline">{sortLabel}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-[360px] flex-col overflow-hidden p-0"
        style={{
          maxHeight:
            "var(--radix-popover-content-available-height, calc(100dvh - 120px))",
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">Filters &amp; Sort</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              <RotateCcw className="h-3 w-3" />
              Reset filters
            </button>
          )}
        </div>

        <div
          ref={scrollFade.ref}
          {...scrollFade.fadeProps}
          className={cn(
            "min-h-0 flex-1 space-y-5 overflow-y-auto p-4",
            scrollFade.fadeProps.className,
          )}
        >
          <FilterSection label="Sort" active={sortKey !== "updated-desc"}>
            <RadioSelect<SortKey>
              value={sortKey}
              onChange={(v) => {
                const [nextSort, nextDir] = v.split("-") as [
                  ListViewPrefs["sort"],
                  ListViewPrefs["direction"],
                ];
                onSortChange(nextSort, nextDir);
              }}
              options={SORT_OPTIONS}
            />
            <button
              type="button"
              onClick={() => onFavoritesFirstChange(!favoritesFirst)}
              className="mt-2 flex w-full items-center gap-2 text-left text-sm"
            >
              <span
                className={cn(
                  "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
                  favoritesFirst ? "bg-primary" : "border border-border bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-px h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                    favoritesFirst ? "left-[14px]" : "left-px",
                  )}
                />
              </span>
              <Star
                className={cn(
                  "h-3.5 w-3.5",
                  favoritesFirst && "fill-amber-400 text-amber-500",
                )}
              />
              <span className="text-foreground">Pin favorites to top</span>
            </button>
          </FilterSection>

          <FilterSection label="Favorites" active={query.favorites !== "all"}>
            <RadioSelect<FavoritesFilter>
              value={query.favorites}
              onChange={(v) => onPatchQuery({ favorites: v })}
              options={FAV_OPTIONS.map((o) =>
                o.value === "only"
                  ? { ...o, hint: String(facets.favoriteCount) }
                  : o,
              )}
            />
          </FilterSection>

          <FilterSection label="Archived" active={query.archived !== "active"}>
            <RadioSelect<ArchivedFilter>
              value={query.archived}
              onChange={(v) => onPatchQuery({ archived: v })}
              options={ARCH_OPTIONS.map((o) =>
                o.value === "archived"
                  ? { ...o, hint: String(facets.archivedCount) }
                  : o,
              )}
            />
          </FilterSection>

          {facets.categories.length > 0 && (
            <FilterSection
              label={`Categories (${facets.categories.length})`}
              active={query.categories.length > 0}
            >
              <FacetChips
                options={toOptions(facets.categories, "Uncategorized")}
                selected={query.categories}
                onChange={(v) => onPatchQuery({ categories: v })}
                searchPlaceholder="Find category…"
              />
            </FilterSection>
          )}

          {facets.tags.length > 0 && (
            <FilterSection
              label={`Tags (${facets.tags.length})`}
              active={query.tags.length > 0}
            >
              <FacetChips
                options={toOptions(facets.tags, "Untagged")}
                selected={query.tags}
                onChange={(v) => onPatchQuery({ tags: v })}
                searchPlaceholder="Find tag…"
              />
            </FilterSection>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
