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
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
  GitBranch,
  Globe,
  Loader2,
  RefreshCw,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
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
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createKeywordIntelligenceScope,
  keywordIntelligenceManifest,
} from "@/features/surfaces/manifests/keyword-intelligence.manifest";
import { KeywordDataChips } from "./KeywordDataChips";
import { KeywordInput } from "./KeywordInput";
import { KeywordRankingsTab, KeywordSerpTab } from "./KeywordRankTabs";
import { KeywordResearchTab } from "./KeywordResearchTab";
import { buildKeywordBrief } from "./keyword-brief";
import {
  useKeywordEdges,
  useKeywordSitePerformance,
  useKeywordVolumeRefresh,
  useResolvedKeyword,
} from "./hooks";
import type { KeywordIntelTab, KeywordScope } from "./types";

const TAB_LABELS: Record<KeywordIntelTab, string> = {
  overview: "Overview",
  relationships: "Relationships",
  site: "Site",
  rankings: "Rankings",
  serp: "SERP",
  research: "Research",
};

/** Tabs that only make sense with a site binding. */
const SITE_TABS: KeywordIntelTab[] = ["site", "rankings", "serp"];

/** The window IS a surface — byte-identical to the manifest + ui_surface row. */
const KEYWORD_INTELLIGENCE_SURFACE_NAME =
  keywordIntelligenceManifest.surfaceName;

