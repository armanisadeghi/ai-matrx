"use client";

/**
 * THE NEWSROOM DESK — /marketing/pr
 *
 * ── What this is a reinvention OF ───────────────────────────────────────
 * The obvious build for this brief is four tabs: Story Angles, Source
 * Requests, Pitch Pipeline, Coverage. That is the shape of the DATABASE, not
 * the shape of the job. An operator running press for three clients does not
 * wake up and pick a tab; they ask one question — "what do I do next, and is
 * anything about to expire?" Four tabs answer that question zero times and
 * hide the answer in whichever one they did not open.
 *
 * So this is one queue, not four screens:
 *
 *   THE CLOCK RAIL     Journalist windows are the only thing here that
 *                      evaporates, so they are never behind a tab. They live
 *                      in a fixed ticking ribbon above everything.
 *
 *   THE RUN OF SHOW    Angles, requests and clippings share ONE ranked list,
 *                      because they are one object — a story — at three
 *                      points in its life. The ranking is fused and, unlike
 *                      every ranked list we benchmarked, it EXPLAINS itself
 *                      on every row.
 *
 *   THE BRIEF          The selected story, fully workable: the journalist's
 *                      headline, the timeliness hook, the Proof Ledger, the
 *                      lane it is in, and every action that moves it.
 *
 * The "pitch pipeline" is not a screen either — it is the five-stop lane drawn
 * on each story from the timestamps the row already carries.
 *
 * ── Benchmarked ─────────────────────────────────────────────────────────
 * Linear's issue list (dense ranked rows, keyboard-first, one queue),
 * Muck Rack and Prowly (journalist/outlet records as first-class doors),
 * Propel (source-request response desk), Prezly (coverage as the end of the
 * same pipeline rather than a separate report). The look is entirely ours.
 *
 * ── Data ────────────────────────────────────────────────────────────────
 * This component is a pure function of `DeskData` — generated Supabase row
 * types, nothing widened, nothing hand-mirrored. It does not know fixtures
 * exist; the page hands it rows. Mutations run through the pure reducers in
 * `lib/actions.ts` and are applied optimistically to local state, which is
 * exactly where a Supabase write + invalidate slots in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { PRESS_DESK_FIXTURE } from "./fixtures";
import {
  applyAngleAction,
  applyRequestAction,
  attachEvidence,
  saveRequestDraft,
  type AngleAction,
  type RequestAction,
} from "./lib/actions";
import {
  isClosed,
  LANE_HINT,
  LANE_LABEL,
  laneOf,
  searchHaystack,
  siteOf,
  SORT_HINT,
  SORT_LABEL,
  sortItems,
  toDeskItems,
} from "./lib/desk";
import { BriefPanel, type BriefHandlers } from "./components/BriefPanel";
import { DeadlineRail } from "./components/DeadlineRail";
import {
  DeskColdStart,
  DeskEmpty,
  DeskSkeleton,
  StaleBanner,
} from "./components/DeskStates";
import { DeskRow } from "./components/DeskRow";
import type {
  CoverageMentionRow,
  DeskData,
  DeskLane,
  DeskQueryStatus,
  DeskSort,
  SourceRequestRow,
  StoryAngleRow,
} from "./types";

const LANES: DeskLane[] = ["all", "proof", "deadline", "pitch", "landed"];
const SORTS: DeskSort[] = [
  "next-up",
  "deadline",
  "newsworthy",
  "nearly-provable",
  "recent",
];

/** Live clock. The countdowns are real — they tick, and things really expire. */
function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function angleIdFromMetadata(mention: CoverageMentionRow): string | null {
  const metadata = mention.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as { [key: string]: unknown }).story_angle_id;
    if (typeof value === "string") return value;
  }
  return null;
}

