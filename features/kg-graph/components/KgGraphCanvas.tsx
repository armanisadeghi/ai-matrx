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
import { KG_DEFAULT_DEPTH, KG_DEFAULT_LIMIT } from "../constants";
import type { GraphNode, GraphPayload, KgGraphMode } from "../types";
import type { KgColorBy, KgSizeBy } from "../cytoscape/analysis";
import { KG_LAYOUTS, type KgLayoutId } from "../cytoscape/layouts";
import { KgGraphSidePanel } from "./KgGraphSidePanel";
import { KgGraphLegend } from "./KgGraphLegend";

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
  const [layoutId, setLayoutId] = useState<KgLayoutId>("fcose");
  const [colorBy, setColorBy] = useState<KgColorBy>("kind");
  const [sizeBy, setSizeBy] = useState<KgSizeBy>("connections");
  const [search, setSearch] = useState("");
  const [communityCount, setCommunityCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setSelected(null);
    fetchKgGraph(
      {
        organizationId: mode === "org" ? organizationId : undefined,
        scopeId: mode === "scope" ? scopeId : undefined,
        depth: KG_DEFAULT_DEPTH,
        limit: KG_DEFAULT_LIMIT,
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
  }, [mode, scopeId, organizationId, reloadKey]);

  // Available kinds for the filter dropdown.
  const kinds = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.nodes.map((n) => n.kind))).sort();
  }, [payload]);

  // Client-side kind filtering (the dropdown). When a kind is selected, keep
  // only its nodes and the edges whose endpoints both survive.
  const filtered = useMemo(() => {
    if (!payload) return { nodes: [] as GraphNode[], edges: payload?.edges ?? [] };
    if (kindFilter === ALL_KINDS) {
      return { nodes: payload.nodes, edges: payload.edges };
    }
    const nodes = payload.nodes.filter((n) => n.kind === kindFilter);
    const keep = new Set(nodes.map((n) => n.id));
    const edges = payload.edges.filter(
      (e) => keep.has(e.source) && keep.has(e.target),
    );
    return { nodes, edges };
  }, [payload, kindFilter]);

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
              <span className="ml-1 inline-flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" /> capped
              </span>
            ) : null}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              <SelectItem value="kind" className="text-xs">
                Colour: kind
              </SelectItem>
              <SelectItem value="community" className="text-xs">
                Colour: community
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

      {/* Body: canvas + side panel */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-textured">
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
                <div className="text-sm font-medium">No graph data yet</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mode === "scope"
                    ? "This scope has no associated entities yet. Tag sources and run ingestion to populate its neighborhood."
                    : "No entities found for your organization yet. Run ingestion on your content to build the knowledge graph."}
                </p>
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
