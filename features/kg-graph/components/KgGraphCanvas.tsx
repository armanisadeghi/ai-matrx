// features/kg-graph/components/KgGraphCanvas.tsx
//
// The single KG canvas surface — serves BOTH `/knowledge-graph` (mode="org")
// and `/scopes/[scopeId]/graph` (mode="scope"). It owns the data fetch and the
// chrome around the graph: toolbar (search, layout, colour/size encoding, kind
// filter, reload), legend, empty/error/loading states, and the side panel. The
// actual cytoscape render surface is loaded via next/dynamic({ ssr:false })
// because cytoscape + its extensions touch `window`/DOM at import.
//
// Local component state only (read-mostly: one fetch per view) — matching the
// "no parallel slices for a single-fetch view" guidance. Lucide for chrome icons;
// semantic colour classes throughout.

"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Circle,
  EyeOff,
  Gauge,
  Network,
  Palette,
  RefreshCw,
  Search,
  Spline,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/utils/cn";

import { fetchKgGraph } from "../service/kgGraphService";
import {
  KG_DEFAULT_DEPTH,
  KG_DEFAULT_DETAIL,
  KG_DETAIL_LEVELS,
  isNoiseKind,
  kgDetailLimit,
  type KgDetailId,
} from "../constants";
import type { GraphEdge, GraphNode, GraphPayload, KgGraphMode } from "../types";
import type { KgColorBy, KgSizeBy } from "../cytoscape/analysis";
import { KG_LAYOUTS, type KgLayoutId } from "../cytoscape/layouts";
import { KgGraphSidePanel } from "./KgGraphSidePanel";
import { KgGraphLegend } from "./KgGraphLegend";
import { KgScopeFilter } from "./KgScopeFilter";

