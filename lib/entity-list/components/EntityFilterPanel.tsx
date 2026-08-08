"use client";

// lib/entity-list/components/EntityFilterPanel.tsx
//
// Filters & Sort, in the shape /agents/all established (popover, sections,
// radio groups, chips with search) — built on the shared primitives in
// components/official/filter-panel/ and driven by SERVER-computed facets.
//
// It writes into the SAME `query.filters` bag the column headers write to, so
// selecting a category here and from the Category header are literally the
// same query. One filter model, two entry points.
//
// The badge counts only filters the user actually applied — never the sort or
// the active tab. A badge that reads "1" on an untouched page is a permanent
// lie that trains people to ignore the number.

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
import type { EntityColumnSpec } from "../columns";
import type { EntityFacetSection } from "../config";
import {
  countActiveFilters,
  facetCount,
  facetValues,
  type ArchivedFilter,
  type EntityFacets,
  type EntityFilters,
  type EntityListQuery,
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

interface Props<TRow> {
  query: EntityListQuery;
  facets: EntityFacets;
  columns: EntityColumnSpec<TRow>[];
  facetSections: EntityFacetSection[];
  /** Offer the Favorites section + pin toggle. */
  hasFavorites: boolean;
  /** Offer the Archived section. */
  hasArchived: boolean;
  sort: string;
  direction: ListViewPrefs["direction"];
  favoritesFirst: boolean;
  onPatchQuery: (patch: Partial<EntityListQuery>) => void;
  onSortChange: (sort: string, direction: ListViewPrefs["direction"]) => void;
  onFavoritesFirstChange: (next: boolean) => void;
  onResetFilters: () => void;
}

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

export function EntityFilterPanel<TRow>({
  query,
  facets,
  columns,
  facetSections,
  hasFavorites,
  hasArchived,
  sort,
  direction,
  favoritesFirst,
  onPatchQuery,
  onSortChange,
  onFavoritesFirstChange,
  onResetFilters,
}: Props<TRow>) {
  const [open, setOpen] = useState(false);
  // Same cue as the row menu: when the chip sections push the panel past its
  // available height, the bottom edge fades so the eye knows to scroll.
  const scrollFade = useScrollFade();
  const activeCount = countActiveFilters(query);
  const sortKey = `${sort}-${direction}` as SortKey;

  const sortOptions: { value: SortKey; label: string }[] = [
    ...EXTRA_SORTS,
    ...columns
      .filter((c) => c.id !== "updated" && c.id !== "created")
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
    const next: EntityFilters = { ...query.filters };
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
    const next: EntityFilters = { ...query.filters };
    if (v === "all") delete next.favorite;
    else next.favorite = { kind: "boolean", value: v === "only" };
    onPatchQuery({ filters: next });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filters and sort"
          title="Filters and sort"
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
            {hasFavorites && (
              <button
                type="button"
                onClick={() => onFavoritesFirstChange(!favoritesFirst)}
                className="mt-2 flex w-full items-center gap-2 text-left text-sm"
              >
                <span
                  className={cn(
                    "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
                    favoritesFirst
                      ? "bg-primary"
                      : "border border-border bg-muted",
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
            )}
          </FilterSection>

          {hasFavorites && (
            <FilterSection label="Favorites" active={favValue !== "all"}>
              <RadioSelect
                value={favValue}
                onChange={setFav}
                options={FAV_OPTIONS.map((o) =>
                  o.value === "only"
                    ? {
                        ...o,
                        hint: String(facetCount(facets, "favorite", "only")),
                      }
                    : { ...o },
                )}
              />
            </FilterSection>
          )}

          {hasArchived && (
            <FilterSection label="Archived" active={query.archived !== "active"}>
              <RadioSelect<ArchivedFilter>
                value={query.archived}
                onChange={(v) => onPatchQuery({ archived: v })}
                options={ARCH_OPTIONS.map((o) =>
                  o.value === "archived"
                    ? {
                        ...o,
                        hint: String(facetCount(facets, "archived", "archived")),
                      }
                    : o,
                )}
              />
            </FilterSection>
          )}

          {facetSections.map((section) => {
            const values = facetValues(facets, section.facet);
            if (values.length < (section.minOptions ?? 1)) return null;
            return (
              <FilterSection
                key={section.facet}
                label={
                  section.countInLabel === false
                    ? section.label
                    : `${section.label} (${values.length})`
                }
                active={selectedOf(section.filterId).length > 0}
              >
                <FacetChips
                  options={toOptions(values, section.noneLabel)}
                  selected={selectedOf(section.filterId)}
                  onChange={(v) => setSelect(section.filterId, v)}
                  searchPlaceholder={
                    section.searchPlaceholder ??
                    `Find ${section.label.toLowerCase()}…`
                  }
                />
              </FilterSection>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
