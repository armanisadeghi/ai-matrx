"use client";

/**
 * Keyword Research workbench — the user-facing surface over the seo keyword
 * plane. Top bar runs the LSI research agent for a primary keyword (server
 * pipeline: agent → artifact → ingestion → batched volume fetch); the table
 * below is a live explorer over seo.keyword + seo.keyword_market with
 * per-keyword relationship detail on expand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Loader2,
  MoreVertical,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
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
import { useSavedKeywordResearch } from "../useSavedKeywordResearch";
import { keywordResearchPhrases } from "../data/artifact";
import SavedResearchLibrary from "./SavedResearchLibrary";
import { parseLibrarySearchWrite } from "../keyword-research-write";
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
  return normalizeMonthlySearches(market?.monthly_searches)
    .slice(0, 12)
    .reverse();
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
          setError(
            edgeError instanceof Error ? edgeError.message : String(edgeError),
          );
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
              <div
                key={`${point.year}-${point.month}`}
                className="flex flex-col items-center gap-1"
              >
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
          <p className="text-xs text-muted-foreground">
            No market data fetched yet.
          </p>
        )}
        {market && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Bids {market.low_top_of_page_bid ?? "—"}–
            {market.high_top_of_page_bid ?? "—"} · growth{" "}
            {market.growth_rate !== null
              ? `${(Number(market.growth_rate) * 100).toFixed(0)}%`
              : "—"}{" "}
            · fetched{" "}
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
  // `?keyword=` pre-fills the launcher — the return door from a saved report
  // ("Open workbench"). Read once; the launcher owns the input from then on.
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get("keyword") ?? undefined;
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
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [archiving, setArchiving] = useState(false);
  // The launcher's input, mirrored for the surface emitter only. A REF, not
  // state: getScope reads it at trigger time, so the agent still sees the live
  // value while a keystroke in the launcher never re-renders the table below.
  const stagedKeywordRef = useRef("");
  // The live cluster, for `cluster_scope`'s append branch. Refs for the same
  // reason the emitter uses one, plus a sharper one: the writeback seam
  // resolves every handler closure BEFORE the user confirms the first ask
  // dialog, so an append that read the cluster off its render closure could
  // extend a LIST THAT IS NO LONGER ON SCREEN — scoping the explorer to
  // phrases the user never saw. Deciding WHERE a value lands must read live.
  const clusterPhrasesRef = useRef(clusterPhrases);
  const clusterPrimaryKeywordRef = useRef(clusterPrimaryKeyword);
  useEffect(() => {
    clusterPhrasesRef.current = clusterPhrases;
    clusterPrimaryKeywordRef.current = clusterPrimaryKeyword;
  }, [clusterPhrases, clusterPrimaryKeyword]);
  /**
   * DEEP LINK (`?keyword=`) — never show a page full of unrelated keywords.
   * Arriving from a shared report with a phrase in hand, the explorer below
   * would otherwise still list the org's whole library, which reads as "here
   * is the research" when it is nothing of the sort. So:
   *   • saved research exists → scope the explorer to exactly that cluster;
   *   • it does not → filter the library to the phrase and say plainly that
   *     research has not been run for it (the pre-filled Research button
   *     above is the action). A run is paid, so we never fire it for them.
   * One shot: the moment the user touches the cluster or the search box, this
   * stops interfering.
   */
  const deepLinkSaved = useSavedKeywordResearch(initialKeyword ?? "");
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialKeyword || deepLinkAppliedRef.current) return;
    if (deepLinkSaved.isLoading) return;
    deepLinkAppliedRef.current = true;
    const artifact = deepLinkSaved.data?.artifact;
    if (artifact) {
      // setCluster normalizes the phrases itself.
      setCluster(artifact.primary_keyword, keywordResearchPhrases(artifact));
    } else {
      setSearch(initialKeyword);
    }
  }, [
    initialKeyword,
    deepLinkSaved.isLoading,
    deepLinkSaved.data,
    setCluster,
    setSearch,
  ]);
  const deepLinkNeedsResearch =
    Boolean(initialKeyword) &&
    !deepLinkSaved.isLoading &&
    !deepLinkSaved.data &&
    !clusterPhrases &&
    run.status === "idle";

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
        (a, b) =>
          (usMarket(b)?.search_volume ?? -1) -
          (usMarket(a)?.search_volume ?? -1),
      );
  }, [keywords, clusterPhrases]);

  const visibleIdsKey = useMemo(
    () => sorted.map((row) => row.id).join(","),
    [sorted],
  );
  const visibleSelectedIds = useMemo(() => {
    const visible = new Set(visibleIdsKey ? visibleIdsKey.split(",") : []);
    return [...selectedIds].filter((id) => visible.has(id));
  }, [selectedIds, visibleIdsKey]);

  useEffect(() => {
    const ids = visibleIdsKey ? visibleIdsKey.split(",") : [];
    if (ids.length === 0) {
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

  /** Archive library rows (bulk or single) with confirm + undo. */
  const archiveRows = useCallback(
    async (rows: { id: string; phrase: string }[]) => {
      if (rows.length === 0 || archiving) return;
      const label =
        rows.length === 1 ? `“${rows[0].phrase}”` : `${rows.length} keywords`;
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
                    toast.success(
                      `Restored ${restored} keyword${restored === 1 ? "" : "s"}`,
                    );
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

  const handleRefreshAll = useCallback(async () => {
    const phrases = sorted.map((row) => row.phrase);
    if (phrases.length === 0) return;
    setRefreshing(true);
    try {
      await refreshVolume(phrases.slice(0, 1000), false);
      toast.success("Volume refresh complete");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Volume refresh failed",
      );
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

  /**
   * The write targets this component owns (`research_input_keyword` is
   * registered by the launcher, which owns that input). Both land through the
   * SAME setters the user's own filter box and cluster chip drive — there is
   * no second write path into the explorer's scope.
   */
  const getWriteHandlers = () => ({
    library_search: (value: unknown) => {
      setSearch(parseLibrarySearchWrite(value));
    },
    cluster_scope: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          `cluster_scope expects an object { mode: ${KEYWORD_CLUSTER_WRITE_MODES.join(" | ")}, primary_keyword?: string, phrases: string[] }.`,
        );
      }
      const patch = value as Record<string, unknown>;
      const unknownKeys = Object.keys(patch).filter(
        (key) => !["mode", "primary_keyword", "phrases"].includes(key),
      );
      if (unknownKeys.length > 0) {
        throw new Error(
          `cluster_scope does not accept: ${unknownKeys.join(", ")}. Allowed keys: mode | primary_keyword | phrases.`,
        );
      }
      if (!isKeywordClusterWriteMode(patch.mode)) {
        throw new Error(
          `cluster_scope: mode must be one of ${KEYWORD_CLUSTER_WRITE_MODES.join(" | ")}.`,
        );
      }
      if (!Array.isArray(patch.phrases) || patch.phrases.length === 0) {
        throw new Error(
          "cluster_scope: phrases must be a non-empty array of keyword strings. To show the whole library again, the user clears the cluster chip — there is no write that clears it.",
        );
      }
      const phrases = patch.phrases.map((entry, index) => {
        if (typeof entry !== "string" || !entry.trim()) {
          throw new Error(
            `cluster_scope: phrases[${index}] must be a non-empty string, got ${typeof entry}.`,
          );
        }
        return entry;
      });
      if (
        patch.primary_keyword !== undefined &&
        (typeof patch.primary_keyword !== "string" ||
          !patch.primary_keyword.trim())
      ) {
        throw new Error(
          "cluster_scope: primary_keyword must be a non-empty string when provided — it names the cluster chip.",
        );
      }
      const label = (patch.primary_keyword as string | undefined)?.trim();
      // Appending onto an existing cluster inherits its name; every other
      // case is naming a NEW cluster, so the label is required.
      const appendTo =
        patch.mode === "append" ? clusterPhrasesRef.current : null;
      const nextLabel =
        label ?? (appendTo ? clusterPrimaryKeywordRef.current : null);
      if (!nextLabel) {
        throw new Error(
          "cluster_scope: primary_keyword is required — there is no cluster on screen to append to, so this write names a new one.",
        );
      }
      setSelectedIds(new Set());
      setCluster(nextLabel, [...(appendTo ?? []), ...phrases]);
    },
  });
  const columns: MatrxColumnDef<KeywordWithMarket>[] = [
    {
      id: "phrase",
      accessorKey: "phrase",
      header: "Keyword",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <button
          type="button"
          className="font-medium text-foreground hover:underline"
          onClick={() => openKeywordIntel({ phrase: row.phrase })}
        >
          {row.phrase}
        </button>
      ),
    },
    {
      id: "source",
      accessorFn: (row) =>
        researchIds === null
          ? "unknown"
          : researchIds.has(row.id)
            ? "research"
            : "manual",
      header: "Source",
      filter: "select",
      cell: (row) => (
        <KeywordSourceChip
          discovered={researchIds === null ? null : researchIds.has(row.id)}
        />
      ),
    },
    {
      id: "volume",
      accessorFn: (row) => usMarket(row)?.search_volume ?? null,
      header: "Volume",
      filter: "number",
      align: "right",
      cell: (row) => formatSearchVolume(usMarket(row)?.search_volume),
    },
    {
      id: "trend",
      accessorFn: (row) => usMarket(row)?.growth_rate ?? null,
      header: "Trend",
      filter: "number",
      cell: (row) => (
        <KeywordTrendSparkline points={monthlyPoints(usMarket(row))} />
      ),
    },
    {
      id: "competition",
      accessorFn: (row) => usMarket(row)?.competition_index ?? null,
      header: "Competition",
      filter: "number",
      cell: (row) => {
        const market = usMarket(row);
        return (
          <KeywordCompetitionBadge
            competition={market?.competition}
            competitionIndex={market?.competition_index}
          />
        );
      },
    },
    {
      id: "cpc",
      accessorFn: (row) => usMarket(row)?.cpc ?? null,
      header: "CPC",
      filter: "number",
      align: "right",
      cell: (row) => formatCpc(usMarket(row)?.cpc),
    },
    {
      id: "trajectory",
      accessorFn: (row) => usMarket(row)?.demand_trajectory ?? null,
      header: "Trajectory",
      filter: "select",
      cell: (row) => (
        <TrajectoryBadge value={usMarket(row)?.demand_trajectory ?? null} />
      ),
    },
    {
      id: "intent_class",
      accessorKey: "intent_class",
      header: "Intent",
      filter: "select",
      cell: (row) => <KeywordIntentChip intentClass={row.intent_class} />,
    },
  ];
  const toolbar = {
    searchValue: search,
    onSearchChange: (value: string) => {
      setSelectedIds(new Set());
      setSearch(value);
    },
    searchPlaceholder: "Filter keywords",
    leading:
      clusterPhrases && clusterPrimaryKeyword ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-2.5 py-1 text-xs text-foreground">
          Cluster: “{clusterPrimaryKeyword}” · {sorted.length}
          <button
            type="button"
            onClick={() => {
              setSelectedIds(new Set());
              clearCluster();
            }}
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
      ),
    actions: (
      <div className="flex items-center gap-2">
        {volumeStage ? (
          <span className="text-xs text-muted-foreground">{volumeStage}</span>
        ) : null}
        {clusterPhrases ? (
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshing || sorted.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            title="Fetch market data for this cluster’s stale or missing keywords"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh volume
          </button>
        ) : null}
      </div>
    ),
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/keyword-research"
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
            // The org's saved artifacts — each one a report permalink and a
            // share point (the workbench's page-level share affordance). It
            // rides the launcher's own row; a row of its own was pure waste.
            actions={<SavedResearchLibrary />}
            // Deep link from a report ("Open workbench") pre-fills the input;
            // it never auto-runs — a run spends a paid provider request.
            initialKeyword={initialKeyword}
            // This page mounts the surface, so the launcher services its
            // `research_input_keyword` target here (the window mount does not).
            writeTargetSurfaceName="matrx-user/keyword-research"
            // THE FLOATING LAW: the keyword table lives directly under this bar,
            // so the run streams in the floating LiveRunWindow. An inline feed
            // pushed the table the user is reading down the page on every run.
            liveFeed="floating"
            onKeywordChange={(keyword) => {
              stagedKeywordRef.current = keyword;
            }}
          />
          {deepLinkNeedsResearch ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No saved research for{" "}
              <span className="font-medium text-foreground">
                “{initialKeyword}”
              </span>{" "}
              yet — the list below is filtered to matching library keywords, not
              its research. Press{" "}
              <span className="font-medium text-foreground">Research</span> to
              map its parents, children, and related terms.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loadError ? (
            <p className="px-4 py-6 text-sm text-destructive">{loadError}</p>
          ) : (
            <MatrxDataTable
              urlState={{ id: "keyword-research", selection: true }}
              data={sorted}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={loading}
              toolbar={toolbar}
              pageSize={25}
              pageSizeOptions={[10, 25, 50, 100]}
              selection={{
                selectedIds: visibleSelectedIds,
                onSelectedIdsChange: (ids) => setSelectedIds(new Set(ids)),
                noun: "keyword",
                actions: (selected) => (
                  <button
                    type="button"
                    onClick={() =>
                      void archiveRows(
                        selected.map((row) => ({
                          id: row.id,
                          phrase: row.phrase,
                        })),
                      )
                    }
                    disabled={archiving}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {archiving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    Archive selected
                  </button>
                ),
              }}
              detail={{
                title: (row) => row.phrase,
                render: (row) => (
                  <KeywordDetail row={row} loadEdges={loadEdges} />
                ),
              }}
              rowActions={(row) => {
                const menuConfig = (): ItemMenuConfig => ({
                  header: { title: row.phrase },
                  sections: [
                    {
                      items: [
                        {
                          id: "intel",
                          label: "Keyword Intelligence",
                          icon: BrainCircuit,
                          onSelect: () => {
                            openKeywordIntel({ phrase: row.phrase });
                          },
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
                          onSelect: () =>
                            void archiveRows([
                              { id: row.id, phrase: row.phrase },
                            ]),
                        },
                      ],
                    },
                  ],
                });
                return (
                  <ItemMenu config={menuConfig}>
                    <button
                      type="button"
                      aria-label={`Options for ${row.phrase}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </ItemMenu>
                );
              }}
              emptyState={{
                title: "No keywords yet",
                description:
                  "Research a primary keyword above to seed the universe.",
              }}
            />
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
