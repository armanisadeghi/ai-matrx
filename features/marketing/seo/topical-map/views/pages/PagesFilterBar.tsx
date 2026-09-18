"use client";

// features/marketing/seo/topical-map/views/pages/PagesFilterBar.tsx
//
// The one place the pages workspace is narrowed from. It writes ONLY the store
// (`setPageFilters` / `clearPageFilters`); the workspace reads the store and
// decides what reaches the server.
//
// 🚨 IT SAYS WHICH FILTERS ARE REAL. Topic, Disposition and State are server
// filters and narrow all 4,000 pages. Text, Traffic and Decided-by are narrowed
// over the LOADED page only, and the table's header says so the moment one is
// on. Region narrows NOTHING: `seo.list_page_intents` takes no region argument
// and its items carry no region, so the Region control lists the map's region
// values as PLAIN TEXT with one sentence saying why none of them is clickable.
// An inert-looking dropdown that silently did nothing would be the dead control
// law 4 forbids; a control that is absent would hide the fact that the map HAS
// regions. So it is present, honest, and unselectable.

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { useMapFacets, useMapFacetValues, useMapTopicSearch } from "../../hooks";
import type { TopicalMapKnobs } from "../../knobs";
import { selectMapPageFilters } from "../../redux/selectors";
import { clearPageFilters, setPageFilters } from "../../redux/slice";
import type { MapPageFilters } from "../../redux/types";
import type {
  PageIntentDisposition,
  PageIntentSource,
  PageIntentState,
} from "../../types";
import { hasAnyPageFilter } from "./pageRows";

/**
 * Radix `Select` cannot hold an empty string as a value, so "no filter" needs a
 * sentinel. It never reaches the store or the RPC — `fromSelect` maps it back
 * to the `null` the filter bag means by "any".
 */
const ANY = "__any";

const DISPOSITIONS: readonly PageIntentDisposition[] = [
  "keep",
  "move",
  "merge",
  "redirect",
  "rewrite",
  "delete",
];
const STATES: readonly PageIntentState[] = ["proposed", "accepted", "done"];
const SOURCES: readonly PageIntentSource[] = ["mapper", "human", "agent"];

function fromSelect<T extends string>(value: string): T | null {
  return value === ANY ? null : (value as T);
}

const CONTROL = "h-7 rounded-md border border-border bg-card px-2 text-xs";

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[11px] leading-none">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove the ${label} filter`}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-accent"
      >
        <X className="h-2.5 w-2.5" aria-hidden />
      </button>
    </span>
  );
}

export interface PagesFilterBarProps {
  mapId: string;
  organizationId: string | null;
  knobs: TopicalMapKnobs;
  readOnly: boolean;
  /** True while the review deck is open (a toggle, not a tab). */
  reviewing: boolean;
  onReviewingChange: (reviewing: boolean) => void;
}

