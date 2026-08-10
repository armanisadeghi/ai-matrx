"use client";

/**
 * Keyword Research workbench — the user-facing surface over the seo keyword
 * plane. Top bar runs the LSI research agent for a primary keyword (server
 * pipeline: agent → artifact → ingestion → batched volume fetch); the table
 * below is a live explorer over seo.keyword + seo.keyword_market with
 * per-keyword relationship detail on expand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildKeywordResearchScope } from "@/features/marketing/lib/scopes/keyword-research-scope";
import { extractErrorMessage } from "@/utils/errors";

import { useKeywordResearch } from "../useKeywordResearch";
import {
  archiveKeywords,
  fetchResearchDiscoveredKeywordIds,
  restoreKeywords,
} from "../data/queries";
import KeywordResearchLauncher from "./KeywordResearchLauncher";
import {
  KEYWORD_CLUSTER_WRITE_MODES,
  isKeywordClusterWriteMode,
  normalizeMonthlySearches,
} from "../types";
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
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE,
} from "@/components/official/mobile-table/mobileTable";

/** The surface this workbench mounts — and whose write targets it services. */
const KEYWORD_RESEARCH_SURFACE = "matrx-user/keyword-research";

/** Wire value for the `keyword_selection` write target. */
export interface KeywordSelectionWrite {
  keyword_ids: string[];
  /** Omitted = "replace" — the selection becomes exactly `keyword_ids`. */
  mode?: "replace" | "add";
}

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
    clusterPrimaryKeyword,
    setCluster,
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
    reloadKeywords,
  } = useKeywordResearch();
  const openKeywordIntel = useOpenKeywordWindow();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [archiving, setArchiving] = useState(false);
  // The launcher's input, mirrored for the surface emitter only. A REF, not
  // state: getScope reads it at trigger time, so the agent still sees the live
  // value while a keystroke in the launcher never re-renders the table below.
  const stagedKeywordRef = useRef("");
  // Provenance: keyword ids with at least one live ai_research edge —
  // research-discovered vs hand-added. Null until the batched read lands.
  const [researchIds, setResearchIds] = useState<ReadonlySet<string> | null>(
    null,
  );

  const sorted = useMemo(() => {
    const cluster = clusterPhrases ? new Set(clusterPhrases) : null;
    return keywords
      .filter((row) => !cluster || cluster.has(row.normalized_phrase))
      .sort(
        (a, b) => (usMarket(b)?.search_volume ?? -1) - (usMarket(a)?.search_volume ?? -1),
      );
  }, [keywords, clusterPhrases]);

  const visibleIdsKey = useMemo(
    () => sorted.map((row) => row.id).join(","),
    [sorted],
  );

  useEffect(() => {
    const ids = visibleIdsKey ? visibleIdsKey.split(",") : [];
    if (ids.length === 0) {
      setResearchIds(new Set());
      return;
    }
    const controller = new AbortController();
    fetchResearchDiscoveredKeywordIds(ids, controller.signal)
      .then((discovered) => {
        if (!controller.signal.aborted) setResearchIds(discovered);
      })
      .catch((error) => {
        // Provenance is decoration — the list must not fail with it, but the
        // failure stays loud in the console (never a silent default).
        if (!controller.signal.aborted) {
          console.error("Keyword provenance lookup failed:", error);
          setResearchIds(null);
        }
      });
    return () => controller.abort();
  }, [visibleIdsKey]);

  // Selection survives only within the visible set — rows that scroll out of
  // the current search/cluster drop out so bulk archive never acts blind.
  useEffect(() => {
    const visible = new Set(visibleIdsKey ? visibleIdsKey.split(",") : []);
    setSelectedIds((current) => {
      const next = [...current].filter((id) => visible.has(id));
      return next.length === current.size ? current : new Set(next);
    });
  }, [visibleIdsKey]);

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((row) => selectedIds.has(row.id));

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(sorted.map((row) => row.id)) : new Set());
    },
    [sorted],
  );

  /** Archive library rows (bulk or single) with confirm + undo. */
  const archiveRows = useCallback(
    async (rows: { id: string; phrase: string }[]) => {
      if (rows.length === 0 || archiving) return;
      const label =
        rows.length === 1
          ? `“${rows[0].phrase}”`
          : `${rows.length} keywords`;
      const confirmed = await confirm({
        title: `Archive ${label} from the library?`,
        description:
          "Archived keywords disappear from every list and won't be re-added by research runs. You can undo from the toast, and typing the phrase anywhere restores it.",
        confirmLabel: "Archive",
        variant: "destructive",
      });
      if (!confirmed) return;
      setArchiving(true);
      const ids = rows.map((row) => row.id);
      try {
        const archived = await archiveKeywords(ids);
        setSelectedIds(new Set());
        reloadKeywords();
        toast.success(
          archived === 1
            ? `Archived ${label}`
            : `Archived ${archived} keywords`,
          {
            action: {
              label: "Undo",
              onClick: () => {
                void restoreKeywords(ids)
                  .then((restored) => {
                    reloadKeywords();
                    toast.success(`Restored ${restored} keyword${restored === 1 ? "" : "s"}`);
                  })
                  .catch((error) => {
                    toast.error("Could not restore keywords", {
                      description: extractErrorMessage(error),
                    });
                  });
              },
            },
          },
        );
      } catch (error) {
        toast.error("Could not archive keywords", {
          description: extractErrorMessage(error),
        });
      } finally {
        setArchiving(false);
      }
    },
    [archiving, reloadKeywords],
  );

  const selectedRows = useMemo(
    () =>
      sorted
        .filter((row) => selectedIds.has(row.id))
        .map((row) => ({ id: row.id, phrase: row.phrase })),
    [sorted, selectedIds],
  );

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

  // Surface emitter — built at trigger time from the live workbench state.
  const getScope = () =>
    buildKeywordResearchScope({
      search,
      visibleKeywords: sorted,
      run,
      clusterPhrases,
      clusterPrimaryKeyword,
      volumeStage,
      stagedKeyword: stagedKeywordRef.current,
    });

  // Surface write half — `keyword_selection` only. It moves the SAME selection
  // the row checkboxes move (setSelectedIds), so the toolbar's bulk actions
  // see it exactly as if the user had clicked; the user still presses them.
  // The seed-keyword target is serviced by the launcher, which owns the input.
  const getWriteHandlers = () => ({
    keyword_selection: (value: unknown) => {
      const write = value as Partial<KeywordSelectionWrite> | null;
      if (
        !write ||
        !Array.isArray(write.keyword_ids) ||
        write.keyword_ids.some((id) => typeof id !== "string")
      ) {
        // Loud by contract — the writeback seam turns throws into the error
        // envelope the agent reads back, never a silent no-op.
        throw new Error(
          'keyword_selection expects { keyword_ids: string[], mode?: "replace" | "add" }',
        );
      }
      const mode = write.mode ?? "replace";
      if (mode !== "replace" && mode !== "add") {
        throw new Error(
          `keyword_selection mode must be "replace" or "add" (got "${String(write.mode)}")`,
        );
      }
      if (run.status === "running") {
        // A finishing run re-scopes the explorer to its cluster, and the
        // visible-set effect below prunes the selection to what survives —
        // so a selection staged now would be silently thrown away.
        throw new Error(
          "A research run is still in flight — the explorer is about to re-scope to its cluster, so a selection made now would be discarded. Wait for the run to finish.",
        );
      }
      // Validate against what is ACTUALLY listed right now. All-or-nothing:
      // one unknown id rejects the whole write rather than silently selecting
      // a subset the user would have to audit.
      const visible = new Map(sorted.map((row) => [row.id, row.phrase]));
      const unknown = write.keyword_ids.filter((id) => !visible.has(id));
      if (unknown.length > 0) {
        throw new Error(
          `keyword_selection got ${unknown.length} id(s) that are not among the ${sorted.length} keyword rows currently visible: ${unknown.join(", ")}. Only ids from visible_keywords can be selected — nothing was selected.`,
        );
      }
      setSelectedIds((current) => {
        const next =
          mode === "add" ? new Set(current) : new Set<string>();
        for (const id of write.keyword_ids as string[]) next.add(id);
        return next;
      });
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={KEYWORD_RESEARCH_SURFACE}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      {/* Research launcher — the canonical shared component (also hosted by
          KeywordResearchWindow, opened from anywhere). */}
      <div className="border-b border-border px-4 py-3">
        <KeywordResearchLauncher
          run={run}
          runResearch={runResearch}
          writeSurfaceName={KEYWORD_RESEARCH_SURFACE}
        />
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
        {clusterPhrases && clusterPrimaryKeyword ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-2.5 py-1 text-xs text-foreground">
            Cluster: “{clusterPrimaryKeyword}” · {sorted.length}
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
        {selectedRows.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => void archiveRows(selectedRows)}
              disabled={archiving}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              title="Soft-archive the selected keywords from the library (undoable)"
            >
              {archiving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              Archive {selectedRows.length} selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear selection
            </button>
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
          <table className={cn("border-collapse text-sm", MOBILE_TABLE)}>
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-2 py-2">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) =>
                      toggleSelectAll(checked === true)
                    }
                    aria-label="Select all visible keywords"
                    className="h-3.5 w-3.5"
                  />
                </th>
                <th className="w-8 px-2 py-2" aria-label="Expand" />
                <th className="px-2 py-2 font-semibold">Keyword</th>
                <th className="px-2 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 text-right font-semibold">Volume</th>
                <th className="px-2 py-2 font-semibold">Trend</th>
                <th className="px-2 py-2 font-semibold">Competition</th>
                <th className="px-2 py-2 text-right font-semibold">CPC</th>
                <th className="px-2 py-2 font-semibold">Trajectory</th>
                <th className="px-2 py-2 font-semibold">Intent</th>
                <th className="w-10 px-2 py-2" aria-label="Actions" />
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
                    selected={selectedIds.has(row.id)}
                    onSelectedChange={(checked) =>
                      toggleSelected(row.id, checked)
                    }
                    researchDiscovered={
                      researchIds === null ? null : researchIds.has(row.id)
                    }
                    onArchive={() =>
                      void archiveRows([{ id: row.id, phrase: row.phrase }])
                    }
                    onOpenIntel={() => openKeywordIntel({ phrase: row.phrase })}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}

/** Source-of-record chip: research-discovered vs hand-added, derived from
 * live ai_research keyword edges. Null = provenance read not landed. */
function KeywordSourceChip({ discovered }: { discovered: boolean | null }) {
  if (discovered === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return discovered ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary">
      <BrainCircuit className="h-3 w-3" />
      Research
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Manual
    </span>
  );
}

function FragmentRow({
  row,
  market,
  expanded,
  onToggle,
  loadEdges,
  selected,
  onSelectedChange,
  researchDiscovered,
  onArchive,
  onOpenIntel,
}: {
  row: KeywordWithMarket;
  market: KeywordMarketRow | null;
  expanded: boolean;
  onToggle: () => void;
  loadEdges: (keywordId: string) => Promise<KeywordEdgeView[]>;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  researchDiscovered: boolean | null;
  onArchive: () => void;
  onOpenIntel: () => void;
}) {
  const menuConfig = (): ItemMenuConfig => ({
    header: { title: row.phrase },
    sections: [
      {
        items: [
          {
            id: "intel",
            label: "Keyword Intelligence",
            icon: BrainCircuit,
            onSelect: onOpenIntel,
          },
        ],
      },
      {
        items: [
          {
            id: "archive",
            label: "Archive from library",
            icon: Archive,
            tone: "destructive",
            onSelect: onArchive,
          },
        ],
      },
    ],
  });

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50"
        onClick={onToggle}
      >
        <td
          className="px-2 py-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            aria-label={`Select ${row.phrase}`}
            className="h-3.5 w-3.5"
          />
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </td>
        <td className="px-2 py-1.5 font-medium text-foreground">{row.phrase}</td>
        <td className="px-2 py-1.5">
          <KeywordSourceChip discovered={researchDiscovered} />
        </td>
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
        <td
          className="px-2 py-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <ItemMenu config={menuConfig}>
            <button
              type="button"
              aria-label={`Options for ${row.phrase}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </ItemMenu>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="p-0">
            <KeywordDetail row={row} loadEdges={loadEdges} />
          </td>
        </tr>
      )}
    </>
  );
}
