"use client";

/**
 * The Press Room — a three-pane press-operations console.
 *
 * Layout follows VSCode's region model, which is also Muck Rack's and Prowly's:
 * one peripheral facet rail, one ranked work queue, one primary detail
 * rectangle, a persistent deadline rail on top and a status bar underneath.
 * Nothing scrolls except the three panes' own scrollports, so the page never
 * moves under the operator's cursor.
 *
 * WHAT IS REAL AND WHAT IS NOT — stated plainly, because the ground rules
 * demand it:
 *   - Rows come from `source.ts`, which today resolves fixtures (a sanctioned,
 *     explicit exception for this bake-off) and is written as a one-function
 *     swap for three Supabase reads.
 *   - Loading, empty, error and STALLED states are real and reachable:
 *     `?state=empty`, `?state=error`, `?state=slow`.
 *   - Copy-to-clipboard, every door, every filter, sort, search, keyboard
 *     shortcut and deep link are fully functional.
 *   - Accept / Mark pitched / Dismiss move the row in the console but are NOT
 *     persisted — no write path to `seo.story_angle` exists yet. That is said
 *     out loud in the status bar the moment a ruling is made, with a discard
 *     control beside it. It is never silently swallowed.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Command,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import {
  InlineQueryError,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

import { usePressRoom, useNow } from "./usePressRoom";
import { parseScenario, type PressRoomScenario } from "./source";
import {
  parseFocus,
  parseTab,
  pressRoomHref,
  serializeFocus,
  tabForFocus,
  type FocusRef,
  type PressTab,
} from "./routes";
import {
  computeTotals,
  EMPTY_FILTERS,
  filterAngles,
  filterCoverage,
  filterRequests,
  sortAngles,
  sortCoverage,
  sortRequests,
  type AngleSort,
  type PressFilters,
} from "./select";
import type { StoryAngleRow } from "./types";
import { DeadlineRail } from "./components/DeadlineRail";
import { FacetRail } from "./components/FacetRail";
import {
  AngleList,
  CoverageList,
  PipelineView,
  RequestList,
} from "./components/lists";
import {
  AngleDetail,
  CoverageDetail,
  RequestDetail,
} from "./components/details";
import { EmptyPanel, RowSkeleton } from "./components/chrome";

const TABS: { key: PressTab; label: string }[] = [
  { key: "angles", label: "Angles" },
  { key: "requests", label: "Requests" },
  { key: "pipeline", label: "Pipeline" },
  { key: "coverage", label: "Coverage" },
];

const SORTS: { key: AngleSort; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "newsworthiness", label: "Newsworthy" },
  { key: "timeliness", label: "Timely" },
  { key: "evidence", label: "Least proven" },
  { key: "recent", label: "Recently changed" },
];

export default function PressRoomWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const now = useNow(30_000);

  const scenario: PressRoomScenario = parseScenario(params.get("state"));
  const tab = parseTab(params.get("tab"));
  const focus = parseFocus(params.get("focus"));

  const query = usePressRoom(scenario);
  const [filters, setFilters] = React.useState<PressFilters>(EMPTY_FILTERS);
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [rulings, setRulings] = React.useState<Record<string, string>>({});
  const searchRef = React.useRef<HTMLInputElement>(null);

  const setUrl = React.useCallback(
    (next: { tab?: PressTab; focus?: FocusRef | null }) => {
      const search = new URLSearchParams(params.toString());
      if (next.tab) {
        if (next.tab === "angles") search.delete("tab");
        else search.set("tab", next.tab);
      }
      if (next.focus !== undefined) {
        const value = serializeFocus(next.focus);
        if (value) search.set("focus", value);
        else search.delete("focus");
      }
      const queryString = search.toString();
      router.replace(queryString ? `?${queryString}` : "?", { scroll: false });
    },
    [params, router],
  );

  const focusRecord = React.useCallback(
    (next: FocusRef) => setUrl({ tab: tabForFocus(next), focus: next }),
    [setUrl],
  );

  /* ── rows ─────────────────────────────────────────────────────────────── */

  const bundle = query.data;

  // A local ruling is applied over the loaded row so the whole console — list,
  // funnel, facet counts — moves together. It never mutates the source row.
  const angles: StoryAngleRow[] = React.useMemo(() => {
    const rows = bundle?.angles ?? [];
    if (Object.keys(rulings).length === 0) return rows;
    return rows.map((row) =>
      rulings[row.id] ? { ...row, status: rulings[row.id] } : row,
    );
  }, [bundle, rulings]);

  const requests = bundle?.requests ?? [];
  const coverage = bundle?.coverage ?? [];

  const visibleAngles = sortAngles(
    filterAngles(angles, filters),
    filters.sort,
  );
  const visibleRequests = sortRequests(filterRequests(requests, filters), now);
  const visibleCoverage = sortCoverage(filterCoverage(coverage, filters));
  const totals = computeTotals(angles, requests, coverage, now);

  const visibleIds =
    tab === "requests"
      ? visibleRequests.map((row) => row.id)
      : tab === "coverage"
        ? visibleCoverage.map((row) => row.id)
        : visibleAngles.map((row) => row.id);

  const focusKind =
    tab === "requests" ? "request" : tab === "coverage" ? "coverage" : "angle";

  const selectedAngle = focus?.kind === "angle"
    ? angles.find((row) => row.id === focus.id)
    : undefined;
  const selectedRequest = focus?.kind === "request"
    ? requests.find((row) => row.id === focus.id)
    : undefined;
  const selectedCoverage = focus?.kind === "coverage"
    ? coverage.find((row) => row.id === focus.id)
    : undefined;

  /* ── rulings ──────────────────────────────────────────────────────────── */

  const rule = React.useCallback(
    (angleId: string, status: string) => {
      setRulings((current) => ({ ...current, [angleId]: status }));
      toast.info(
        `Marked ${status}. Held in this session only — writes to seo.story_angle are not wired yet.`,
      );
    },
    [],
  );

  const discardRulings = React.useCallback(() => {
    setRulings({});
    toast.success("Local rulings discarded");
  }, []);

  /* ── keyboard ─────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && typing) {
        (target as HTMLInputElement).blur();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key >= "1" && event.key <= "4") {
        const next = TABS[Number(event.key) - 1];
        if (next) {
          event.preventDefault();
          setUrl({ tab: next.key, focus: null });
        }
        return;
      }
      if (event.key === "j" || event.key === "k") {
        if (visibleIds.length === 0) return;
        event.preventDefault();
        const index = focus ? visibleIds.indexOf(focus.id) : -1;
        const step = event.key === "j" ? 1 : -1;
        const nextIndex =
          index === -1
            ? event.key === "j"
              ? 0
              : visibleIds.length - 1
            : Math.min(Math.max(index + step, 0), visibleIds.length - 1);
        focusRecord({ kind: focusKind, id: visibleIds[nextIndex] });
        return;
      }
      if (event.key === "x") {
        event.preventDefault();
        setFilters(EMPTY_FILTERS);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus, focusKind, focusRecord, setUrl, visibleIds]);

  /* ── panes ────────────────────────────────────────────────────────────── */

  const listPane = query.isPending ? (
    <RowSkeleton />
  ) : query.error ? (
    <QueryError error={query.error} onRetry={query.refetch} />
  ) : tab === "requests" ? (
    <RequestList
      requests={visibleRequests}
      now={now}
      focusedId={focus?.id ?? null}
      onSelect={(id) => focusRecord({ kind: "request", id })}
    />
  ) : tab === "coverage" ? (
    <CoverageList
      coverage={visibleCoverage}
      angles={angles}
      focusedId={focus?.id ?? null}
      onSelect={(id) => focusRecord({ kind: "coverage", id })}
    />
  ) : tab === "pipeline" ? (
    <PipelineView
      angles={visibleAngles}
      requests={requests}
      coverage={coverage}
      focusedId={focus?.id ?? null}
      onSelect={(id) => focusRecord({ kind: "angle", id })}
    />
  ) : (
    <AngleList
      angles={visibleAngles}
      focusedId={focus?.id ?? null}
      onSelect={(id) => focusRecord({ kind: "angle", id })}
    />
  );

  const detailPane = selectedAngle ? (
    <AngleDetail
      angle={selectedAngle}
      requests={requests}
      coverage={coverage}
      now={now}
      onFocusRequest={(id) => focusRecord({ kind: "request", id })}
      onFocusCoverage={(id) => focusRecord({ kind: "coverage", id })}
      onRule={rule}
      locallyRuled={Boolean(rulings[selectedAngle.id])}
    />
  ) : selectedRequest ? (
    <RequestDetail
      request={selectedRequest}
      angle={angles.find((row) => row.id === selectedRequest.story_angle_id)}
      now={now}
      onFocusAngle={(id) => focusRecord({ kind: "angle", id })}
    />
  ) : selectedCoverage ? (
    <CoverageDetail
      mention={selectedCoverage}
      angle={angles.find(
        (row) =>
          row.id ===
          (selectedCoverage.metadata &&
          typeof selectedCoverage.metadata === "object" &&
          !Array.isArray(selectedCoverage.metadata)
            ? (selectedCoverage.metadata as Record<string, unknown>)
                .story_angle_id
            : undefined),
      )}
      onFocusAngle={(id) => focusRecord({ kind: "angle", id })}
    />
  ) : focus ? (
    <EmptyPanel
      icon={<TriangleAlert className="h-5 w-5" />}
      title="That record is not in the loaded set"
      hint={`The URL points at ${focus.kind} ${focus.id.slice(0, 8)}…, which is not in what loaded. It may belong to another site, or it may have been deleted.`}
      action={
        <Button
          size="sm"
          variant="outline"
          className="mt-1 h-7 text-xs"
          onClick={() => setUrl({ focus: null })}
        >
          Clear selection
        </Button>
      }
    />
  ) : (
    <EmptyPanel
      icon={<Inbox className="h-5 w-5" />}
      title="Nothing selected"
      hint="Pick a row to see the full brief, the proof it still needs, and everywhere it has been pitched. Use j / k to move without the mouse."
    />
  );

  /* ── chrome ───────────────────────────────────────────────────────────── */

  const toolbar = (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 py-1">
      <div role="tablist" className="flex shrink-0 items-center">
        {TABS.map((entry, index) => {
          const active = entry.key === tab;
          const count =
            entry.key === "requests"
              ? requests.length
              : entry.key === "coverage"
                ? coverage.length
                : entry.key === "pipeline"
                  ? totals.angles
                  : angles.length;
          return (
            <button
              key={entry.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setUrl({ tab: entry.key, focus: null })}
              title={`${entry.label} — press ${index + 1}`}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {entry.label}
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative ml-1 min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={filters.q}
          onChange={(event) =>
            setFilters({ ...filters, q: event.target.value })
          }
          placeholder="Search headlines, queries, outlets…   /"
          className="h-6 rounded border-border pl-7 pr-6 text-xs"
        />
        {filters.q ? (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, q: "" })}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {tab === "angles" || tab === "pipeline" ? (
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <span className="text-[11px] text-muted-foreground">Sort</span>
          {SORTS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilters({ ...filters, sort: entry.key })}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                filters.sort === entry.key
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 gap-1 px-1.5 text-[11px] text-muted-foreground"
        onClick={query.refetch}
        disabled={query.isFetching}
      >
        <RefreshCw
          className={cn("h-3 w-3", query.isFetching && "animate-spin")}
        />
        Refresh
      </Button>
    </div>
  );

  const statusBar = (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
      <span className="tabular-nums">
        {visibleIds.length} shown / {angles.length + requests.length + coverage.length} loaded
      </span>
      <span className="tabular-nums">
        <span className="text-foreground">{totals.pitchable}</span> ready to
        pitch
      </span>
      <span className="tabular-nums">
        <span className="text-foreground">{totals.blockedOnProof}</span>{" "}
        gathering proof
      </span>
      <span className="tabular-nums">
        <span className="text-foreground">{totals.quickWins}</span> quick wins
      </span>
      <span
        className={cn(
          "tabular-nums",
          totals.closingToday > 0 && "font-medium text-destructive",
        )}
      >
        {totals.closingToday} deadline
        {totals.closingToday === 1 ? "" : "s"} within 24h
      </span>
      <span className="tabular-nums">
        <span className="text-foreground">{totals.coverageOurs}</span> pieces of
        coverage
      </span>

      {Object.keys(rulings).length > 0 ? (
        <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-3 w-3" />
          {Object.keys(rulings).length} ruling
          {Object.keys(rulings).length === 1 ? "" : "s"} held in this session —
          no write path to seo.story_angle yet
          <button
            type="button"
            onClick={discardRulings}
            className="underline underline-offset-2"
          >
            discard
          </button>
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-2">
        {query.isFetching ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading…
          </span>
        ) : query.updatedAt ? (
          <span className="tabular-nums">
            Updated {new Date(query.updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
        <span className="hidden items-center gap-1 lg:flex">
          <Command className="h-3 w-3" />
          j/k move · 1-4 tabs · / search · x clear
        </span>
      </span>
    </div>
  );

  const stallNotice = query.stalled ? (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>
        This read has been running for a while. Nothing is wrong yet — the
        console will fill in as soon as it answers.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-5 px-1.5 text-[11px]"
        onClick={query.refetch}
      >
        Retry now
      </Button>
    </div>
  ) : null;

  const errorStrip =
    query.error && bundle ? (
      <div className="shrink-0 px-2 py-1">
        <InlineQueryError
          what="the press room"
          error={query.error}
          onRetry={query.refetch}
        />
      </div>
    ) : null;

  const nothingLoaded =
    !query.isPending &&
    !query.error &&
    angles.length === 0 &&
    requests.length === 0 &&
    coverage.length === 0;

  /* ── mobile ───────────────────────────────────────────────────────────── */

  if (isMobile) {
    const showingDetail = Boolean(
      selectedAngle || selectedRequest || selectedCoverage,
    );
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
        <DeadlineRail
          requests={requests}
          now={now}
          focusedId={focus?.id ?? null}
          onFocus={(id) => focusRecord({ kind: "request", id })}
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed((value) => !value)}
          loading={query.isPending}
        />
        {stallNotice}
        {errorStrip}
        {showingDetail ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => setUrl({ focus: null })}
              className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 text-xs text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {TABS.find((entry) => entry.key === tab)?.label}
            </button>
            <div className="min-h-0 flex-1">{detailPane}</div>
          </div>
        ) : (
          <>
            {toolbar}
            <ScrollArea className="min-h-0 flex-1">
              {nothingLoaded ? <NothingLoaded /> : listPane}
            </ScrollArea>
          </>
        )}
        {statusBar}
      </div>
    );
  }

  /* ── desktop ──────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
      <DeadlineRail
        requests={requests}
        now={now}
        focusedId={focus?.id ?? null}
        onFocus={(id) => focusRecord({ kind: "request", id })}
        collapsed={railCollapsed}
        onToggle={() => setRailCollapsed((value) => !value)}
        loading={query.isPending}
      />
      {stallNotice}
      {errorStrip}

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          defaultSize={pct(17)}
          minSize={pct(12)}
          maxSize={pct(28)}
          style={{ overflow: "hidden" }}
        >
          <FacetRail
            tab={tab}
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
            angles={angles}
            requests={requests}
            coverage={coverage}
            siteId={bundle?.siteId ?? null}
            siteName={bundle?.siteName ?? "—"}
            brandName={bundle?.brandName ?? "—"}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel
          defaultSize={pct(44)}
          minSize={pct(28)}
          style={{ overflow: "hidden" }}
        >
          <div className="flex h-full min-h-0 flex-col bg-background">
            {toolbar}
            <ScrollArea className="min-h-0 flex-1">
              {nothingLoaded ? <NothingLoaded /> : listPane}
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel
          defaultSize={pct(39)}
          minSize={pct(24)}
          style={{ overflow: "hidden" }}
        >
          <div className="flex h-full min-h-0 flex-col bg-card">{detailPane}</div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {statusBar}
    </div>
  );
}

function NothingLoaded() {
  return (
    <EmptyPanel
      icon={<Inbox className="h-5 w-5" />}
      title="No press data for this site yet"
      hint="Story angles are produced by analysis over the facts this business already has on file. Journalist queries start arriving as soon as the platforms are connected."
      action={
        <a
          href={pressRoomHref({ tab: "angles" })}
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Reload the press room
          <ChevronRight className="h-3 w-3" />
        </a>
      }
    />
  );
}