// cytoscape + extensions touch window at import → must be client-only.
const KgGraphCytoscape = dynamic(() => import("./KgGraphCytoscape"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

export interface KgGraphCanvasProps {
  mode: KgGraphMode;
  scopeId?: string;
  organizationId?: string | null;
  /** Org mode only: seed the scope filter from the route (`?scope=`). */
  initialScopeId?: string | null;
  /** Org mode only: restrict the scope picker to one type (`?scopeType=`). */
  initialScopeTypeId?: string | null;
}

const ALL_KINDS = "__all__";

const SELECT_TRIGGER = "h-8 w-[150px] text-xs";

// The shadcn SelectTrigger applies `[&>span]:line-clamp-1`, which forces
// `display:-webkit-box; -webkit-box-orient:vertical` onto the trigger's direct
// child span — stacking a leading icon vertically on top of the label. That
// `[&>span]` selector outranks a utility class, so we override the display with
// an inline style (inline always wins) to keep icon + label on one centered row.
const KG_TRIGGER_INNER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  minWidth: 0,
};

export function KgGraphCanvas({
  mode,
  scopeId,
  organizationId,
  initialScopeId = null,
  initialScopeTypeId = null,
}: KgGraphCanvasProps) {
  const isMobile = useIsMobile();
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>(ALL_KINDS);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Visualization controls.
  const [detail, setDetail] = useState<KgDetailId>(KG_DEFAULT_DETAIL);
  const [layoutId, setLayoutId] = useState<KgLayoutId>("fcose");
  // Default to the structural encodings: colour by cluster tier (the tree), size
  // by importance (PageRank). Entity-kind colouring (concept/date/person…) is
  // rarely what matters, so it's an opt-in alternative, not the default.
  const [colorBy, setColorBy] = useState<KgColorBy>("tier");
  const [sizeBy, setSizeBy] = useState<KgSizeBy>("importance");
  const [search, setSearch] = useState("");
  const [communityCount, setCommunityCount] = useState(0);
  // Hide low-value scaffolding kinds (phone/email/url/address) by default so the
  // signal isn't drowned in document noise — toggleable.
  const [hideNoise, setHideNoise] = useState(true);
  // Org mode: narrow the graph to one scope's tagged sources (manual picker or
  // the `?scope=` route param). In scope mode the route's scope is fixed.
  const [scopeFilter, setScopeFilter] = useState<string | null>(initialScopeId);

  // The scope actually driving the fetch: the route's fixed scope in scope mode,
  // else the user/route-selected filter (null = org-wide).
  const effectiveScopeId = mode === "scope" ? (scopeId ?? null) : scopeFilter;

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setSelected(null);
    fetchKgGraph(
      {
        // scope_id wins when set (backend resolves scope → tagged sources →
        // entities); otherwise the org-wide corpus.
        organizationId: effectiveScopeId ? undefined : organizationId,
        scopeId: effectiveScopeId ?? undefined,
        depth: KG_DEFAULT_DEPTH,
        // Only the top-N most-connected nodes — a smaller budget = a far faster
        // first paint. The user dials in more via the "Detail" control.
        limit: kgDetailLimit(detail),
      },
      { signal: controller.signal },
    )
      .then((data) => {
        setPayload(data);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load graph");
        setStatus("error");
      });
    return () => controller.abort();
  }, [mode, organizationId, effectiveScopeId, reloadKey, detail]);

  // Available kinds for the filter dropdown.
  const kinds = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.nodes.map((n) => n.kind))).sort();
  }, [payload]);

  // How many nodes the noise filter is currently suppressing (for the toggle label).
  const noiseCount = useMemo(
    () => (payload ? payload.nodes.filter((n) => isNoiseKind(n.kind)).length : 0),
    [payload],
  );

  // Client-side narrowing: an explicit kind filter wins; otherwise drop noise
  // kinds when hideNoise is on. Edges survive only if both endpoints survive.
  const filtered = useMemo(() => {
    if (!payload) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    let nodes = payload.nodes;
    if (kindFilter !== ALL_KINDS) {
      nodes = nodes.filter((n) => n.kind === kindFilter);
    } else if (hideNoise) {
      nodes = nodes.filter((n) => !isNoiseKind(n.kind));
    }
    if (nodes === payload.nodes) {
      return { nodes: payload.nodes, edges: payload.edges };
    }
    const keep = new Set(nodes.map((n) => n.id));
    const edges = payload.edges.filter(
      (e) => keep.has(e.source) && keep.has(e.target),
    );
    return { nodes, edges };
  }, [payload, kindFilter, hideNoise]);

  // Kinds actually present in the current view (for the legend key).
  const legendKinds = useMemo(
    () => Array.from(new Set(filtered.nodes.map((n) => n.kind))).sort(),
    [filtered.nodes],
  );

  const nodeCount = filtered.nodes.length;
  const edgeCount = filtered.edges.length;
  const showGraph = status === "ready" && nodeCount > 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Network className="h-4 w-4 text-primary" />
          {mode === "org" ? "Knowledge graph" : "Scope neighborhood"}
        </div>

        {status === "ready" ? (
          <span className="text-xs text-muted-foreground">
            {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge
            {edgeCount === 1 ? "" : "s"}
            {payload?.truncated ? (
              <span
                className="ml-1 inline-flex items-center gap-1 text-amber-500"
                title="Showing the most-connected nodes. Raise Detail to load more."
              >
                <AlertTriangle className="h-3 w-3" /> top {nodeCount} — raise Detail
                for more
              </span>
            ) : null}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Scope filter (org graph only): narrow to one Client / Case / Kid. */}
          {mode === "org" ? (
            <KgScopeFilter
              organizationId={organizationId ?? null}
              value={scopeFilter}
              onChange={setScopeFilter}
              scopeTypeId={initialScopeTypeId}
              className={cn(SELECT_TRIGGER, "w-[180px]")}
            />
          ) : null}

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes…"
              disabled={!showGraph}
              className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>

          {/* Detail budget — how many top-ranked nodes to fetch/render */}
          <Select value={detail} onValueChange={(v) => setDetail(v as KgDetailId)}>
            <SelectTrigger className={cn(SELECT_TRIGGER, "w-[150px]")}>
              <span style={KG_TRIGGER_INNER}>
                <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {KG_DETAIL_LEVELS.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.label} · {d.limit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Layout switcher */}
          <Select
            value={layoutId}
            onValueChange={(v) => setLayoutId(v as KgLayoutId)}
            disabled={!showGraph}
          >
            <SelectTrigger className={cn(SELECT_TRIGGER, "w-[160px]")}>
              <span style={KG_TRIGGER_INNER}>
                <Spline className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {KG_LAYOUTS.map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-xs">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Colour encoding */}
          <Select
            value={colorBy}
            onValueChange={(v) => setColorBy(v as KgColorBy)}
            disabled={!showGraph}
          >
            <SelectTrigger className={cn(SELECT_TRIGGER, "w-[165px]")}>
              <span style={KG_TRIGGER_INNER}>
                <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tier" className="text-xs">
                Colour: hierarchy
              </SelectItem>
              <SelectItem value="community" className="text-xs">
                Colour: community
              </SelectItem>
              <SelectItem value="kind" className="text-xs">
                Colour: kind
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Size encoding */}
          <Select
            value={sizeBy}
            onValueChange={(v) => setSizeBy(v as KgSizeBy)}
            disabled={!showGraph}
          >
            <SelectTrigger className={cn(SELECT_TRIGGER, "w-[165px]")}>
              <span style={KG_TRIGGER_INNER}>
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="connections" className="text-xs">
                Size: connections
              </SelectItem>
              <SelectItem value="importance" className="text-xs">
                Size: importance
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Noise filter — hide phone/email/url/address scaffolding (default on) */}
          {noiseCount > 0 ? (
            <button
              type="button"
              onClick={() => setHideNoise((v) => !v)}
              disabled={!showGraph}
              aria-pressed={hideNoise}
              title={
                hideNoise
                  ? `Hiding ${noiseCount} low-value node${noiseCount === 1 ? "" : "s"} (phone/email/url/address). Click to show them.`
                  : "Hide low-value scaffolding kinds (phone/email/url/address)."
              }
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50",
                hideNoise
                  ? "border-border bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {hideNoise ? `Noise hidden (${noiseCount})` : "Hide noise"}
            </button>
          ) : null}

          {/* Kind filter */}
          {kinds.length > 1 ? (
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className={SELECT_TRIGGER}>
                <SelectValue placeholder="All kinds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_KINDS} className="text-xs">
                  All kinds
                </SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <button
            onClick={() => setReloadKey((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Reload graph"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload
          </button>
        </div>
      </div>

      {/* Body: canvas + side panel. The canvas needs `min-w-0` or its fixed-width
          cytoscape <canvas> keeps the flex item from shrinking, pushing the
          side panel off-screen to the right (it renders but is never visible). */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 bg-textured">
          {status === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Network className="h-8 w-8 animate-pulse text-primary" />
                <span className="text-sm">Building graph…</span>
              </div>
            </div>
          ) : status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="flex max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    Couldn&apos;t load the graph
                  </div>
                  <div className="text-xs text-muted-foreground">{error}</div>
                  <button
                    onClick={() => setReloadKey((n) => n + 1)}
                    className="text-xs text-primary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : nodeCount === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <Network className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                {payload && payload.nodes.length > 0 ? (
                  // Data loaded, but the active filters hid all of it.
                  <>
                    <div className="text-sm font-medium">
                      Everything is filtered out
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      All {payload.nodes.length} loaded node
                      {payload.nodes.length === 1 ? "" : "s"} are hidden by your
                      current filters
                      {hideNoise && noiseCount > 0
                        ? " (low-value noise kinds are hidden)"
                        : ""}
                      .
                    </p>
                    <button
                      onClick={() => {
                        setHideNoise(false);
                        setKindFilter(ALL_KINDS);
                      }}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Show all
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium">No graph data yet</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {mode === "scope"
                        ? "This scope has no associated entities yet. Tag sources and run ingestion to populate its neighborhood."
                        : "No entities found for your organization yet. Run ingestion on your content to build the knowledge graph."}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <KgGraphCytoscape
                nodes={filtered.nodes}
                edges={filtered.edges}
                selectedId={selected?.id ?? null}
                onNodeClick={setSelected}
                onBackgroundClick={() => setSelected(null)}
                layoutId={layoutId}
                colorBy={colorBy}
                sizeBy={sizeBy}
                searchQuery={search}
                onAnalysis={(a) => setCommunityCount(a.communityCount)}
              />
              <KgGraphLegend
                colorBy={colorBy}
                kinds={legendKinds}
                communityCount={communityCount}
              />
            </>
          )}
        </div>

        {selected ? (
          <div
            className={cn(
              "z-10 shrink-0",
              isMobile
                ? "absolute inset-y-0 right-0 w-[88%] max-w-sm shadow-xl"
                : "w-80",
            )}
          >
            <KgGraphSidePanel
              node={selected}
              onClose={() => setSelected(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
