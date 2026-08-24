"use client";

/**
 * KeywordIntelPanel — the full keyword intelligence surface, rendered inside
 * the `keywordWindow` window panel (and reusable anywhere a full keyword
 * dossier is needed).
 *
 * Tab contract:
 * - Overview       — universal market metrics + classification (always).
 * - Relationships  — keyword_edge graph rows; partner click navigates the
 *                    panel to that keyword (always).
 * - Site           — this site's stored GSC/Bing performance + workflow state
 *                    (needs a site binding).
 * - Rankings       — tracked rank targets, live "check now", track-this-keyword
 *                    (needs a site binding).
 * - SERP           — the stored SERP landscape rendered as a Google-style
 *                    results page with the site's own result highlighted
 *                    (needs a site binding + at least one rank check).
 * - Research       — the full keyword-research pipeline (agent → relationships
 *                    → volume → classification), streamed live (always).
 *
 * Data rules: reads are Supabase-direct via ./hooks; compute (volume refresh,
 * rank check, research) streams from aidream. Nothing here forks a query the
 * keyword-research feature already owns.
 */

import {
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Database,
  GitBranch,
  Globe,
  Loader2,
  SearchCheck,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import {
  BING_PROVIDER,
  GOOGLE_SEARCH_CONSOLE_PROVIDER,
} from "@/features/marketing/lib/provider-names";
import {
  archiveKeywords,
  restoreKeywords,
} from "@/features/marketing/seo/keyword-research/data/queries";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import {
  CondensedFieldGrid,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  formatCpc,
  formatSearchVolume,
  KeywordCompetitionBadge,
  KeywordTrendBadge,
  KeywordTrendSparkline,
  monthlySearchTrend,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { normalizeMonthlySearches } from "@/features/marketing/seo/keyword-research/types";
import type { KeywordWithMarket } from "@/features/marketing/seo/keyword-research/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { humanLines, webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { isJsonObject } from "@/types/json";
import KeywordSerpIntentAnalysisBlock from "@/components/mardown-display/blocks/keyword-research/KeywordSerpIntentAnalysisBlock";

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createKeywordIntelligenceScope,
  keywordIntelligenceManifest,
} from "@/features/surfaces/manifests/keyword-intelligence.manifest";
import { KeywordInput } from "./KeywordInput";
import { KeywordMeaningPanel } from "./KeywordMeaningPanel";
import {
  keywordMeaningLines,
  keywordMeaningPayload,
  useKeywordMeaning,
} from "./keyword-meaning";
import {
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
  type KeywordAssignSurfaces,
} from "./keyword-actions";
import { KeywordRankingsTab, KeywordSerpTab } from "./KeywordRankTabs";
import {
  KeywordResearchTab,
  type KeywordResearchPanelState,
} from "./KeywordResearchTab";
import SavedResearchFeed from "@/features/marketing/seo/keyword-research/components/SavedResearchFeed";
import { useSavedKeywordResearch } from "@/features/marketing/seo/keyword-research/useSavedKeywordResearch";
import { CollectionStatusPanel } from "@/features/marketing/components/settings/CollectionStatusPanel";
import { useSite } from "@/features/marketing/data/hooks";
import { useCollectionStatus } from "@/features/marketing/data/collection-status";
import { buildKeywordBrief } from "./keyword-brief";
import { normalizeKeywordPhrase } from "./data";
import {
  useKeywordEdges,
  useKeywordSitePerformance,
  useKeywordVolumeRefresh,
  useResolvedKeyword,
} from "./hooks";
import type { KeywordIntelTab, KeywordScope } from "./types";

const TAB_LABELS: Record<KeywordIntelTab, string> = {
  overview: "Summary",
  research: "Pipeline",
  relationships: "Keywords",
  classification: "Classification",
  site: "Site performance",
  visibility: "Search visibility",
};

const EMPTY_RESEARCH_STATE: KeywordResearchPanelState = {
  status: "idle",
  stage: null,
  error: null,
  hasSavedResearch: false,
  savedAt: null,
};

/** The window IS a surface — byte-identical to the manifest + ui_surface row. */
const KEYWORD_INTELLIGENCE_SURFACE_NAME =
  keywordIntelligenceManifest.surfaceName;

/**
 * 🚨 THE 13 MIRROR FACETS ARE GONE FROM THIS DOSSIER (2026-08-24).
 *
 * `seo.keyword`'s intent_class / funnel_stage / specificity / query_form /
 * local_intent / urgency / audience_type / brand_presence / comparison_intent /
 * price_sensitivity / transaction_direction / fulfillment_mode /
 * compliance_framing columns are a LEGACY MIRROR of the fact store
 * (`seo.keyword_facet`). The window used to render all 13 as its
 * "Classification" card while showing nothing at all from the system that
 * replaced them — so the one dossier twelve surfaces open told every curious
 * user the old story.
 *
 * The meaning half of this dossier is now `./KeywordMeaningPanel`, reading the
 * canonical RPCs (`gsc_keyword_value_for`, `gsc_keyword_topics_for`,
 * `gsc_keyword_stamps_for`). Do not reintroduce a facet-column reader here.
 */

function savedSerpIntentAnalysis(
  keyword: KeywordWithMarket | null,
): Record<string, unknown> | null {
  if (!keyword || !isJsonObject(keyword.classification_detail)) return null;
  const analysis = keyword.classification_detail.serp_intent_analysis;
  if (
    !isJsonObject(analysis) ||
    analysis.__kind !== "keyword_serp_intent_analysis_v1"
  ) {
    return null;
  }
  return { ...analysis, isComplete: true };
}

export interface KeywordIntelPanelProps {
  phrase: string;
  activeTab: KeywordIntelTab;
  scope?: KeywordScope;
  onPhraseChange: (phrase: string) => void;
  onTabChange: (tab: KeywordIntelTab) => void;
  /** Relationship navigation also records the phrase in the window history. */
  onRelatedKeywordNavigate: (phrase: string) => void;
  /** Running research commits a manually entered phrase to window history. */
  onResearchStart: (phrase: string) => void;
}

export function KeywordIntelPanel({
  phrase,
  activeTab,
  scope,
  onPhraseChange,
  onTabChange,
  onRelatedKeywordNavigate,
  onResearchStart,
}: KeywordIntelPanelProps) {
  const resolved = useResolvedKeyword(phrase);
  const keyword = resolved.data?.keyword ?? null;
  const market = resolved.data?.market ?? null;
  const sitePerf = useKeywordSitePerformance(scope?.siteId, keyword?.id);
  // Lifted from the Relationships tab so the surface scope always carries the
  // edges once loaded (the tab consumes the same query result as a prop).
  const edges = useKeywordEdges(keyword?.id);
  const savedResearch = useSavedKeywordResearch(phrase, scope?.organizationId, {
    debounceMs: 250,
  });
  const volumeRefresh = useKeywordVolumeRefresh(scope?.organizationId);
  const siteId = scope?.siteId;
  const organizationId = scope?.organizationId;
  const serpIntentAnalysis = savedSerpIntentAnalysis(keyword);
  const [researchState, setResearchState] =
    useState<KeywordResearchPanelState>(EMPTY_RESEARCH_STATE);
  const [visibilityView, setVisibilityView] = useState<"positions" | "serp">(
    "positions",
  );
  const firstRunRoutedRef = useRef("");

  useEffect(() => {
    const normalized = normalizeKeywordPhrase(phrase);
    if (!normalized || savedResearch.isLoading || savedResearch.isError) return;
    if (savedResearch.data || activeTab !== "overview") return;
    if (firstRunRoutedRef.current === normalized) return;
    firstRunRoutedRef.current = normalized;
    onTabChange("research");
  }, [
    phrase,
    activeTab,
    savedResearch.data,
    savedResearch.isLoading,
    savedResearch.isError,
    onTabChange,
  ]);

  const handleResearchStateChange = useCallback(
    (next: KeywordResearchPanelState) => setResearchState(next),
    [],
  );

  // THE MEANING HALF. Read here (not only inside the panel) so the surface
  // scope, the Copy-for-AI envelope and the right-click menu all carry the
  // same class/service/score/level the human is looking at.
  const meaning = useKeywordMeaning(siteId, keyword?.id ?? null);
  const meaningPayload = keywordMeaningPayload(meaning.data);

  // The SAME assignment surfaces the right-click menu opens — one set, shared
  // between the menu items and the dossier's own buttons.
  const surfaces = useKeywordAssignSurfaces({ siteId: siteId ?? "" });
  const keywordSection = useKeywordMenuSection({
    siteId: siteId ?? "",
    brandId: scope?.brandId ?? null,
    organizationId: scope?.organizationId ?? null,
    surfaces,
    // The dossier IS the Keyword Intelligence window — a door back to itself
    // would be the dead end this campaign exists to remove.
    includeIntelDoor: false,
    getRow: () =>
      keyword
        ? {
            phrase: keyword.phrase,
            keywordId: keyword.id,
            currentLevel: meaning.data.value?.value_band ?? null,
            levelIsRuling: meaning.data.value?.value_source === "override",
          }
        : { phrase, keywordId: null },
  });

  const brief = buildKeywordBrief({
    phrase,
    keyword,
    market,
    sitePerformance: sitePerf.data,
    meaning: meaningPayload,
    meaningLines: keywordMeaningLines(meaning.data),
  });

  // Live surface scope — built at agent-launch/menu-open time from the
  // already-loaded query data (never fetches). The window IS a surface:
  // user-created agents bound to `matrx-user/keyword-intelligence` receive
  // the full dossier, condensed in `keyword_brief`.
  const getScope = () =>
    createKeywordIntelligenceScope({
      phrase,
      keyword_known: Boolean(keyword),
      keyword_id: keyword?.id,
      keyword_language: keyword?.language,
      keyword_brief: phrase.trim() ? brief.data : undefined,
      keyword_market: keyword?.keyword_market?.length
        ? keyword.keyword_market.map((row) => ({ ...row }))
        : undefined,
      keyword_meaning: meaningPayload ?? undefined,
      keyword_relationships: edges.data
        ? edges.data.map((edge) => ({ ...edge }))
        : undefined,
      site_id: scope?.siteId ?? undefined,
      page_id: scope?.pageId ?? undefined,
      brand_id: scope?.brandId ?? undefined,
      site_keyword_performance: sitePerf.data?.length
        ? sitePerf.data.map((row) => ({ ...row }))
        : undefined,
    });
  const copy = webCopy({
    kind: "seo-keyword-brief",
    label: `Keyword — ${phrase || "none"}`,
    description:
      "The condensed keyword dossier: market metrics, this site's class/service/score/level with its receipt, and site performance.",
    surface: "Keyword Intelligence window",
    data: brief.data,
    lines: brief.lines,
  });

  const refreshVolume = async (force: boolean) => {
    const ok = await volumeRefresh.run(phrase, force);
    if (ok) {
      toast.success("Keyword market data updated");
      void resolved.refetch();
    } else if (volumeRefresh.state.error) {
      toast.error("Volume refresh failed", {
        description: volumeRefresh.state.error,
      });
    }
  };

  const navigateToKeyword = (nextPhrase: string) => {
    onRelatedKeywordNavigate(nextPhrase);
  };

  /** Soft-archive this library keyword (seo.fn_archive_keywords, undoable).
   * Keeps autosaved research from becoming clutter — the management half of
   * the "autosave everything" ruling. */
  const archiveKeyword = async () => {
    if (!keyword) return;
    const keywordId = keyword.id;
    const confirmed = await confirm({
      title: `Archive “${keyword.phrase}” from the keyword library?`,
      description:
        "Archived keywords disappear from every keyword list and research runs won't re-add them. Undo from the toast, or restore by typing the phrase in any keyword input.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await archiveKeywords([keywordId]);
      void resolved.refetch();
      toast.success(`Archived “${keyword.phrase}” from the library`, {
        action: {
          label: "Undo",
          onClick: () => {
            void restoreKeywords([keywordId])
              .then(() => {
                void resolved.refetch();
                toast.success(`Restored “${keyword.phrase}”`);
              })
              .catch((error) => {
                toast.error("Could not restore the keyword", {
                  description: extractErrorMessage(error),
                });
              });
          },
        },
      });
    } catch (error) {
      toast.error("Could not archive the keyword", {
        description: extractErrorMessage(error),
      });
    }
  };

  // Write half (`open_keyword`): the panel owns the navigation callbacks, so
  // it services the target on its own provider. Lands through the SAME
  // related-keyword path the Relationships tab uses (records window history,
  // opens Overview) — never a parallel navigation.
  const getWriteHandlers = () => ({
    open_keyword: (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("open_keyword expects { phrase: string }.");
      }
      const next = (value as { phrase?: unknown }).phrase;
      if (typeof next !== "string" || !next.trim()) {
        throw new Error("open_keyword: phrase must be a non-empty string.");
      }
      onRelatedKeywordNavigate(next.trim());
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={KEYWORD_INTELLIGENCE_SURFACE_NAME}
      isEditable={false}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      {/*
        🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without this,
        a right-click inside the floating dossier was answered by whatever page
        happened to be underneath — handing the user THAT page's surface, values
        and agents, silently wrong and looking like it worked. Verified live on
        2026-08-24: right-clicking here produced nothing at all, so the dossier
        could not even be copied for an AI.
      */}
      <NonEditableContextMenu
        sourceFeature="marketing"
        surfaceName={KEYWORD_INTELLIGENCE_SURFACE_NAME}
        contentSource={{ type: "raw" }}
        {...(keyword
          ? {
              entity: {
                type: "seo_keyword" as const,
                id: keyword.id,
                title: keyword.phrase,
              },
            }
          : {})}
        // The surface's declared values ride along, so a shortcut or agent
        // launched from the menu sees exactly what the window's
        // SurfaceRuntimeProvider emits (the value-mapping guard screams
        // otherwise, and it is right to).
        contextData={{
          ...getScope(),
          content: humanLines(brief.lines),
          context: brief.data,
        }}
        extraSections={siteId ? [keywordSection] : []}
      >
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Header: phrase + condensed data + actions ─────────────────────── */}
        <div className="shrink-0 border-b border-border px-3 pb-2 pt-3">
          <div className="flex items-start gap-2">
            <KeywordInput
              value={phrase}
              onChange={onPhraseChange}
              scope={scope}
              showIntelButton={false}
              placeholder="Type any keyword…"
              className="min-w-0 flex-1"
            />
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              <CopyButtons size="icon" {...copy} />
              <button
                type="button"
                onClick={() => void refreshVolume(Boolean(market))}
                disabled={
                  volumeRefresh.state.status === "running" || !phrase.trim()
                }
                aria-label="Fetch fresh market data"
                title={
                  market
                    ? "Force-refresh provider market data for this keyword"
                    : "Fetch provider market data for this keyword"
                }
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {volumeRefresh.state.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void archiveKeyword()}
                disabled={!keyword}
                aria-label="Archive this keyword from the library"
                title={
                  keyword
                    ? "Archive this keyword from the library (undoable)"
                    : "Not a library keyword yet — nothing to archive"
                }
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </div>
          {volumeRefresh.state.status === "running" ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {volumeRefresh.state.stage ?? "Fetching market data…"}
            </p>
          ) : null}
        </div>

        {phrase.trim() ? (
          <KeywordPipelineStrip
            activeTab={activeTab}
            researchState={researchState}
            hasSavedResearch={Boolean(savedResearch.data)}
            hasRelationships={Boolean(edges.data?.length)}
            hasMarket={Boolean(market)}
            isClassified={Boolean(keyword?.intent_class)}
            hasSite={Boolean(siteId)}
            onSelect={onTabChange}
          />
        ) : null}

        {/* ── Tab strip ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {(Object.keys(TAB_LABELS) as KeywordIntelTab[]).map((tab) => {
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {/* ── Tab body ──────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!phrase.trim() ? (
            <EmptyPanelState />
          ) : (
            <>
              {resolved.isError ? (
                <ReadFailure
                  title="Keyword data could not be loaded"
                  error={resolved.error}
                  onRetry={() => void resolved.refetch()}
                />
              ) : null}

              {activeTab === "overview" ? (
                <OverviewTab
                  phrase={phrase}
                  keyword={keyword}
                  siteId={siteId ?? null}
                  brandId={scope?.brandId ?? null}
                  surfaces={surfaces}
                  marketLoading={resolved.isLoading}
                  onFetchMarket={() => void refreshVolume(false)}
                  fetching={volumeRefresh.state.status === "running"}
                  researchState={researchState}
                  onOpenPipeline={() => onTabChange("research")}
                />
              ) : null}

              <div className={activeTab === "research" ? "block" : "hidden"}>
                <KeywordResearchTab
                  key={normalizeKeywordPhrase(phrase)}
                  phrase={phrase}
                  organizationId={scope?.organizationId}
                  pageId={scope?.pageId}
                  onResearchStart={onResearchStart}
                  onKeywordNavigate={navigateToKeyword}
                  onRunStateChange={handleResearchStateChange}
                />
              </div>

              {activeTab === "relationships" ? (
                savedResearch.data ? (
                  <SavedResearchFeed
                    artifact={savedResearch.data.artifact}
                    instanceId={savedResearch.data.id}
                    sections={["metrics"]}
                    onKeywordNavigate={navigateToKeyword}
                  />
                ) : (
                  <RelationshipsTab
                    edges={edges}
                    known={Boolean(keyword)}
                    onNavigate={navigateToKeyword}
                    onOpenPipeline={() => onTabChange("research")}
                  />
                )
              ) : null}

              {activeTab === "classification" ? (
                savedResearch.data ? (
                  <div className="grid gap-5">
                    <SavedResearchFeed
                      artifact={savedResearch.data.artifact}
                      instanceId={savedResearch.data.id}
                      sections={["classification"]}
                      onKeywordNavigate={navigateToKeyword}
                    />
                    {serpIntentAnalysis ? (
                      <section className="grid gap-2 border-t border-border pt-4">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Enhanced with result-page evidence
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            This review is stored separately. It never silently
                            changes the intrinsic classification above.
                          </p>
                        </div>
                        <KeywordSerpIntentAnalysisBlock
                          serverData={serpIntentAnalysis}
                        />
                      </section>
                    ) : (
                      <section className="flex items-center justify-between gap-3 border-t border-border pt-4">
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            Search-informed enhancement is optional
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Collect Google and Brave result pages, then compare
                            observed behavior with this baseline.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0"
                          onClick={() => {
                            setVisibilityView("serp");
                            onTabChange("visibility");
                          }}
                        >
                          Open result pages
                        </Button>
                      </section>
                    )}
                  </div>
                ) : (
                  <UnavailableUntilResearch
                    title="Classification starts with the research pipeline"
                    description="Run the baseline once to classify the complete keyword set."
                    onOpenPipeline={() => onTabChange("research")}
                  />
                )
              ) : null}

              {activeTab === "site" ? (
                <SiteTab
                  siteId={scope?.siteId ?? null}
                  brandId={scope?.brandId ?? null}
                  keywordId={keyword?.id ?? null}
                  known={Boolean(keyword)}
                />
              ) : null}

              {activeTab === "visibility" ? (
                <SearchVisibilityTab
                  siteId={siteId ?? null}
                  organizationId={organizationId ?? null}
                  phrase={phrase}
                  keywordId={keyword?.id ?? null}
                  view={visibilityView}
                  onViewChange={setVisibilityView}
                  hasSerpIntentAnalysis={Boolean(serpIntentAnalysis)}
                  onAnalysisComplete={() => onTabChange("classification")}
                />
              ) : null}
            </>
          )}
        </div>

        {/* The shared assignment surfaces the menu and the dossier both open.
            Never inside a Dialog — see `useKeywordAssignSurfaces`. */}
        {surfaces.isOpen ? (
          <div className="shrink-0 border-t border-border p-2">
            {surfaces.node}
          </div>
        ) : null}
      </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

function EmptyPanelState() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
      <Database className="h-6 w-6 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        Type a keyword above to load everything the platform knows about it.
      </p>
    </div>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────────── */

function OverviewTab({
  phrase,
  keyword,
  siteId,
  brandId,
  surfaces,
  marketLoading,
  onFetchMarket,
  fetching,
  researchState,
  onOpenPipeline,
}: {
  phrase: string;
  keyword: KeywordWithMarket | null;
  siteId: string | null;
  brandId: string | null;
  surfaces: KeywordAssignSurfaces;
  marketLoading: boolean;
  onFetchMarket: () => void;
  fetching: boolean;
  researchState: KeywordResearchPanelState;
  onOpenPipeline: () => void;
}) {
  if (marketLoading) {
    return (
      <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (!keyword) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
        <Globe className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-md text-xs text-muted-foreground">
          <span className="font-medium text-foreground">“{phrase}”</span> is
          new. Start the full pipeline to discover its keyword set, collect real
          market facts, and classify intent before evaluating it.
        </p>
        <Button size="sm" className="h-8" onClick={onOpenPipeline}>
          <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
          Open research pipeline
        </Button>
      </div>
    );
  }

  const markets = keyword.keyword_market ?? [];

  return (
    <div className="grid gap-3">
      {researchState.status === "running" ? (
        <button
          type="button"
          onClick={onOpenPipeline}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-left"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">
              The dossier is being built now
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {researchState.stage ?? "Working through the research pipeline"}
            </span>
          </span>
        </button>
      ) : !researchState.hasSavedResearch ? (
        <button
          type="button"
          onClick={onOpenPipeline}
          className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-left"
        >
          <span>
            <span className="block text-xs font-medium text-foreground">
              Baseline research has not been completed
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Run it once before treating this summary as complete.
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-primary">
            Start
          </span>
        </button>
      ) : null}
      {markets.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            In the library, but no provider market data fetched yet.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={fetching}
            onClick={onFetchMarket}
          >
            {fetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Fetch market data
          </Button>
        </div>
      ) : (
        markets.map((market) => {
          const monthly = normalizeMonthlySearches(market.monthly_searches);
          const trend = monthlySearchTrend(monthly);
          return (
            <div
              key={market.id}
              className="rounded-lg border border-border p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Market{" "}
                  {market.location_code === 2840 ? "US" : market.location_code}
                </span>
                <KeywordTrendBadge percent={trend} />
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {market.source_provider ?? "provider"} ·{" "}
                  {market.metrics_fetched_at
                    ? `fetched ${formatDate(market.metrics_fetched_at)}`
                    : "never fetched"}
                </span>
              </div>
              {monthly.length >= 2 ? (
                <KeywordTrendSparkline
                  points={monthly}
                  className="mb-2 h-12"
                  barClassName="w-3"
                />
              ) : null}
              <CondensedFieldGrid
                fields={[
                  {
                    label: "Search volume",
                    value: `${formatSearchVolume(market.search_volume)}/mo`,
                  },
                  { label: "CPC", value: formatCpc(market.cpc) },
                  {
                    label: "Competition",
                    value: (
                      <KeywordCompetitionBadge
                        competition={market.competition}
                        competitionIndex={market.competition_index}
                      />
                    ),
                  },
                  {
                    label: "Demand trajectory",
                    value: market.demand_trajectory ?? "—",
                  },
                  {
                    label: "Seasonality index",
                    value:
                      market.seasonality_index === null
                        ? "—"
                        : Number(market.seasonality_index).toFixed(2),
                  },
                  {
                    label: "Top-of-page bid",
                    value:
                      market.low_top_of_page_bid === null &&
                      market.high_top_of_page_bid === null
                        ? "—"
                        : `${formatCpc(market.low_top_of_page_bid)} – ${formatCpc(market.high_top_of_page_bid)}`,
                  },
                ]}
              />
            </div>
          );
        })
      )}

      {/* THE MEANING HALF — Class, Offering, Score, Level, the receipt and
          every dimension stamp, all settable in place. This replaced the 13
          retired mirror facets on 2026-08-24; see the note at the top of this
          file. Without a site there is nothing to say: meaning is per-site. */}
      {siteId ? (
        <KeywordMeaningPanel
          siteId={siteId}
          brandId={brandId}
          keywordId={keyword.id}
          phrase={keyword.phrase}
          surfaces={surfaces}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium text-foreground">
            Class, offering and value are decided per website
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            This dossier is currently global. Open it from a website to see —
            and set — what that site says this keyword is.
          </p>
        </div>
      )}

      <CondensedFieldGrid
        fields={[
          { label: "Phrase", value: keyword.phrase, span: 2 },
          { label: "Language", value: keyword.language },
          { label: "In library since", value: formatDate(keyword.created_at) },
        ]}
      />
    </div>
  );
}

/* ─── Relationships ────────────────────────────────────────────────────── */

function RelationshipsTab({
  edges,
  known,
  onNavigate,
  onOpenPipeline,
}: {
  /** Lifted query result — the panel owns the hook so the surface scope
   * carries the edges. */
  edges: ReturnType<typeof useKeywordEdges>;
  known: boolean;
  onNavigate: (phrase: string) => void;
  onOpenPipeline: () => void;
}) {
  if (!known) {
    return (
      <UnavailableUntilResearch
        title="The keyword set has not been built"
        description="Run the baseline pipeline to discover and measure related keywords."
        onOpenPipeline={onOpenPipeline}
      />
    );
  }
  if (edges.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (edges.isError) {
    return (
      <ReadFailure
        title="Keyword relationships could not be loaded"
        error={edges.error}
        onRetry={() => void edges.refetch()}
      />
    );
  }
  const rows = edges.data ?? [];
  if (rows.length === 0) {
    return (
      <UnavailableUntilResearch
        title="No expanded keyword set exists yet"
        description="Research discovers parent, child, semantic, and related keywords, then collects their market facts."
        onOpenPipeline={onOpenPipeline}
      />
    );
  }
  const byType = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byType.get(row.edge_type) ?? [];
    list.push(row);
    byType.set(row.edge_type, list);
  }
  return (
    <div className="grid gap-3">
      {[...byType.entries()].map(([edgeType, group]) => (
        <div key={edgeType} className="rounded-lg border border-border p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {edgeType.replaceAll("_", " ")} · {group.length}
          </p>
          <ul className="grid gap-1">
            {group.map((edge) => (
              <li key={edge.id} className="flex items-center gap-2 text-xs">
                {edge.direction === "outgoing" ? (
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ArrowDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  onClick={() => onNavigate(edge.partner_phrase)}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-foreground transition-colors hover:text-primary",
                    edge.status === "rejected" &&
                      "text-muted-foreground line-through",
                  )}
                  title={`Open “${edge.partner_phrase}” in this window`}
                >
                  {edge.partner_phrase}
                </button>
                <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                  {edge.edge_type.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ─── Site performance ─────────────────────────────────────────────────── */

function SiteTab({
  siteId,
  brandId,
  keywordId,
  known,
}: {
  siteId: string | null;
  brandId: string | null;
  keywordId: string | null;
  known: boolean;
}) {
  if (!siteId) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
        <Trophy className="h-6 w-6 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Choose a website to see its search performance
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            This keyword dossier is currently global. Open it from a website or
            choose one from the website portfolio first.
          </p>
        </div>
        <a
          href={marketingRoutes.sites()}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open website portfolio
        </a>
      </div>
    );
  }
  return (
    <BoundSiteTab
      siteId={siteId}
      brandId={brandId}
      keywordId={keywordId}
      known={known}
    />
  );
}

function BoundSiteTab({
  siteId,
  brandId,
  keywordId,
  known,
}: {
  siteId: string;
  brandId: string | null;
  keywordId: string | null;
  known: boolean;
}) {
  const site = useSite(siteId);
  if (site.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (site.isError || !site.data) {
    return (
      <ReadFailure
        title="Website connection status could not be loaded"
        error={site.error}
        onRetry={() => void site.refetch()}
      />
    );
  }
  const sitePath = marketingRoutes.site(brandId, siteId);
  return (
    <div className="grid gap-4">
      <CollectionStatusPanel site={site.data} sitePath={sitePath} />
      <KeywordProviderEvidence
        site={site.data}
        sitePath={sitePath}
        siteId={siteId}
        brandId={brandId}
        keywordId={keywordId}
        known={known}
      />
    </div>
  );
}

function KeywordProviderEvidence({
  site,
  sitePath,
  siteId,
  brandId,
  keywordId,
  known,
}: {
  site: Parameters<typeof useCollectionStatus>[0];
  sitePath: string;
  siteId: string;
  brandId: string | null;
  keywordId: string | null;
  known: boolean;
}) {
  const status = useCollectionStatus(site, sitePath);
  const performance = useKeywordSitePerformance(siteId, keywordId);
  if (!known) {
    return (
      <UnavailableUntilResearch
        title="This phrase has no keyword identity yet"
        description="Run the baseline pipeline before joining it to website search evidence."
        onOpenPipeline={() => undefined}
        hideAction
      />
    );
  }
  if (performance.isLoading || status.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (performance.isError) {
    return (
      <ReadFailure
        title="Keyword performance could not be loaded"
        error={performance.error}
        onRetry={() => void performance.refetch()}
      />
    );
  }
  const rows = performance.data ?? [];
  const providerRows = ["gsc", "bing_webmaster"].map((provider) => ({
    provider,
    status: status.data?.find((row) => row.key === provider) ?? null,
    evidence:
      rows.find(
        (row) =>
          row.provider === provider ||
          (provider === "bing_webmaster" && row.provider === "bing"),
      ) ?? null,
  }));
  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          This keyword in connected search sources
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Query evidence currently covers the stored 28-day performance view.
        </p>
      </div>
      {providerRows.map(({ provider, status: providerStatus, evidence }) => (
        <div key={provider} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="uppercase">
              {providerStatus?.label ??
                (provider === "gsc"
                  ? GOOGLE_SEARCH_CONSOLE_PROVIDER.label
                  : BING_PROVIDER.label)}
            </Badge>
            {providerStatus ? (
              <Badge
                variant={
                  providerStatus.health === "connected" ? "success" : "outline"
                }
                className="ml-auto text-[10px]"
              >
                {providerStatus.healthLabel}
              </Badge>
            ) : null}
          </div>
          {providerStatus?.health === "not_connected" ? (
            <ProviderDirectiveState
              message="This source is not connected, so no keyword result can be reported."
              href={providerStatus.fix?.href ?? null}
              label={providerStatus.fix?.label ?? "Connect source"}
            />
          ) : providerStatus?.health === "never_run" ? (
            <ProviderDirectiveState
              message="Connected, but no successful sync has supplied query evidence yet."
              href={providerStatus.fix?.href ?? null}
              label={providerStatus.fix?.label ?? "Open source settings"}
            />
          ) : providerStatus?.health === "failing" ? (
            <ProviderDirectiveState
              message={providerStatus.healthDetail}
              href={providerStatus.fix?.href ?? null}
              label="Fix source"
            />
          ) : evidence ? (
            <KeywordPerformanceFields
              row={evidence}
              siteId={siteId}
              brandId={brandId}
            />
          ) : (
            <CondensedFieldGrid
              fields={[
                { label: "Clicks", value: "0" },
                { label: "Impressions", value: "0" },
                { label: "CTR", value: "0%" },
                { label: "Average position", value: "—" },
              ]}
            />
          )}
          {!evidence && providerStatus?.health === "connected" ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The source synced successfully; this keyword was not observed in
              the current stored window.
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function ProviderDirectiveState({
  message,
  href,
  label,
}: {
  message: string;
  href: string | null;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <p>{message}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-medium text-primary hover:underline"
        >
          {label}
        </a>
      ) : null}
    </div>
  );
}

function KeywordPerformanceFields({
  row,
  siteId,
  brandId,
}: {
  row: NonNullable<
    ReturnType<typeof useKeywordSitePerformance>["data"]
  >[number];
  siteId: string;
  brandId: string | null;
}) {
  return (
    <CondensedFieldGrid
      fields={[
        { label: "Clicks", value: row.clicks?.toLocaleString() ?? "0" },
        {
          label: "Impressions",
          value: row.impressions?.toLocaleString() ?? "0",
        },
        {
          label: "CTR",
          value:
            row.ctr === null || row.ctr === undefined
              ? "0%"
              : `${(Number(row.ctr) * 100).toFixed(2)}%`,
        },
        {
          label: "Average position",
          value:
            row.average_position === null || row.average_position === undefined
              ? "—"
              : Number(row.average_position).toFixed(1),
        },
        {
          label: "Window",
          value:
            row.first_date && row.last_date
              ? `${formatDate(row.first_date)} → ${formatDate(row.last_date)}`
              : "—",
        },
        {
          label: "Strongest page",
          value: row.top_page_id ? (
            <a
              href={marketingRoutes.sitePage(brandId, siteId, row.top_page_id)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[11px] text-foreground hover:text-primary"
            >
              {row.top_page_path ?? row.top_page_url ?? "Open page"}
            </a>
          ) : (
            "—"
          ),
          span: 2,
        },
      ]}
    />
  );
}

function SearchVisibilityTab({
  siteId,
  organizationId,
  phrase,
  keywordId,
  view,
  onViewChange,
  hasSerpIntentAnalysis,
  onAnalysisComplete,
}: {
  siteId: string | null;
  organizationId: string | null;
  phrase: string;
  keywordId: string | null;
  view: "positions" | "serp";
  onViewChange: (view: "positions" | "serp") => void;
  hasSerpIntentAnalysis: boolean;
  onAnalysisComplete: () => void;
}) {
  if (!siteId || !organizationId) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
        <SearchCheck className="h-6 w-6 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Choose a website before checking search visibility
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Google and Brave positions are website-specific. Opening this
            dossier from a website keeps that target attached while you drill
            into other keywords.
          </p>
        </div>
        <a
          href={marketingRoutes.sites()}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open website portfolio
        </a>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 border-b border-border pb-2">
        <Button
          size="sm"
          variant={view === "positions" ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => onViewChange("positions")}
        >
          Positions
        </Button>
        <Button
          size="sm"
          variant={view === "serp" ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => onViewChange("serp")}
        >
          Result pages
        </Button>
        <p className="ml-auto hidden text-[10px] text-muted-foreground sm:block">
          One stored observation, two views
        </p>
      </div>
      {view === "positions" ? (
        <KeywordRankingsTab
          siteId={siteId}
          organizationId={organizationId}
          phrase={phrase}
          keywordId={keywordId}
        />
      ) : (
        <KeywordSerpTab
          siteId={siteId}
          organizationId={organizationId}
          phrase={phrase}
          keywordId={keywordId}
          hasSerpIntentAnalysis={hasSerpIntentAnalysis}
          onAnalysisComplete={onAnalysisComplete}
        />
      )}
    </div>
  );
}

function ReadFailure({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-destructive">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {extractErrorMessage(error)}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function UnavailableUntilResearch({
  title,
  description,
  onOpenPipeline,
  hideAction = false,
}: {
  title: string;
  description: string;
  onOpenPipeline: () => void;
  hideAction?: boolean;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
      <GitBranch className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {!hideAction ? (
        <Button size="sm" className="h-8" onClick={onOpenPipeline}>
          Open pipeline
        </Button>
      ) : null}
    </div>
  );
}

function KeywordPipelineStrip({
  activeTab,
  researchState,
  hasSavedResearch,
  hasRelationships,
  hasMarket,
  isClassified,
  hasSite,
  onSelect,
}: {
  activeTab: KeywordIntelTab;
  researchState: KeywordResearchPanelState;
  hasSavedResearch: boolean;
  hasRelationships: boolean;
  hasMarket: boolean;
  isClassified: boolean;
  hasSite: boolean;
  onSelect: (tab: KeywordIntelTab) => void;
}) {
  const steps: Array<{
    label: string;
    tab: KeywordIntelTab;
    complete: boolean;
    optional?: boolean;
  }> = [
    {
      label: "Research",
      tab: "research",
      complete: hasSavedResearch || researchState.status === "done",
    },
    {
      label: "Keyword set",
      tab: "relationships",
      complete: hasRelationships,
    },
    { label: "Market facts", tab: "relationships", complete: hasMarket },
    {
      label: "Classification",
      tab: "classification",
      complete: isClassified,
    },
    {
      label: "Search visibility",
      tab: "visibility",
      complete: false,
      optional: true,
    },
  ];
  return (
    <div className="shrink-0 overflow-x-auto border-b border-border bg-muted/10 px-3 py-2">
      <ol
        className="flex min-w-max items-center gap-1"
        aria-label="Keyword intelligence progress"
      >
        {steps.map((step, index) => {
          const running =
            researchState.status === "running" && step.tab === "research";
          return (
            <li key={`${step.label}-${index}`} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect(step.tab)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors",
                  activeTab === step.tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  step.optional && !hasSite
                    ? "Optional — choose a website before collecting positions and result pages"
                    : undefined
                }
              >
                {running ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : step.complete ? (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {step.label}
                {step.optional ? (
                  <span className="text-[9px] text-muted-foreground">
                    optional
                  </span>
                ) : null}
              </button>
              {index < steps.length - 1 ? (
                <span className="px-0.5 text-border">/</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
