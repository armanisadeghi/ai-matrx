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
import Link from "next/link";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Loader2,
  MoreVertical,
  RefreshCw,
  TestTube2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableMobileCardControls,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Checkbox } from "@/components/ui/checkbox";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildKeywordResearchScope } from "@/features/marketing/lib/scopes/keyword-research-scope";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe2 } from "lucide-react";
import { useSiteOptions } from "@/features/marketing/data/hooks";

import { useKeywordResearch } from "../useKeywordResearch";
import {
  archiveKeywords,
  fetchResearchDiscoveredKeywordIds,
  getKeywordDossierCompleteness,
  restoreKeywords,
  type KeywordDossierCompleteness,
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
import { keywordLibraryCopyRow } from "../format";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";

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

/**
 * MSR-15 (Arman): the keyword row opens a six-tab dossier, "and some of
 * those tabs are completed, and some of them are not, yet our table doesn't
 * know that." One letter per tab that can genuinely be empty (Overview
 * always has the row itself, so it isn't included); green = that tab has
 * real data, dim = it doesn't yet. `null` completeness (still loading /
 * lookup failed) reads as dim rather than a false negative flash.
 */
const DOSSIER_TABS: {
  key: "pipeline" | "relationships" | "classification" | "site" | "visibility";
  short: string;
  hasData: string;
  noData: string;
}[] = [
  { key: "pipeline", short: "P", hasData: "Pipeline: saved research exists", noData: "Pipeline: no saved research yet" },
  { key: "relationships", short: "K", hasData: "Keywords: has relationship edges", noData: "Keywords: no relationship edges yet" },
  { key: "classification", short: "C", hasData: "Classification: intent is set", noData: "Classification: not classified yet" },
  { key: "site", short: "S", hasData: "Site performance: tracked on a site", noData: "Site performance: not tracked on any site" },
  { key: "visibility", short: "V", hasData: "Search visibility: has tracked rankings or SERP data", noData: "Search visibility: no rank tracking or SERP data yet" },
];

function DossierCompletenessCell({
  completeness,
  hasClassification,
}: {
  completeness: KeywordDossierCompleteness | null | undefined;
  hasClassification: boolean;
}) {
  const flags: Record<(typeof DOSSIER_TABS)[number]["key"], boolean> = {
    pipeline: completeness?.pipeline ?? false,
    relationships: completeness?.relationships ?? false,
    classification: hasClassification,
    site: completeness?.site ?? false,
    visibility: completeness?.visibility ?? false,
  };
  return (
    <div className="flex items-center gap-0.5">
      {DOSSIER_TABS.map(({ key, short, hasData, noData }) => (
        <span
          key={key}
          title={flags[key] ? hasData : noData}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-semibold",
            flags[key]
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground/40",
          )}
        >
          {short}
        </span>
      ))}
    </div>
  );
}

