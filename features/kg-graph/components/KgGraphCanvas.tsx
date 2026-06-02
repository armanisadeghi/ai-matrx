// features/kg-graph/components/KgGraphCanvas.tsx
//
// The single KG canvas surface — serves BOTH `/knowledge-graph` (mode="org")
// and `/scopes/[scopeId]/graph` (mode="scope"). It owns the data fetch, the
// toolbar (fit / kind filter / node count + truncated indicator) and the side
// panel; the actual cytoscape render surface is loaded via
// next/dynamic({ ssr: false }) because cytoscape touches `window`/DOM at import.
//
// Local component state only (read-mostly: one fetch per view, no cross-surface
// shared state) — matching the "no parallel slices for a single-fetch view"
// guidance. Lucide for chrome icons; semantic color classes for chrome.

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Maximize2,
  Network,
  RefreshCw,
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
import { KgGraphSidePanel } from "./KgGraphSidePanel";

// cytoscape + react-cytoscapejs touch window at import → must be client-only.
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
  const [fitSignal, setFitSignal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

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

  const nodeCount = filtered.nodes.length;
  const edgeCount = filtered.edges.length;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Network className="h-4 w-4 text-primary" />
          {mode === "org" ? "Knowledge graph" : "Scope neighborhood"}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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

          {kinds.length > 1 ? (
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All kinds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_KINDS}>All kinds</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <button
            onClick={() => setFitSignal((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Fit graph to view"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Fit
          </button>
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
            <KgGraphCytoscape
              nodes={filtered.nodes}
              edges={filtered.edges}
              selectedId={selected?.id ?? null}
              onNodeClick={setSelected}
              fitSignal={fitSignal}
            />
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
