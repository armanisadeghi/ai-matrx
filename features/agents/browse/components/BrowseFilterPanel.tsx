"use client";

// features/agents/browse/components/BrowseFilterPanel.tsx
//
// Filters & Sort, in the shape /agents/all established (popover, sections,
// radio groups, chips with search) — built on the shared primitives in
// components/official/filter-panel/ and driven by SERVER-computed facets.
//
// It writes into the SAME `query.filters` bag the column headers write to, so
// selecting "Business & Productivity" here and from the Category header are
// literally the same query. One filter model, two entry points.
//
// The badge counts only filters the user actually applied. /agents/all's badge
// read "1" on an untouched page because it counted the sort and the active tab
// — a permanent lie that trained people to ignore the number.

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
import { BROWSE_COLUMNS } from "../columns";
import {
  countActiveFilters,
  type ArchivedFilter,
  type BrowseFacets,
  type BrowseFilters,
  type BrowseQuery,
} from "../types";

type SortKey = `${string}-${ListViewPrefs["direction"]}`;

/** Sort options are derived from the columns, so a new column is instantly
 *  sortable from the panel too — no second list to keep in step. */
const EXTRA_SORTS: { value: SortKey; label: string }[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently created" },
];

const FAV_OPTIONS = [
  { value: "all", label: "All" },
  { value: "only", label: "Favorites only" },
  { value: "exclude", label: "Not favorites" },
] as const;

const ARCH_OPTIONS: { value: ArchivedFilter; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "archived", label: "Archived only" },
  { value: "all", label: "Active + archived" },
];

interface Props {
  query: BrowseQuery;
  facets: BrowseFacets;
  sort: string;
  direction: ListViewPrefs["direction"];
  favoritesFirst: boolean;
  onPatchQuery: (patch: Partial<BrowseQuery>) => void;
  onSortChange: (sort: string, direction: ListViewPrefs["direction"]) => void;
  onFavoritesFirstChange: (next: boolean) => void;
  onResetFilters: () => void;
}

const NONE_LABEL: Record<string, string> = {
  category: "Uncategorized",
  tag: "Untagged",
};

function toOptions(
  values: { value: string; count: number }[] | undefined,
  noneLabel: string,
): FacetOption[] {
  return (values ?? []).map((v) => ({
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

  const sortOptions: { value: SortKey; label: string }[] = [
    ...EXTRA_SORTS,
    ...BROWSE_COLUMNS.filter((c) => c.id !== "updated" && c.id !== "created")
      .flatMap((c) => [
        { value: `${c.id}-asc` as SortKey, label: `${c.label} (A→Z)` },
        { value: `${c.id}-desc` as SortKey, label: `${c.label} (Z→A)` },
      ])
      .slice(0, 12),
  ];
  const sortLabel =
    sortOptions.find((o) => o.value === sortKey)?.label ?? "Custom";

  /** Read/write one entry of the shared filter bag. */
  const setSelect = (id: string, values: string[]) => {
    const next: BrowseFilters = { ...query.filters };
    if (values.length === 0) delete next[id];
    else next[id] = { kind: "select", values };
    onPatchQuery({ filters: next });
  };
  const selectedOf = (id: string): string[] => {
    const f = query.filters[id];
    return f && f.kind === "select" ? f.values : [];
  };

  const favValue: (typeof FAV_OPTIONS)[number]["value"] = (() => {
    const f = query.filters.favorite;
    if (!f || f.kind !== "boolean") return "all";
    return f.value ? "only" : "exclude";
  })();

  const setFav = (v: (typeof FAV_OPTIONS)[number]["value"]) => {
    const next: BrowseFilters = { ...query.filters };
    if (v === "all") delete next.favorite;
    else next.favorite = { kind: "boolean", value: v === "only" };
    onPatchQuery({ filters: next });
  };

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
                const idx = v.lastIndexOf("-");
                onSortChange(
                  v.slice(0, idx),
                  v.slice(idx + 1) as ListViewPrefs["direction"],
                );
              }}
              options={sortOptions}
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

          <FilterSection label="Favorites" active={favValue !== "all"}>
            <RadioSelect
              value={favValue}
              onChange={setFav}
              options={FAV_OPTIONS.map((o) =>
                o.value === "only"
                  ? { ...o, hint: String(facets.favoriteCount) }
                  : { ...o },
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

          {(facets.byKind.category?.length ?? 0) > 0 && (
            <FilterSection
              label={`Categories (${facets.byKind.category!.length})`}
              active={selectedOf("category").length > 0}
            >
              <FacetChips
                options={toOptions(facets.byKind.category, NONE_LABEL.category!)}
                selected={selectedOf("category")}
                onChange={(v) => setSelect("category", v)}
                searchPlaceholder="Find category…"
              />
            </FilterSection>
          )}

          {(facets.byKind.tag?.length ?? 0) > 0 && (
            <FilterSection
              label={`Tags (${facets.byKind.tag!.length})`}
              active={selectedOf("tags").length > 0}
            >
              <FacetChips
                options={toOptions(facets.byKind.tag, NONE_LABEL.tag!)}
                selected={selectedOf("tags")}
                onChange={(v) => setSelect("tags", v)}
                searchPlaceholder="Find tag…"
              />
            </FilterSection>
          )}

          {(facets.byKind.visibility?.length ?? 0) > 1 && (
            <FilterSection
              label="Visibility"
              active={selectedOf("visibility").length > 0}
            >
              <FacetChips
                options={toOptions(facets.byKind.visibility, "None")}
                selected={selectedOf("visibility")}
                onChange={(v) => setSelect("visibility", v)}
                searchPlaceholder="Find…"
              />
            </FilterSection>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
