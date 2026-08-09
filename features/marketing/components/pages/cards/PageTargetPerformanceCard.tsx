"use client";

/**
 * PageTargetPerformanceCard — how this page ACTUALLY performs for its target
 * keyword, from the evidence the platform already stores:
 *
 * - `seo.rank_target` + latest `seo.rank_observation` per target — live SERP
 *   position for this site, and WHICH url ranks (cannibalization when it is
 *   a different page of the site).
 * - `seo.search_performance_daily` — GSC clicks/impressions/position for the
 *   target query on THIS page (same aggregation as `listPageTopQueries`),
 *   plus the site-wide view row (`v_site_keyword_performance`) whose
 *   `top_page_id` exposes where the site's traffic for this query lands.
 * - AI results: `result_type='ai_citation'` observations (cited/mentioned +
 *   model, from ChatGPT-style ai_answer runs) and the latest keyword-level
 *   `serp_snapshot` with `search_type='ai_answer'` + its citation rows.
 *
 * Reads ride the canonical keyword data layer (`features/marketing/seo/
 * keyword/data.ts`) — direct Supabase, no Python proxy. Everything rendered
 * is real stored data; sections state their absence honestly.
 */

import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Crosshair } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  formatCompactDate,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { KeywordDataChips } from "@/features/marketing/seo/keyword/KeywordDataChips";
import {
  getLatestAiAnswerEvidence,
  getPageQueryStat,
  listRankEvidenceForKeyword,
  listSitePerformanceForKeyword,
  resolveKeyword,
} from "@/features/marketing/seo/keyword/data";
import type {
  AiAnswerEvidence,
  RankTargetEvidence,
} from "@/features/marketing/seo/keyword/data";
import type { PageQueryStat, ResolvedKeyword } from "@/features/marketing/seo/keyword/types";
import type { SiteKeywordPerformanceRow } from "@/features/marketing/seo/keyword-research/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import type { MarketingPage } from "@/features/marketing/types";

