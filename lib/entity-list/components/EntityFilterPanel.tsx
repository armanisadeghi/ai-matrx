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
import { resolveColumnMarker } from "@ai-matrx/design-system/data-table";
import { useScrollFade } from "@ai-matrx/design-system";
import { SlidersHorizontal, RotateCcw, Star, ArrowUpDown } from "lucide-react";
import {
  ArchiveFilter,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
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
  DATE_FILTER_OPTIONS,
  entityColumnSortable,
  DATE_SORT_WORDS,
  type EntityColumnSpec,
} from "../columns";
import type { EntityFacetSection, EntityScopeFacetSection } from "../config";
import {
  makeScope,
  scopeNarrowId,
  type ListScope,
} from "@/lib/list-scope/types";
import {
  countActiveFilters,
  facetCount,
  facetValues,
  type EntityFacets,
  type EntityFilters,
  type EntityListQuery,
  type EntityScopeCounts,
} from "../types";

type SortKey = `${string}-${ListViewPrefs["direction"]}`;

/**
 * Sort options are derived from the columns, so a new column is instantly
 * sortable from the panel too — no second list to keep in step. The two
 * presets name the newest-first order of a REAL timestamp column; with no such
 * sortable column there is no preset (a list whose columns cannot sort offers
 * no sort at all — /connected-sources offered "Recently updated", page-pass
 * 2026-09-27).
 */
const PRESET_SORTS: { ids: readonly string[]; label: string }[] = [
  { ids: ["updated", "updated_at"], label: "Recently updated" },
  { ids: ["created", "created_at"], label: "Recently created" },
];

/**
 * "A→Z" is a lie on a date column. A column declares its own words with
 * `sortWords`; a date column is recognised by its filter options and needs no
 * declaration (jobs-bar-2026-09-16, item 8).
 */
function sortWordsFor<TRow>(c: EntityColumnSpec<TRow>): {
  asc: string;
  desc: string;
} {
  if (c.sortWords) return c.sortWords;
  const marker = resolveColumnMarker(c.column);
  if (marker === "favorite")
    return { asc: "Favorites last", desc: "Favorites first" };
  if (marker === "pin") return { asc: "Pins last", desc: "Pins first" };
  if (c.column.filterOptions === DATE_FILTER_OPTIONS) return DATE_SORT_WORDS;
  return { asc: "A→Z", desc: "Z→A" };
}

const FAV_OPTIONS = [
  { value: "all", label: "All" },
  { value: "only", label: "Favorites only" },
  { value: "exclude", label: "Not favorites" },
] as const;

interface Props<TRow> {
  query: EntityListQuery;
  facets: EntityFacets;
  columns: EntityColumnSpec<TRow>[];
  /** Filter-bag sections. Optional on a config, so optional here — a
   *  surface that declares none must render a panel, never crash it. */
  facetSections?: EntityFacetSection[];
  /** Scope-narrowing sections. Empty → the panel narrows no scope. */
  scopeSections?: EntityScopeFacetSection[];
  /** The same counts the scope tabs read — options AND their numbers. */
  counts?: EntityScopeCounts;
  /** The counts query is in flight — a declared section says so, never hides. */
  countsLoading?: boolean;
  /** The counts query's own failure, printed where its options would be. */
  countsError?: string | null;
  /** Writes the scope a section chose. Same setter the tabs use. */
  onScopeChange?: (scope: ListScope) => void;
  /** Offer the Favorites section + pin toggle. */
  hasFavorites: boolean;
  /** Offer the Archived section. */
  hasArchived: boolean;
  sort: string;
  direction: ListViewPrefs["direction"];
  /** Columns the person hid — not offered as a sort (unless current). */
  hiddenColumns?: readonly string[];
  favoritesFirst: boolean;
  onPatchQuery: (patch: Partial<EntityListQuery>) => void;
  onSortChange: (sort: string, direction: ListViewPrefs["direction"]) => void;
  onFavoritesFirstChange: (next: boolean) => void;
  onResetFilters: () => void;
}

function toOptions(
  values: { value: string; count: number }[] | undefined,
  noneLabel: string,
  formatValue?: (value: string) => string,
): FacetOption[] {
  return (values ?? []).map((v) => ({
    value: v.value,
    label:
      v.value === NONE_SENTINEL
        ? noneLabel
        : (formatValue?.(v.value) ?? v.value),
    count: v.count,
  }));
}