export default function KeywordResearchWorkbench() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  // `?keyword=` pre-fills the launcher — the return door from a saved report
  // ("Open workbench"). Read once; the launcher owns the input from then on.
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get("keyword") ?? undefined;

  // MSR-26 (Arman): "keyword research should go to a site" — the org-level
  // workbench requires picking a site before it will run research or show
  // that site's saved library. `?site=` mirrors the front-door pattern (the
  // page a user is looking at is the page they can send someone) but is NOT
  // auto-selected — an unpicked site is the honest starting state here,
  // since a wrong silent default would bind a paid run to the wrong site.
  const siteOptions = useSiteOptions();
  const requestedSiteId = searchParams.get("site");
  const [pickedSiteId, setPickedSiteId] = useState<string | null>(null);
  const selectedSiteId =
    pickedSiteId ??
    (requestedSiteId &&
    (siteOptions.data ?? []).some((site) => site.id === requestedSiteId)
      ? requestedSiteId
      : null);

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
    reloadKeywords,
  } = useKeywordResearch(selectedSiteId);
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
  const deepLinkSaved = useSavedKeywordResearch(
    initialKeyword ?? "",
    selectedSiteId,
  );
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

  // MSR-15: per-tab dossier completeness for the same visible id set, ONE
  // batched read (4 tables, never per-row) regardless of how many rows are
  // showing. Classification isn't looked up here — it's the row's own
  // `intent_class` column, already in `sorted`.
  const [completeness, setCompleteness] = useState<Map<
    string,
    KeywordDossierCompleteness
  > | null>(null);
  useEffect(() => {
    const ids = visibleIdsKey ? visibleIdsKey.split(",") : [];
    if (ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    const rowsForLookup = sorted
      .filter((row) => idSet.has(row.id))
      .map((row) => ({ id: row.id, phrase: row.phrase }));
    const controller = new AbortController();
    getKeywordDossierCompleteness(
      rowsForLookup,
      selectedSiteId,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setCompleteness(result);
      })
      .catch((error) => {
        // Same rule as provenance above: decoration, must not fail the
        // table, but never a silent swallow.
        if (!controller.signal.aborted) {
          console.error("Keyword dossier completeness lookup failed:", error);
          setCompleteness(null);
        }
      });
    return () => controller.abort();
    // `sorted` is memoized off `[keywords, clusterPhrases]`, the same inputs
    // `visibleIdsKey` derives from, so this only re-runs when the id set
    // actually changes.
  }, [visibleIdsKey, selectedSiteId, sorted]);

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
    {
      id: "dossier",
      accessorFn: (row) => {
        const entry = completeness?.get(row.id);
        const flags = [
          entry?.pipeline,
          entry?.relationships,
          Boolean(row.intent_class),
          entry?.site,
          entry?.visibility,
        ];
        return flags.filter(Boolean).length;
      },
      header: "Dossier",
      filter: "number",
      cell: (row) => (
        <DossierCompletenessCell
          completeness={completeness?.get(row.id) ?? null}
          hasClassification={Boolean(row.intent_class)}
        />
      ),
    },
  ];
  const keywordMenuConfig = (row: KeywordWithMarket): ItemMenuConfig => ({
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
              void archiveRows([{ id: row.id, phrase: row.phrase }]),
          },
        ],
      },
    ],
  });
  const renderMobileKeywordCard = (
    row: KeywordWithMarket,
    _index: number,
    controls: MatrxDataTableMobileCardControls,
  ) => {
    const market = usMarket(row);
    const discovered = researchIds === null ? null : researchIds.has(row.id);

    return (
      <article
        aria-label={`Keyword ${row.phrase}`}
        className="shrink-0 rounded-lg border border-border/80 bg-card p-3 shadow-sm"
      >
        <header className="flex items-start gap-1.5">
          <Checkbox
            checked={controls.selected}
            disabled={!controls.selectable}
            onCheckedChange={(checked) =>
              controls.onSelectedChange(checked === true)
            }
            aria-label={`Select keyword ${row.phrase}`}
            className="!h-11 !min-h-11 !w-11 !min-w-11 rounded-md border-border bg-muted/30 hover:bg-accent"
          />
          <button
            type="button"
            onClick={() => openKeywordIntel({ phrase: row.phrase })}
            className="min-w-0 flex-1 break-words rounded-md px-1 text-left text-sm font-semibold text-foreground [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.phrase}
          </button>
          <ItemMenu config={() => keywordMenuConfig(row)} align="end">
            <button
              type="button"
              aria-label={`Options for ${row.phrase}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </ItemMenu>
        </header>

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3">
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Source
            </dt>
            <dd className="mt-1">
              <KeywordSourceChip discovered={discovered} />
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Volume
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {formatSearchVolume(market?.search_volume)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Intent
            </dt>
            <dd className="mt-1">
              <KeywordIntentChip intentClass={row.intent_class} />
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Trajectory
            </dt>
            <dd className="mt-1">
              <TrajectoryBadge value={market?.demand_trajectory ?? null} />
            </dd>
          </div>
        </dl>

        <footer className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Dossier
          </span>
          <DossierCompletenessCell
            completeness={completeness?.get(row.id) ?? null}
            hasClassification={Boolean(row.intent_class)}
          />
        </footer>
      </article>
    );
  };
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
          {loading ? (
            <SuspenseLoader
              centered={false}
              size="xs"
              message="Loading keyword library…"
            />
          ) : (
            `${sorted.length} keywords in the library`
          )}
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
        {/* Site picker — MSR-26: research belongs to a site, never the org.
          Required before Research can run or the saved library can show
          anything; `?site=` mirrors the front-door deep-link pattern. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Select
            value={selectedSiteId ?? undefined}
            onValueChange={setPickedSiteId}
          >
            <SelectTrigger className="h-11 w-full text-base sm:w-64">
              <SelectValue placeholder="Select a site to research" />
            </SelectTrigger>
            <SelectContent>
              {(siteOptions.data ?? []).map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name ?? site.domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSuperAdmin ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <span className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TestTube2 className="h-4 w-4" />
                Non-writing render replay
              </span>
              <Link
                href="/shapes/keyword_relationship_research/stream"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Relationships
              </Link>
              <Link
                href="/shapes/keyword_classification_batch_v1/stream"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Classification
              </Link>
            </div>
          ) : null}
        </div>

        {/* Research launcher — the canonical shared component (also hosted by
          KeywordResearchWindow, opened from anywhere). */}
        <div className="border-b border-border px-4 py-3">
          <KeywordResearchLauncher
            run={run}
            runResearch={runResearch}
            siteId={selectedSiteId}
            // The site's saved artifacts — each one a report permalink and a
            // share point (the workbench's page-level share affordance). It
            // rides the launcher's own row; a row of its own was pure waste.
            actions={<SavedResearchLibrary siteId={selectedSiteId} />}
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
              urlState={{
                id: "keyword-research",
                selection: true,
                windowRow: false,
              }}
              data={sorted}
              columns={columns}
              getRowId={(row) => row.id}
              mobileCards={renderMobileKeywordCard}
              isLoading={loading}
              toolbar={toolbar}
              copy={{
                label: "Keyword",
                listLabel: clusterPrimaryKeyword
                  ? `Keywords in “${clusterPrimaryKeyword}”`
                  : "Keyword library (this view)",
                location: webLocation("Keyword Research — Library"),
                rowKind: "web-keyword",
                listKind: "web-keyword-library",
                humanRow: (row) =>
                  keywordLibraryCopyRow(
                    row,
                    researchIds === null ? null : researchIds.has(row.id),
                  ).human,
                agentRow: (row) =>
                  keywordLibraryCopyRow(
                    row,
                    researchIds === null ? null : researchIds.has(row.id),
                  ).data,
                rowAttributes: (row) => ({
                  keyword_id: row.id,
                  phrase: row.phrase,
                  source:
                    researchIds === null
                      ? "unknown"
                      : researchIds.has(row.id)
                        ? "research"
                        : "manual",
                }),
                listAttributes: (visible, all) => ({
                  visible_count: visible.length,
                  scoped_rows: all.length,
                  library_rows: keywords.length,
                  view: clusterPrimaryKeyword ? "cluster" : "library",
                  cluster: clusterPrimaryKeyword,
                  search: search || undefined,
                  volume_stage: volumeStage,
                }),
              }}
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
              // A keyword has ONE door: the canonical Keyword Intelligence
              // WindowPanel. The side drawer that used to duplicate part of it
              // is gone (side drawers are out — VISION §2.7b), and the table's
              // generic record window stays suppressed so the phrase and menu
              // action cannot disagree about the door.
              detail={{ enabled: false }}
              window={{ enabled: false }}
              onRowOpen={(row) => openKeywordIntel({ phrase: row.phrase })}
              rowActions={(row) => {
                return (
                  <ItemMenu config={() => keywordMenuConfig(row)}>
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