export function PressDeskWorkspace({
  initialData = PRESS_DESK_FIXTURE,
  status = "ready",
  error = null,
}: {
  initialData?: DeskData;
  status?: DeskQueryStatus;
  error?: unknown;
}) {
  const now = useNow();

  const [angles, setAngles] = useState<StoryAngleRow[]>(initialData.angles);
  const [requests, setRequests] = useState<SourceRequestRow[]>(
    initialData.requests,
  );
  const coverage = initialData.coverage;
  const sites = initialData.sites;

  const [lane, setLane] = useState<DeskLane>("all");
  const [sort, setSort] = useState<DeskSort>("next-up");
  const [query, setQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState<string[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => toDeskItems({ angles, requests, coverage }),
    [angles, requests, coverage],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!showClosed && isClosed(item, now)) return false;
      if (lane !== "all" && laneOf(item, now) !== lane) return false;
      if (siteFilter.length > 0) {
        const site = siteOf(item, sites);
        if (!site || !siteFilter.includes(site.siteId)) return false;
      }
      if (needle && !searchHaystack(item, siteOf(item, sites)).includes(needle)) {
        return false;
      }
      return true;
    });
  }, [items, lane, now, query, showClosed, siteFilter, sites]);

  const ordered = useMemo(() => sortItems(visible, sort, now), [visible, sort, now]);

  const laneCounts = useMemo(() => {
    const counts: Record<DeskLane, number> = {
      all: 0,
      proof: 0,
      deadline: 0,
      pitch: 0,
      landed: 0,
    };
    for (const item of items) {
      if (!showClosed && isClosed(item, now)) continue;
      counts.all += 1;
      counts[laneOf(item, now)] += 1;
    }
    return counts;
  }, [items, now, showClosed]);

  const selected = useMemo(
    () => ordered.find((item) => item.id === selectedId) ??
      items.find((item) => item.id === selectedId) ??
      null,
    [items, ordered, selectedId],
  );

  const relatedRequests = useMemo(() => {
    if (!selected || selected.kind !== "angle") return [];
    return requests.filter((request) => request.story_angle_id === selected.id);
  }, [requests, selected]);

  const relatedCoverage = useMemo(() => {
    if (!selected || selected.kind !== "angle") return [];
    return coverage.filter((mention) => angleIdFromMetadata(mention) === selected.id);
  }, [coverage, selected]);

  const relatedAngle = useMemo(() => {
    if (!selected) return null;
    const angleId =
      selected.kind === "request"
        ? selected.row.story_angle_id
        : selected.kind === "coverage"
          ? angleIdFromMetadata(selected.row)
          : null;
    if (!angleId) return null;
    return angles.find((angle) => angle.id === angleId) ?? null;
  }, [angles, selected]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setSiteFilter([]);
    setLane("all");
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handlers: BriefHandlers = useMemo(
    () => ({
      onAngleAction: (angle: StoryAngleRow, action: AngleAction) => {
        setAngles((current) =>
          current.map((row) =>
            row.id === angle.id ? applyAngleAction(row, action) : row,
          ),
        );
        toast.success(`Angle moved to ${nextStatusWord(action)}`, {
          description: angle.headline,
        });
      },
      onAttachEvidence: (angle, input) => {
        setAngles((current) =>
          current.map((row) =>
            row.id === angle.id ? attachEvidence(row, input) : row,
          ),
        );
        toast.success("Evidence recorded", {
          description: `“${input.label}” is now in hand.`,
        });
      },
      onRequestAction: (request: SourceRequestRow, action: RequestAction) => {
        setRequests((current) =>
          current.map((row) =>
            row.id === request.id ? applyRequestAction(row, action) : row,
          ),
        );
        if (action !== "draft") {
          toast.success(`Request marked ${action === "pass" ? "passed" : action}`);
        }
      },
      onSaveDraft: (request, draft) => {
        setRequests((current) =>
          current.map((row) =>
            row.id === request.id ? saveRequestDraft(row, draft) : row,
          ),
        );
      },
      onSelect: handleSelect,
      onBack: () => setSelectedId(null),
    }),
    [handleSelect],
  );

  // Arrow-key movement inside the queue. Scoped to the list so it can never
  // steal a keystroke from the search box or the draft editor.
  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (ordered.length === 0) return;
      event.preventDefault();
      const index = ordered.findIndex((item) => item.id === selectedId);
      const next =
        event.key === "ArrowDown"
          ? Math.min(ordered.length - 1, index + 1)
          : Math.max(0, index <= 0 ? 0 : index - 1);
      setSelectedId(ordered[next]?.id ?? null);
    },
    [ordered, selectedId],
  );

  if (status === "loading") return <DeskSkeleton />;
  if (status === "error") {
    return (
      <div className="h-full">
        <QueryError error={error} />
      </div>
    );
  }

  const coldStart = items.length === 0;
  const hiddenByFilters = items.length - visible.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
        <DeadlineRail
          requests={requests}
          sites={sites}
          now={now}
          selectedId={selectedId}
          onSelect={handleSelect}
          onShowClosed={() => setShowClosed((current) => !current)}
          closedShown={showClosed}
        />
        <StaleBanner lastAnalyzedAt={initialData.lastAnalyzedAt} now={now} />

        {coldStart ? (
          <DeskColdStart />
        ) : (
          <div className="flex min-h-0 flex-1">
            <section
              className={cn(
                "flex min-h-0 w-full flex-col border-border/70 lg:w-[46%] lg:border-r xl:w-[44%]",
                selectedId && "hidden lg:flex",
              )}
            >
              <Toolbar
                lane={lane}
                setLane={setLane}
                laneCounts={laneCounts}
                sort={sort}
                setSort={setSort}
                query={query}
                setQuery={setQuery}
                sites={sites}
                siteFilter={siteFilter}
                setSiteFilter={setSiteFilter}
                showClosed={showClosed}
                setShowClosed={setShowClosed}
                shown={ordered.length}
              />
              {ordered.length === 0 ? (
                <DeskEmpty
                  lane={lane}
                  query={query}
                  hiddenByFilters={hiddenByFilters}
                  onClear={clearFilters}
                />
              ) : (
                <div
                  ref={listRef}
                  role="listbox"
                  aria-label="Story queue"
                  tabIndex={-1}
                  onKeyDown={onListKeyDown}
                  className="scrollbar-thin min-h-0 flex-1 overflow-y-auto outline-none"
                >
                  {ordered.map((item, index) => (
                    <DeskRow
                      key={item.id}
                      item={item}
                      rank={index + 1}
                      site={siteOf(item, sites)}
                      now={now}
                      selected={item.id === selectedId}
                      onSelect={handleSelect}
                    />
                  ))}
                  <p className="px-3 py-3 text-[11px] text-muted-foreground">
                    {ordered.length} of {items.length} stories shown ·{" "}
                    {SORT_HINT[sort]}
                  </p>
                </div>
              )}
            </section>

            <section
              className={cn(
                "min-h-0 flex-1 flex-col bg-background/40",
                selectedId ? "flex" : "hidden lg:flex",
              )}
            >
              <BriefPanel
                item={selected}
                site={selected ? siteOf(selected, sites) : null}
                now={now}
                relatedRequests={relatedRequests}
                relatedCoverage={relatedCoverage}
                relatedAngle={relatedAngle}
                handlers={handlers}
                showBack
              />
            </section>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function nextStatusWord(action: AngleAction): string {
  switch (action) {
    case "accept":
      return "accepted";
    case "develop":
      return "developing";
    case "pitch":
      return "pitched";
    case "land":
      return "landed";
    case "dismiss":
      return "dismissed";
    default:
      return "proposed";
  }
}

/* ── toolbar ───────────────────────────────────────────────────────────── */

function Toolbar({
  lane,
  setLane,
  laneCounts,
  sort,
  setSort,
  query,
  setQuery,
  sites,
  siteFilter,
  setSiteFilter,
  showClosed,
  setShowClosed,
  shown,
}: {
  lane: DeskLane;
  setLane: (lane: DeskLane) => void;
  laneCounts: Record<DeskLane, number>;
  sort: DeskSort;
  setSort: (sort: DeskSort) => void;
  query: string;
  setQuery: (query: string) => void;
  sites: DeskData["sites"];
  siteFilter: string[];
  setSiteFilter: (value: string[]) => void;
  showClosed: boolean;
  setShowClosed: (value: boolean) => void;
  shown: number;
}) {
  return (
    <div className="shrink-0 border-b border-border/70 bg-card/60">
      {/* Lanes replace tabs: same queue, different question. */}
      <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto px-2 pt-2">
        {LANES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLane(value)}
            title={LANE_HINT[value]}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              lane === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {LANE_LABEL[value]}
            <span
              className={cn(
                "tabular-nums",
                lane === value ? "opacity-80" : "opacity-60",
              )}
            >
              {laneCounts[value]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search headlines, beats, journalists, outlets…"
            className="h-7 pl-7 pr-7 text-xs"
            aria-label="Search the desk"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]">
              {SORT_LABEL[sort]}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[11px]">
              Order the queue by
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORTS.map((value) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => setSort(value)}
                className="flex-col items-start gap-0.5"
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    sort === value && "text-primary",
                  )}
                >
                  {SORT_LABEL[value]}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {SORT_HINT[value]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]">
              <Filter className="mr-1 h-3 w-3" />
              {siteFilter.length === 0
                ? "All clients"
                : `${siteFilter.length} client${siteFilter.length === 1 ? "" : "s"}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[11px]">
              Businesses on this desk
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sites.map((site) => {
              const active = siteFilter.includes(site.siteId);
              return (
                <DropdownMenuItem
                  key={site.siteId}
                  onSelect={(event) => {
                    event.preventDefault();
                    setSiteFilter(
                      active
                        ? siteFilter.filter((id) => id !== site.siteId)
                        : [...siteFilter, site.siteId],
                    );
                  }}
                  className="flex items-start justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {site.brandName}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {site.domain}
                    </span>
                  </span>
                  {active ? (
                    <Badge variant="secondary" className="shrink-0">
                      on
                    </Badge>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            {siteFilter.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSiteFilter([])}>
                  <span className="text-xs">Show every client</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant={showClosed ? "secondary" : "ghost"}
          className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
          onClick={() => setShowClosed(!showClosed)}
          aria-pressed={showClosed}
        >
          {showClosed ? "Hide closed" : "Show closed"}
        </Button>

        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {shown}
        </span>
      </div>
    </div>
  );
}