/**
 * The panel's sort choices, derived from the columns. Exported for its guard
 * (`__tests__/panel-sort-options.test.ts`):
 * - a column that declared `sortable: false` is never offered;
 * - a preset ("Recently updated") exists only over a real sortable timestamp
 *   column and REPLACES that column's newest-first row — never both
 *   ("Recently updated" beside "Updated (newest first)", only one of which
 *   could ever read as selected);
 * - a hidden column is not offered, unless it is the current sort (the
 *   selection must stay visible and named).
 */
export function panelSortOptions<TRow>(
  columns: EntityColumnSpec<TRow>[],
  options: { hiddenColumns?: readonly string[]; current?: string } = {},
): { value: SortKey; label: string }[] {
  const hidden = new Set(options.hiddenColumns ?? []);
  const sortable = columns.filter((c) => entityColumnSortable(c));
  const presets: { value: SortKey; label: string }[] = [];
  const replaced = new Set<string>();
  for (const preset of PRESET_SORTS) {
    const column = sortable.find((c) => preset.ids.includes(c.id));
    if (!column) continue;
    const value = `${column.id}-desc` as SortKey;
    presets.push({ value, label: preset.label });
    replaced.add(value);
  }
  const offered = sortable.filter(
    (c) =>
      !hidden.has(c.id) ||
      (options.current !== undefined && options.current.startsWith(`${c.id}-`)),
  );
  return [
    ...presets,
    ...offered
      .flatMap((c) => {
        const words = sortWordsFor(c);
        return [
          {
            value: `${c.id}-asc` as SortKey,
            label: `${c.label} (${words.asc})`,
          },
          {
            value: `${c.id}-desc` as SortKey,
            label: `${c.label} (${words.desc})`,
          },
        ];
      })
      .filter((o) => !replaced.has(o.value))
      .slice(0, 12),
  ];
}