/** hostname+path, lowercased, www/trailing-slash stripped — URL identity. */
function normalizeUrlForMatch(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const ENGINE_LABELS: Record<string, string> = {
  chat_gpt: "ChatGPT",
  google: "Google",
  brave: "Brave",
  bing: "Bing",
};
function engineLabel(engine: string): string {
  return ENGINE_LABELS[engine] ?? engine.replaceAll("_", " ");
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

/** Where the ranking/cited URL points relative to this page. */
function UrlMatchLine({
  matchedUrl,
  pageUrl,
  siteDomain,
  notFoundLabel,
}: {
  matchedUrl: string | null;
  pageUrl: string;
  siteDomain: string | null;
  notFoundLabel: string;
}) {
  const matched = normalizeUrlForMatch(matchedUrl);
  const own = normalizeUrlForMatch(pageUrl);
  if (!matched) {
    return <p className="text-[11px] text-muted-foreground">{notFoundLabel}</p>;
  }
  if (own !== null && matched === own) {
    return (
      <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        This page is the ranking URL
      </p>
    );
  }
  const sameSite =
    siteDomain !== null && hostnameOf(matchedUrl) === siteDomain;
  return (
    <p
      className={cn(
        "truncate text-[11px] font-medium",
        sameSite
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground",
      )}
      title={matchedUrl ?? undefined}
    >
      {sameSite ? "Different page of this site ranks: " : "Ranking URL: "}
      {matchedUrl}
    </p>
  );
}

/** Shared react-query cache key — read directly (no duplicate fetch) by
 * `buildMarketingPageScope` so the surface scope emits the SAME evidence
 * this card renders, once it has resolved. */
export const pageTargetPerformanceQueryKey = (pageId: string, phrase: string) =>
  ["marketing", "page-target-performance", pageId, phrase] as const;

/** The full evidence bundle this card resolves — also the shape the
 * `target_performance` surface value emits. */
export interface PageTargetPerformanceEvidence {
  resolved: ResolvedKeyword;
  keywordId: string | null;
  pageStat: (PageQueryStat & { firstDate: string | null; lastDate: string | null }) | null;
  sitePerf: SiteKeywordPerformanceRow[];
  rankTargets: RankTargetEvidence[];
  aiAnswer: AiAnswerEvidence | null;
}

export function PageTargetPerformanceCard({ page }: { page: MarketingPage }) {
  const openKeywordIntel = useOpenKeywordWindow();
  const phrase = page.target_keyword?.trim() ?? "";
  const siteDomain = hostnameOf(page.url);

  const evidence = useQuery({
    queryKey: pageTargetPerformanceQueryKey(page.id, phrase),
    enabled: phrase.length > 0,
    queryFn: async ({ signal }) => {
      const resolved = await resolveKeyword(phrase, signal);
      const keywordId = resolved.keyword?.id ?? null;
      const [pageStat, sitePerf, rankTargets, aiAnswer] = await Promise.all([
        getPageQueryStat(page.id, phrase, signal),
        keywordId
          ? listSitePerformanceForKeyword(page.site_id, keywordId, signal)
          : Promise.resolve([]),
        keywordId
          ? listRankEvidenceForKeyword(page.site_id, keywordId, signal)
          : Promise.resolve<RankTargetEvidence[]>([]),
        keywordId
          ? getLatestAiAnswerEvidence(keywordId, signal)
          : Promise.resolve<AiAnswerEvidence | null>(null),
      ]);
      return { resolved, keywordId, pageStat, sitePerf, rankTargets, aiAnswer };
    },
  });

  const headerExtra = (
    <button
      type="button"
      aria-label={`Open Keyword Intelligence for ${phrase || "the target keyword"}`}
      title="Keyword Intelligence"
      onClick={() =>
        openKeywordIntel({
          phrase: phrase || undefined,
          organizationId: page.organization_id,
          siteId: page.site_id,
          pageId: page.id,
        })
      }
      className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-primary"
    >
      <BrainCircuit className="h-3.5 w-3.5" />
    </button>
  );

  if (!phrase) {
    return (
      <SectionCard
        title="Target keyword performance"
        collapsible
        anchor="target_performance"
        headerExtra={headerExtra}
      >
        <div className="flex items-center gap-2 p-3">
          <Crosshair className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No target keyword set — choose one in Page intent (or promote a
            supporting keyword from the Keyword batch) to see rank, Search
            Console, and AI-answer evidence here.
          </p>
        </div>
      </SectionCard>
    );
  }

  const data = evidence.data;
  const organicTargets = (data?.rankTargets ?? []).filter(
    (target) => target.searchType !== "ai_answer",
  );
  const aiTargets = (data?.rankTargets ?? []).filter(
    (target) => target.searchType === "ai_answer",
  );
  const gscSiteRow =
    (data?.sitePerf ?? []).find((row) => row.average_position !== null) ??
    (data?.sitePerf ?? [])[0] ??
    null;
  const siteCitations = (data?.aiAnswer?.citations ?? []).filter(
    (citation) =>
      siteDomain !== null && hostnameOf(citation.url) === siteDomain,
  );

  const copy = webCopy({
    kind: "web-page-target-performance",
    label: "Target keyword performance",
    description:
      "Stored evidence of how this page performs for its target keyword: SERP rank observations (with the exact ranking URL), Search Console clicks/impressions/position for the query on this page, site-wide top page for the query, keyword market data, and AI-answer citation evidence.",
    surface: `Target keyword performance — ${page.url}`,
    data: {
      url: page.url,
      target_keyword: phrase,
      keyword: data?.resolved.keyword ?? null,
      market: data?.resolved.market ?? null,
      page_gsc: data?.pageStat ?? null,
      site_gsc: data?.sitePerf ?? null,
      rank_targets: data?.rankTargets ?? null,
      ai_answer: data?.aiAnswer ?? null,
    },
    lines: [
      ["URL", page.url],
      ["Target keyword", phrase],
      [
        "Best organic rank",
        organicTargets
          .map((target) => target.organicRank ?? target.absoluteRank)
          .filter((rank): rank is number => rank !== null)
          .sort((a, b) => a - b)[0] ?? "no observation",
      ],
      [
        "Page GSC",
        data?.pageStat
          ? `${data.pageStat.clicks} clicks · ${data.pageStat.impressions} impressions · pos ${data.pageStat.position?.toFixed(1) ?? "—"}`
          : "no impressions recorded",
      ],
      [
        "AI answer",
        data?.aiAnswer
          ? `${engineLabel(data.aiAnswer.engine)} · ${data.aiAnswer.citationCount ?? data.aiAnswer.citations.length} citations · site cited: ${siteCitations.length > 0 ? "yes" : "no"}`
          : "no AI-answer run stored",
      ],
    ],
    attributes: { page_id: page.id, site_id: page.site_id },
  });

  return (
    <SectionCard
      title="Target keyword performance"
      copy={copy}
      collapsible
      anchor="target_performance"
      headerExtra={headerExtra}
    >
      <div className="grid gap-3 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-foreground">{phrase}</span>
          {data?.resolved.market ? (
            <KeywordDataChips
              market={data.resolved.market}
              sitePerformance={data.sitePerf}
            />
          ) : evidence.isSuccess && !data?.keywordId ? (
            <span className="text-[11px] text-muted-foreground">
              Not in the keyword library yet — no market data.
            </span>
          ) : null}
        </div>

        {/* `isPending`, not `isLoading`: TanStack v5's isLoading drops to false
            during retry backoff while data is still undefined, which would let
            the sections below render their honest-absence copy ("Not
            rank-tracked for this site yet") over a read that is actively
            failing. Same silent-fallback class as the keyword Performance tab
            (2026-08-09). */}
        {evidence.isPending && !evidence.isError ? (
          <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : evidence.isError ? (
          <p className="text-xs text-destructive">
            Could not load target keyword evidence:{" "}
            {evidence.error instanceof Error
              ? evidence.error.message
              : "unknown error"}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {/* ---- SERP rank ---- */}
            <div className="min-w-0">
              <SubHeading>SERP rank</SubHeading>
              {organicTargets.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Not rank-tracked for this site yet — open Keyword
                  Intelligence and track it from the Rankings tab.
                </p>
              ) : (
                <div className="grid gap-2">
                  {organicTargets.map((target) => (
                    <div key={target.targetId} className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-semibold tabular-nums text-foreground">
                          {target.organicRank ?? target.absoluteRank ?? "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {engineLabel(target.engine)} · {target.device}
                          {target.observedAt
                            ? ` · ${formatCompactDate(target.observedAt)}`
                            : " · never checked"}
                        </span>
                        {!target.isActive ? (
                          <Badge variant="outline" className="text-[9px]">
                            Paused
                          </Badge>
                        ) : null}
                      </div>
                      {target.observedAt ? (
                        <UrlMatchLine
                          matchedUrl={target.matchedUrl}
                          pageUrl={page.url}
                          siteDomain={siteDomain}
                          notFoundLabel="Site not found in the checked results."
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Search Console ---- */}
            <div className="min-w-0">
              <SubHeading>Search Console — this page</SubHeading>
              {data?.pageStat ? (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Stat label="Clicks" value={data.pageStat.clicks} />
                    <Stat
                      label="Impr."
                      value={data.pageStat.impressions}
                    />
                    <Stat
                      label="CTR"
                      value={
                        data.pageStat.impressions > 0
                          ? `${((data.pageStat.clicks / data.pageStat.impressions) * 100).toFixed(1)}%`
                          : "—"
                      }
                    />
                    <Stat
                      label="Pos"
                      value={data.pageStat.position?.toFixed(1) ?? "—"}
                    />
                  </div>
                  {data.pageStat.firstDate && data.pageStat.lastDate ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Stored window {formatCompactDate(data.pageStat.firstDate)}{" "}
                      – {formatCompactDate(data.pageStat.lastDate)}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  No Search Console impressions recorded for this exact query
                  on this page.
                </p>
              )}
              {gscSiteRow ? (
                gscSiteRow.top_page_id === page.id ? (
                  <p className="mt-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    This page is the site&apos;s top page for the query.
                  </p>
                ) : gscSiteRow.top_page_id ? (
                  <p
                    className="mt-1.5 truncate text-[11px] font-medium text-amber-600 dark:text-amber-400"
                    title={gscSiteRow.top_page_url ?? undefined}
                  >
                    Site&apos;s traffic for this query lands on{" "}
                    {gscSiteRow.top_page_path ??
                      gscSiteRow.top_page_url ??
                      "another page"}
                  </p>
                ) : null
              ) : null}
            </div>

            {/* ---- AI results ---- */}
            <div className="min-w-0">
              <SubHeading>AI results</SubHeading>
              {aiTargets.length === 0 && !data?.aiAnswer ? (
                <p className="text-[11px] text-muted-foreground">
                  No AI-answer runs stored for this keyword yet.
                </p>
              ) : (
                <div className="grid gap-2">
                  {aiTargets.map((target) => (
                    <div key={target.targetId} className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {engineLabel(target.engine)}
                        </span>
                        {target.observedAt === null ? (
                          <span className="text-[10px] text-muted-foreground">
                            never checked
                          </span>
                        ) : (
                          <>
                            <Badge
                              variant={target.aiCited ? "success" : "outline"}
                              className="text-[9px]"
                            >
                              {target.aiCited ? "Cited" : "Not cited"}
                            </Badge>
                            <Badge
                              variant={
                                target.aiMentioned ? "success" : "outline"
                              }
                              className="text-[9px]"
                            >
                              {target.aiMentioned ? "Mentioned" : "Not mentioned"}
                            </Badge>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {target.absoluteRank !== null &&
                              target.aiCitationCount !== null
                                ? `citation ${target.absoluteRank} of ${target.aiCitationCount}`
                                : target.aiCitationCount !== null
                                  ? `${target.aiCitationCount} citations in answer`
                                  : null}
                            </span>
                          </>
                        )}
                      </div>
                      {target.observedAt ? (
                        <p className="text-[10px] text-muted-foreground">
                          {target.aiModelName ?? engineLabel(target.engine)} ·{" "}
                          {formatCompactDate(target.observedAt)}
                        </p>
                      ) : null}
                      {target.aiCited ? (
                        <UrlMatchLine
                          matchedUrl={target.matchedUrl}
                          pageUrl={page.url}
                          siteDomain={siteDomain}
                          notFoundLabel=""
                        />
                      ) : null}
                    </div>
                  ))}
                  {data?.aiAnswer && aiTargets.length === 0 ? (
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {engineLabel(data.aiAnswer.engine)}
                        </span>
                        <Badge
                          variant={siteCitations.length > 0 ? "success" : "outline"}
                          className="text-[9px]"
                        >
                          {siteCitations.length > 0
                            ? "Site cited"
                            : "Site not cited"}
                        </Badge>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {data.aiAnswer.citationCount ??
                            data.aiAnswer.citations.length}{" "}
                          citations · {formatCompactDate(data.aiAnswer.observedAt)}
                        </span>
                      </div>
                      {siteCitations[0]?.url ? (
                        <UrlMatchLine
                          matchedUrl={siteCitations[0].url}
                          pageUrl={page.url}
                          siteDomain={siteDomain}
                          notFoundLabel=""
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