/** The 13 intrinsic classification columns, humanized. */
const CLASSIFICATION_LABELS: [keyof KeywordWithMarket, string][] = [
  ["intent_class", "Intent"],
  ["funnel_stage", "Funnel stage"],
  ["specificity", "Specificity"],
  ["query_form", "Query form"],
  ["local_intent", "Local intent"],
  ["urgency", "Urgency"],
  ["audience_type", "Audience"],
  ["brand_presence", "Brand presence"],
  ["comparison_intent", "Comparison"],
  ["price_sensitivity", "Price sensitivity"],
  ["transaction_direction", "Transaction"],
  ["fulfillment_mode", "Fulfillment"],
  ["compliance_framing", "Compliance"],
];

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
  const volumeRefresh = useKeywordVolumeRefresh(scope?.organizationId);
  const siteId = scope?.siteId;
  const organizationId = scope?.organizationId;
  const hasSite = Boolean(siteId && organizationId);

  const brief = buildKeywordBrief({
    phrase,
    keyword,
    market,
    sitePerformance: sitePerf.data,
  });

  // Live surface scope — built at agent-launch/menu-open time from the
  // already-loaded query data (never fetches). The window IS a surface:
  // user-created agents bound to `matrx-user/keyword-intelligence` receive
  // the full dossier, condensed in `keyword_brief`.
  const getScope = () => {
    const classification: Record<string, string> = {};
    if (keyword) {
      for (const [field] of CLASSIFICATION_LABELS) {
        const value = keyword[field];
        if (typeof value === "string" && value) classification[field] = value;
      }
    }
    return createKeywordIntelligenceScope({
      phrase,
      keyword_known: Boolean(keyword),
      keyword_id: keyword?.id,
      keyword_language: keyword?.language,
      keyword_brief: phrase.trim() ? brief.data : undefined,
      keyword_market: keyword?.keyword_market?.length
        ? keyword.keyword_market.map((row) => ({ ...row }))
        : undefined,
      keyword_classification:
        Object.keys(classification).length > 0 ? classification : undefined,
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
  };
  const copy = webCopy({
    kind: "seo-keyword-brief",
    label: `Keyword — ${phrase || "none"}`,
    description:
      "The condensed keyword dossier: market metrics, classification, and site performance.",
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

      {/* ── Tab strip ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {(Object.keys(TAB_LABELS) as KeywordIntelTab[]).map((tab) => {
          const needsSite = SITE_TABS.includes(tab) && !hasSite;
          return (
            <button
              key={tab}
              type="button"
              disabled={needsSite}
              title={
                needsSite
                  ? "Open Keyword Intelligence from a site to see site-scoped data"
                  : undefined
              }
              onClick={() => onTabChange(tab)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === tab
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                needsSite && "cursor-not-allowed opacity-40",
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
        ) : activeTab === "overview" ? (
          <OverviewTab
            phrase={phrase}
            keyword={keyword}
            marketLoading={resolved.isLoading}
            onFetchMarket={() => void refreshVolume(false)}
            fetching={volumeRefresh.state.status === "running"}
          />
        ) : activeTab === "relationships" ? (
          <RelationshipsTab
            edges={edges}
            known={Boolean(keyword)}
            onNavigate={navigateToKeyword}
          />
        ) : activeTab === "site" ? (
          <SiteTab
            siteId={scope?.siteId ?? null}
            brandId={scope?.brandId ?? null}
            keywordId={keyword?.id ?? null}
            known={Boolean(keyword)}
          />
        ) : activeTab === "rankings" ? (
          siteId && organizationId ? (
            <KeywordRankingsTab
              siteId={siteId}
              organizationId={organizationId}
              phrase={phrase}
              keywordId={keyword?.id ?? null}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Open Keyword Intelligence from a site to see rank tracking.
            </p>
          )
        ) : activeTab === "serp" ? (
          siteId && organizationId ? (
            <KeywordSerpTab
              siteId={siteId}
              organizationId={organizationId}
              phrase={phrase}
              keywordId={keyword?.id ?? null}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Open Keyword Intelligence from a site to inspect stored SERPs.
            </p>
          )
        ) : (
          <KeywordResearchTab
            key={phrase}
            phrase={phrase}
            organizationId={scope?.organizationId}
            pageId={scope?.pageId}
            onResearchStart={onResearchStart}
          />
        )}
      </div>
    </div>
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
  marketLoading,
  onFetchMarket,
  fetching,
}: {
  phrase: string;
  keyword: KeywordWithMarket | null;
  marketLoading: boolean;
  onFetchMarket: () => void;
  fetching: boolean;
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
        <p className="max-w-sm text-xs text-muted-foreground">
          <span className="font-medium text-foreground">“{phrase}”</span> is
          not in the keyword library yet. Fetching market data adds it to the
          universal keyword plane with real provider volume, CPC, and
          competition.
        </p>
        <Button size="sm" className="h-8" disabled={fetching} onClick={onFetchMarket}>
          {fetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Fetch market data
        </Button>
      </div>
    );
  }

  const markets = keyword.keyword_market ?? [];
  const classification = CLASSIFICATION_LABELS.flatMap(([field, label]) => {
    const value = keyword[field];
    return typeof value === "string" && value
      ? [{ label, value: value.replaceAll("_", " ") }]
      : [];
  });

  return (
    <div className="grid gap-3">
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
            <div key={market.id} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Market {market.location_code === 2840 ? "US" : market.location_code}
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

      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-semibold text-foreground">
          Classification
        </p>
        {classification.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Unclassified — run Research to classify intent, funnel stage, and
            specificity.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {classification.map((entry) => (
              <Badge
                key={entry.label}
                variant="outline"
                className="gap-1 text-[10px]"
              >
                <span className="text-muted-foreground">{entry.label}:</span>
                <span className="capitalize">{entry.value}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>

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
}: {
  /** Lifted query result — the panel owns the hook so the surface scope
   * carries the edges. */
  edges: ReturnType<typeof useKeywordEdges>;
  known: boolean;
  onNavigate: (phrase: string) => void;
}) {
  if (!known) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Relationships exist only for library keywords — fetch market data or
        run Research first.
      </p>
    );
  }
  if (edges.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  const rows = edges.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No keyword relationships recorded yet — Research discovers parent,
          child, and LSI relationships.
        </p>
      </div>
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
                {edge.confidence !== null ? (
                  <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                    {/* Stored as 0–100 (fraction-form rows normalized too). */}
                    {(edge.confidence <= 1
                      ? edge.confidence * 100
                      : edge.confidence
                    ).toFixed(0)}
                    %
                  </span>
                ) : null}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {edge.origin}
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
  const performance = useKeywordSitePerformance(siteId, keywordId);
  if (!known) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Site performance joins through the keyword library — fetch market data
        first so this phrase has a library identity.
      </p>
    );
  }
  if (performance.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  const rows = performance.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
        <Trophy className="h-5 w-5 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          No stored search performance for this keyword on this site — it has
          not appeared in the synced Search Console / Bing query evidence yet.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={`${row.provider}:${row.query}`}
          className="rounded-lg border border-border p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="uppercase">
              {row.provider ?? "gsc"}
            </Badge>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              “{row.query}”
            </span>
            {row.workflow_status ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {row.workflow_status}
              </Badge>
            ) : null}
          </div>
          <CondensedFieldGrid
            fields={[
              {
                label: "Clicks",
                value: row.clicks?.toLocaleString() ?? "—",
              },
              {
                label: "Impressions",
                value: row.impressions?.toLocaleString() ?? "—",
              },
              {
                label: "CTR",
                value:
                  row.ctr === null || row.ctr === undefined
                    ? "—"
                    : `${(Number(row.ctr) * 100).toFixed(2)}%`,
              },
              {
                label: "Average position",
                value:
                  row.average_position === null ||
                  row.average_position === undefined
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
                label: "Priority score",
                value:
                  row.priority_score === null ||
                  row.priority_score === undefined
                    ? "—"
                    : Number(row.priority_score).toFixed(0),
              },
              {
                label: "Strongest page",
                value: row.top_page_id && siteId ? (
                  <a
                    href={marketingRoutes.site(
                      brandId,
                      siteId,
                      `/pages/${row.top_page_id}`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-[11px] text-foreground hover:text-primary"
                  >
                    {row.top_page_path ?? row.top_page_url ?? row.top_page_id}
                  </a>
                ) : (
                  "—"
                ),
                span: 2,
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