export function EntityFilterPanel<TRow>({
  query,
  facets,
  columns,
  facetSections = [],
  scopeSections = [],
  counts,
  countsLoading = false,
  countsError = null,
  onScopeChange,
  hasFavorites,
  hasArchived,
  sort,
  direction,
  hiddenColumns,
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

  const sortOptions = panelSortOptions(columns, {
    hiddenColumns,
    current: sortKey,
  });
  // No sortable column → no sort anywhere in the panel (trigger included).
  const canSort = sortOptions.length > 0;
  const sortLabel =
    sortOptions.find((o) => o.value === sortKey)?.label ?? "Custom";
  // A panel with nothing in it is absent, never a button that opens an empty
  // box (/connected-sources, page-pass 2026-09-27: no sortable column, no
  // facet, no archive axis).
  const hasFilters =
    hasFavorites ||
    hasArchived ||
    scopeSections.some((section) => query.scope.kind === section.scope) ||
    facetSections.some(
      (section) =>
        facetValues(facets, section.facet).length >= (section.minOptions ?? 1),
    );

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

  if (!canSort && !hasFilters && activeCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={canSort ? "Filters and sort" : "Filters"}
          title={canSort ? "Filters and sort" : "Filters"}
          className={cn(
            "relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-colors",
            activeCount > 0
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {/* Named on a phone too (page-pass 2026-09-27: three bare icons). */}
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
          {canSort && (
            <>
              <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
              <ArrowUpDown className="h-3.5 w-3.5" />
              {/* A FIXED width: the search beside this button no longer jumps
                  as the sort label changes (page-pass 2026-09-27). */}
              <span className="hidden w-40 truncate text-left lg:inline" title={sortLabel}>
                {sortLabel}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        sizing="content"
        align="end"
        sideOffset={8}
        collisionPadding={16}
        // The popover portals out of the list root, so it carries the touch
        // floor itself (its chips and sort rows measured 22-32px on a phone).
        className="matrx-touch-targets flex flex-col overflow-hidden p-0"
        style={{
          maxHeight:
            "var(--radix-popover-content-available-height, calc(100dvh - 120px))",
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">
            {canSort ? "Filters & Sort" : "Filters"}
          </span>
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
          {/* SCOPE NARROWING, in the panel — the SAME state the tab's dropdown
              writes, never a second filter. Rendered only while its own scope
              is the active one: offering "narrow to an organization" from a tab
              that is not about organizations would silently change the tab. */}
          {scopeSections.map((section) => {
            if (!onScopeChange) return null;
            if (query.scope.kind !== section.scope) return null;
            const options = counts?.narrow[section.scope] ?? [];
            const narrowedTo = scopeNarrowId(query.scope) ?? "";
            // 🚨 A DECLARED SECTION IS NEVER ABSENT (one-resolution FIX-R6/F1).
            // This used to `return null` on zero options, so a surface that
            // declares an Organization section and whose counts came back
            // without any showed a Filters panel with no organizations in it
            // and NOTHING saying why — the reader concludes the page cannot do
            // that at all. Empty is now a STATE with a sentence: still reading,
            // refused (in the service's own words), or genuinely none.
            if (options.length === 0) {
              return (
                <FilterSection
                  key={`scope:${section.scope}`}
                  label={section.label}
                  active={false}
                >
                  <p className="pb-1 text-[11px] leading-snug text-muted-foreground">
                    {countsLoading
                      ? `Reading which ${section.label.toLowerCase()} options you can narrow to…`
                      : (counts?.narrowUnavailable?.[section.scope] ??
                        (countsError
                          ? `No ${section.label.toLowerCase()} options could be listed — the counts query failed: ${countsError}. Reload the page; the list itself is unaffected.`
                          : `No ${section.label.toLowerCase()} options could be listed, and the surface did not say why. This is a defect — the list above still shows everything you can see.`))}
                  </p>
                </FilterSection>
              );
            }
            const total = counts?.byKind[section.scope];
            return (
              <FilterSection
                key={`scope:${section.scope}`}
                label={section.label}
                active={narrowedTo !== ""}
              >
                {section.hint ? (
                  <p className="pb-1 text-[11px] leading-snug text-muted-foreground">
                    {section.hint}
                  </p>
                ) : null}
                <RadioSelect
                  value={narrowedTo}
                  onChange={(id) =>
                    onScopeChange(makeScope(section.scope, id || null))
                  }
                  options={[
                    {
                      value: "",
                      label: section.allLabel,
                      // A count is shown only when the counts query answered
                      // for it — never a 0 standing in for "not known yet".
                      hint: total === undefined ? undefined : String(total),
                    },
                    ...options.map((option) => ({
                      value: option.id,
                      label: option.label,
                      hint: String(option.count),
                    })),
                  ]}
                />
              </FilterSection>
            );
          })}

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
                  options={toOptions(
                    values,
                    section.noneLabel,
                    section.formatValue,
                  )}
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
            <FilterSection
              label="Archived"
              active={query.archived !== "active"}
            >
              {/* THE ONE archive control (@ai-matrx/design-system 0.13.0).
                  This panel owns the URL/preference plumbing — `query.archived`
                  is still a real server-side RPC parameter — but the CONTROL is
                  the platform's, so the words and the shape here are the words
                  and the shape in workflow-studio, the dashboard and the
                  desktop. THE ARCHIVED-ITEMS LAW, Arman 2026-09-09. */}
              <ArchiveFilter
                value={query.archived}
                onValueChange={(v) => onPatchQuery({ archived: v })}
                // A count only while the facets were READ under a filter that
                // includes archived rows. Facets are fetched with the current
                // `archived` value (useEntityList), so under "Active only" the
                // archived facet is 0 BY CONSTRUCTION even when archived rows
                // exist — printing it would be a screen that lies, and the
                // package's contract is explicit: pass a count only when it
                // describes what the list would actually render. (The old
                // RadioSelect printed that 0 as a hint; this is the fix.)
                counts={
                  query.archived === "active"
                    ? undefined
                    : { archived: facetCount(facets, "archived", "archived") }
                }
                // Shorter WORDING for a ~180px panel whose section is already
                // headed "Archived" — never a different meaning (the package
                // sanctions exactly this and owns the full wording elsewhere).
                // At full length the three segments wrap to two lines each and
                // the count lands beside a broken phrase.
                labels={{ active: "Active", archived: "Archived", all: "All" }}
                className="w-full"
                aria-label="Archived"
              />
            </FilterSection>
          )}

          {/* FILTERS LEAD (page-pass 2026-09-27): the column headers already
              sort, so the panel opens on what only it offers — the filters —
              and the sort list sits last. */}
          {canSort && (
            <FilterSection
              label="Sort"
              active={sortKey !== sortOptions[0]?.value}
            >
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
                        "absolute top-px h-4 w-4 rounded-full bg-background border border-primary shadow-sm transition-all",
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
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