export function PagesFilterBar({
  mapId,
  organizationId,
  knobs,
  readOnly,
  reviewing,
  onReviewingChange,
}: PagesFilterBarProps) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectMapPageFilters(mapId));

  const patch = (next: Partial<MapPageFilters>) => {
    dispatch(setPageFilters({ mapId, filters: next }));
  };

  // ── Text, debounced ──────────────────────────────────────────────────────
  // The input is uncontrolled by the store between keystrokes so a 200ms
  // debounce cannot eat a character; the store catches up after the pause.
  const [draftText, setDraftText] = useState(filters.text);
  useEffect(() => {
    if (draftText === filters.text) return;
    const timer = setTimeout(() => {
      dispatch(setPageFilters({ mapId, filters: { text: draftText } }));
    }, 200);
    return () => clearTimeout(timer);
  }, [draftText, filters.text, dispatch, mapId]);
  // A Clear press (or any other writer) must be visible in the box.
  useEffect(() => {
    setDraftText((current) => (current === filters.text ? current : filters.text));
  }, [filters.text]);

  // ── Topic picker ─────────────────────────────────────────────────────────
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicQuery, setTopicQuery] = useState("");
  const topicHits = useMapTopicSearch(mapId, topicQuery, 20, topicOpen);

  // ── Region: what exists, and why it cannot narrow ────────────────────────
  const facets = useMapFacets(
    { organizationId: organizationId ?? "" },
    Boolean(organizationId),
  );
  const regionFacet = facets.data?.find((facet) => facet.key === "region") ?? null;
  const regionValues = useMapFacetValues(
    regionFacet?.id ?? "",
    { organizationId: organizationId ?? "" },
    Boolean(regionFacet?.id && organizationId),
  );

  const anyFilter = hasAnyPageFilter(filters);

  return (
    <div className="flex shrink-0 flex-col gap-1 px-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {/* ── Tabs: two buttons, not a second component library ───────────── */}
        <div className="flex items-center gap-px rounded-md border border-border p-px">
          <button
            type="button"
            aria-pressed={!filters.onNoTopic}
            onClick={() => patch({ onNoTopic: false })}
            className={cn(
              "h-6 rounded px-2 text-xs",
              filters.onNoTopic ? "hover:bg-accent" : "bg-muted font-medium",
            )}
          >
            All pages
          </button>
          <button
            type="button"
            aria-pressed={filters.onNoTopic}
            onClick={() => patch({ onNoTopic: true })}
            title="Pages of one site that sit on no live topic of this map."
            className={cn(
              "h-6 rounded px-2 text-xs",
              filters.onNoTopic ? "bg-muted font-medium" : "hover:bg-accent",
            )}
          >
            On no topic
          </button>
        </div>

        {/* ── Text ────────────────────────────────────────────────────────── */}
        <label className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-1.5 h-3 w-3 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Find a page by address</span>
          <input
            type="search"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="Find in the loaded pages…"
            title="Matches the page's address and label, within the pages loaded on this page of results."
            className={cn(CONTROL, "w-52 pl-6")}
          />
        </label>

        {/* ── Topic (server filter) ───────────────────────────────────────── */}
        <Popover open={topicOpen} onOpenChange={setTopicOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(CONTROL, "inline-flex items-center gap-1")}
              title="Narrows the whole list on the server, by intent OR coverage."
            >
              {filters.topicSlug ?? "Any topic"}
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                value={topicQuery}
                onValueChange={setTopicQuery}
                placeholder="Search this map's topics…"
              />
              <CommandList>
                {topicHits.isError ? (
                  <div className="p-2 text-xs text-destructive">
                    {/* The function's own sentence, unaltered. */}
                    {topicHits.error instanceof Error
                      ? topicHits.error.message
                      : "The topic search refused."}
                  </div>
                ) : topicHits.isPending ? (
                  <div className="p-2 text-xs text-muted-foreground">
                    Loading this map's topics…
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No topic of this map matches.</CommandEmpty>
                    <CommandGroup>
                      {filters.topicSlug ? (
                        <CommandItem
                          value="__clear"
                          onSelect={() => {
                            patch({ topicSlug: null });
                            setTopicOpen(false);
                          }}
                        >
                          Any topic
                        </CommandItem>
                      ) : null}
                      {(topicHits.data ?? []).map((hit) => (
                        <CommandItem
                          key={hit.slug}
                          value={hit.slug}
                          onSelect={() => {
                            patch({ topicSlug: hit.slug });
                            setTopicOpen(false);
                          }}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{hit.name}</span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {hit.path.join(" › ")}
                            </span>
                          </span>
                          {filters.topicSlug === hit.slug ? (
                            <Check className="ml-auto h-3 w-3" aria-hidden />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* ── Region: present, honest, unselectable ───────────────────────── */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(CONTROL, "inline-flex items-center gap-1")}
              title="The page list cannot be narrowed by region yet — see inside."
            >
              Region
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <p className="text-xs text-muted-foreground">
              The page list cannot be narrowed by region yet —
              seo.list_page_intents carries no region. Filed with the
              coordinator.
            </p>
            <div className="mt-2 max-h-56 overflow-auto">
              {regionFacet === null ? (
                <p className="text-xs text-muted-foreground">
                  {facets.isPending
                    ? "Loading this organization's facets…"
                    : "This organization has no region facet, so there are no region values to show."}
                </p>
              ) : regionValues.isPending ? (
                <p className="text-xs text-muted-foreground">
                  Loading the region values…
                </p>
              ) : regionValues.isError ? (
                <p className="text-xs text-destructive">
                  {regionValues.error instanceof Error
                    ? regionValues.error.message
                    : "The region values could not be read."}
                </p>
              ) : (regionValues.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The region facet exists and holds no values yet.
                </p>
              ) : (
                <ul className="space-y-px">
                  {(regionValues.data ?? []).map((value) => (
                    // Plain text, deliberately: the person sees what regions
                    // exist without being offered a narrowing that would do
                    // nothing.
                    <li key={value.id} className="text-xs">
                      {value.name}{" "}
                      <span className="text-muted-foreground">({value.slug})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* ── Traffic (client-side, over the loaded page) ─────────────────── */}
        <div
          role="group"
          aria-label="Traffic"
          className="flex items-center gap-px rounded-md border border-border p-px"
        >
          {(
            [
              ["all", "All traffic"],
              ["low", `Low (≤ ${knobs.pages_low_traffic_clicks_max} clicks)`],
              ["with_traffic", "With traffic"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.traffic === value}
              onClick={() => patch({ traffic: value })}
              className={cn(
                "h-6 rounded px-2 text-xs",
                filters.traffic === value ? "bg-muted font-medium" : "hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Disposition / State / Decided by ────────────────────────────── */}
        <Select
          value={filters.disposition ?? ANY}
          onValueChange={(value) =>
            patch({ disposition: fromSelect<PageIntentDisposition>(value) })
          }
        >
          <SelectTrigger className="h-7 w-32 text-xs" aria-label="Disposition">
            <SelectValue placeholder="Any disposition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any disposition</SelectItem>
            {DISPOSITIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.state ?? ANY}
          onValueChange={(value) => patch({ state: fromSelect<PageIntentState>(value) })}
        >
          <SelectTrigger className="h-7 w-28 text-xs" aria-label="State">
            <SelectValue placeholder="Any state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any state</SelectItem>
            {STATES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.source ?? ANY}
          onValueChange={(value) => patch({ source: fromSelect<PageIntentSource>(value) })}
        >
          <SelectTrigger className="h-7 w-32 text-xs" aria-label="Decided by">
            <SelectValue placeholder="Decided by anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Decided by anyone</SelectItem>
            {SOURCES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Writing controls are ABSENT for a read-only viewer, never disabled. */}
        {readOnly ? null : (
          <button
            type="button"
            aria-pressed={reviewing}
            onClick={() => onReviewingChange(!reviewing)}
            title="Step through the proposed intents on this page of results, one at a time."
            className={cn(
              CONTROL,
              reviewing && "bg-muted font-medium",
              "hover:bg-accent",
            )}
          >
            Review proposals
          </button>
        )}

        {anyFilter ? (
          <button
            type="button"
            onClick={() => dispatch(clearPageFilters({ mapId }))}
            className={cn(CONTROL, "hover:bg-accent")}
          >
            Clear
          </button>
        ) : null}
      </div>

      {anyFilter ? (
        <div className="flex flex-wrap items-center gap-1">
          {filters.text.trim() !== "" ? (
            <Chip
              label={`text: ${filters.text}`}
              onClear={() => patch({ text: "" })}
            />
          ) : null}
          {filters.topicSlug !== null ? (
            <Chip
              label={`topic: ${filters.topicSlug}`}
              onClear={() => patch({ topicSlug: null })}
            />
          ) : null}
          {filters.regionSlug !== null ? (
            <Chip
              label={`region: ${filters.regionSlug}`}
              onClear={() => patch({ regionSlug: null })}
            />
          ) : null}
          {filters.traffic !== "all" ? (
            <Chip
              label={
                filters.traffic === "low"
                  ? `traffic: ≤ ${knobs.pages_low_traffic_clicks_max} clicks`
                  : "traffic: with traffic"
              }
              onClear={() => patch({ traffic: "all" })}
            />
          ) : null}
          {filters.disposition !== null ? (
            <Chip
              label={`disposition: ${filters.disposition}`}
              onClear={() => patch({ disposition: null })}
            />
          ) : null}
          {filters.state !== null ? (
            <Chip
              label={`state: ${filters.state}`}
              onClear={() => patch({ state: null })}
            />
          ) : null}
          {filters.source !== null ? (
            <Chip
              label={`decided by: ${filters.source}`}
              onClear={() => patch({ source: null })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
