"use client";

/**
 * Keyword Research workbench — the user-facing surface over the seo keyword
 * plane. Top bar runs the LSI research agent for a primary keyword (server
 * pipeline: agent → artifact → ingestion → batched volume fetch); the table
 * below is a live explorer over seo.keyword + seo.keyword_market with
 * per-keyword relationship detail on expand.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { useKeywordResearch } from "../useKeywordResearch";
import KeywordResearchLauncher from "./KeywordResearchLauncher";
import { normalizeMonthlySearches } from "../types";
import type {
  KeywordEdgeView,
  KeywordMarketRow,
  KeywordWithMarket,
  MonthlySearchPoint,
} from "../types";
import {
  KeywordCompetitionBadge,
  KeywordIntentChip,
  KeywordTrendSparkline,
  formatCpc,
  formatSearchVolume,
} from "./KeywordMetrics";

const EDGE_TYPE_LABELS: Record<string, string> = {
  refines: "Refines",
  variant_of: "Variant of",
  brand_of: "Brand of",
  related: "Related",
};

function usMarket(row: KeywordWithMarket): KeywordMarketRow | null {
  return (
    row.keyword_market.find((market) => market.location_code === 2840) ??
    row.keyword_market[0] ??
    null
  );
}

/** Oldest-first, capped at the last 12 months — the shape the sparkline reads. */
function monthlyPoints(market: KeywordMarketRow | null): MonthlySearchPoint[] {
  return normalizeMonthlySearches(market?.monthly_searches).slice(0, 12).reverse();
}

function TrajectoryBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const label = value.replace(/_/g, " ");
  const emphasis =
    value === "exploding" || value === "growing"
      ? "text-primary border-primary/40"
      : value === "declining"
        ? "text-destructive border-destructive/40"
        : "text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${emphasis}`}
    >
      {value === "growing" || value === "exploding" ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : value === "declining" ? (
        <ArrowDownRight className="h-3 w-3" />
      ) : null}
      {label}
    </span>
  );
}

function EdgeList({ edges }: { edges: KeywordEdgeView[] }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, KeywordEdgeView[]>();
    for (const edge of edges) {
      const key = edge.edge_type;
      groups.set(key, [...(groups.get(key) ?? []), edge]);
    }
    return Array.from(groups.entries());
  }, [edges]);

  if (edges.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No relationships yet — run research on this keyword to map them.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {grouped.map(([type, group]) => (
        <div key={type} className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {EDGE_TYPE_LABELS[type] ?? type}
          </span>
          {group.map((edge) => (
            <span
              key={edge.id}
              className={`rounded-md border px-1.5 py-0.5 text-xs ${
                edge.status === "rejected"
                  ? "border-destructive/40 text-muted-foreground line-through"
                  : "border-border text-foreground"
              }`}
              title={`${edge.direction} · ${edge.origin} · confidence ${edge.confidence ?? "—"}${edge.status === "rejected" ? " · rejected" : ""}`}
            >
              {edge.partner_phrase}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function KeywordDetail({
  row,
  loadEdges,
}: {
  row: KeywordWithMarket;
  loadEdges: (keywordId: string) => Promise<KeywordEdgeView[]>;
}) {
  const [edges, setEdges] = useState<KeywordEdgeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const market = usMarket(row);
  const points = monthlyPoints(market);

  useEffect(() => {
    let cancelled = false;
    loadEdges(row.id)
      .then((loaded) => {
        if (!cancelled) setEdges(loaded);
      })
      .catch((edgeError) => {
        if (!cancelled) {
          setError(edgeError instanceof Error ? edgeError.message : String(edgeError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, loadEdges]);

  return (
    <div className="grid gap-4 border-t border-border bg-muted/30 px-4 py-3 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Monthly searches{market ? ` · ${points.length} mo` : ""}
        </h4>
        {points.length > 0 ? (
          <div className="flex items-end gap-1">
            {points.map((point) => (
              <div key={`${point.year}-${point.month}`} className="flex flex-col items-center gap-1">
                <div
                  className="w-4 rounded-sm bg-primary/70"
                  style={{
                    height: `${Math.max(4, (point.search_volume / Math.max(...points.map((p) => p.search_volume), 1)) * 56)}px`,
                  }}
                  title={point.search_volume.toLocaleString()}
                />
                <span className="text-[9px] text-muted-foreground">
                  {String(point.month).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No market data fetched yet.</p>
        )}
        {market && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Bids {market.low_top_of_page_bid ?? "—"}–{market.high_top_of_page_bid ?? "—"} · growth{" "}
            {market.growth_rate !== null ? `${(Number(market.growth_rate) * 100).toFixed(0)}%` : "—"} ·
            fetched{" "}
            {market.metrics_fetched_at
              ? new Date(market.metrics_fetched_at).toLocaleDateString()
              : "never"}
          </p>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Relationships
        </h4>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : edges === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <EdgeList edges={edges} />
        )}
      </div>
    </div>
  );
}

export default function KeywordResearchWorkbench() {
  const {
    clusterPhrases,
    clearCluster,
    keywords,
    loading,
    loadError,
    search,
    setSearch,
    run,
    volumeStage,
    runResearch,
    refreshVolume,
    loadEdges,
  } = useKeywordResearch();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sorted = useMemo(() => {
    const cluster = clusterPhrases ? new Set(clusterPhrases) : null;
    return keywords
      .filter((row) => !cluster || cluster.has(row.normalized_phrase))
      .sort(
        (a, b) => (usMarket(b)?.search_volume ?? -1) - (usMarket(a)?.search_volume ?? -1),
      );
  }, [keywords, clusterPhrases]);

  const handleRefreshAll = useCallback(async () => {
    const phrases = sorted.map((row) => row.phrase);
    if (phrases.length === 0) return;
    setRefreshing(true);
    try {
      await refreshVolume(phrases.slice(0, 1000), false);
      toast.success("Volume refresh complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Volume refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [sorted, refreshVolume]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      {/* Research launcher — the canonical shared component (also hosted by
          KeywordResearchWindow, opened from anywhere). */}
      <div className="border-b border-border px-4 py-3">
        <KeywordResearchLauncher run={run} runResearch={runResearch} />
      </div>

      {/* Explorer toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter keywords"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            style={{ fontSize: "16px" }}
          />
        </div>
        {clusterPhrases && run.primaryKeyword ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-2.5 py-1 text-xs text-foreground">
            Cluster: “{run.primaryKeyword}” · {sorted.length}
            <button
              type="button"
              onClick={clearCluster}
              aria-label="Show the full keyword library"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${sorted.length} keywords in the library`}
          </span>
        )}
        <div className="flex-1" />
        {volumeStage && (
          <span className="text-xs text-muted-foreground">{volumeStage}</span>
        )}
        {clusterPhrases && (
        <button
          type="button"
          onClick={() => void handleRefreshAll()}
          disabled={refreshing || sorted.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          title="Fetch market data for THIS cluster\u2019s stale/missing keywords only (30-day policy; paid provider call)"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh volume
        </button>
        )}
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loadError ? (
          <p className="px-4 py-6 text-sm text-destructive">{loadError}</p>
        ) : sorted.length === 0 && !loading ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No keywords yet. Research a primary keyword above to seed the universe.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-2 py-2" aria-label="Expand" />
                <th className="px-2 py-2 font-semibold">Keyword</th>
                <th className="px-2 py-2 text-right font-semibold">Volume</th>
                <th className="px-2 py-2 font-semibold">Trend</th>
                <th className="px-2 py-2 font-semibold">Competition</th>
                <th className="px-2 py-2 text-right font-semibold">CPC</th>
                <th className="px-2 py-2 font-semibold">Trajectory</th>
                <th className="px-2 py-2 font-semibold">Intent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const market = usMarket(row);
                const expanded = expandedId === row.id;
                return (
                  <FragmentRow
                    key={row.id}
                    row={row}
                    market={market}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : row.id)}
                    loadEdges={loadEdges}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  market,
  expanded,
  onToggle,
  loadEdges,
}: {
  row: KeywordWithMarket;
  market: KeywordMarketRow | null;
  expanded: boolean;
  onToggle: () => void;
  loadEdges: (keywordId: string) => Promise<KeywordEdgeView[]>;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50"
        onClick={onToggle}
      >
        <td className="px-2 py-1.5 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </td>
        <td className="px-2 py-1.5 font-medium text-foreground">{row.phrase}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
          {formatSearchVolume(market?.search_volume)}
        </td>
        <td className="px-2 py-1.5">
          <KeywordTrendSparkline points={monthlyPoints(market)} />
        </td>
        <td className="px-2 py-1.5">
          <KeywordCompetitionBadge
            competition={market?.competition}
            competitionIndex={market?.competition_index}
          />
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
          {formatCpc(market?.cpc)}
        </td>
        <td className="px-2 py-1.5">
          <TrajectoryBadge value={market?.demand_trajectory ?? null} />
        </td>
        <td className="px-2 py-1.5">
          <KeywordIntentChip intentClass={row.intent_class} />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <KeywordDetail row={row} loadEdges={loadEdges} />
          </td>
        </tr>
      )}
    </>
  );
}
