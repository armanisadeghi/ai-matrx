"use client";

import { useEffect, useState } from "react";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import Link from "next/link";
import {
  AppWindow,
  FileQuestion,
  History,
  Monitor,
  RefreshCw,
  Search,
  Smartphone,
} from "lucide-react";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { PageContentCard } from "@/features/marketing/components/pages/PageContentCard";
import { FetchPageButton } from "@/features/marketing/components/pages/FetchPageButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  usePagePerformance,
  usePageScreenshots,
  usePageSitemapMemberships,
  usePageWebAnalytics,
  usePageWorkspace,
} from "@/features/marketing/data/hooks";
import { usePageAnalyzer } from "@/features/marketing/components/pages/usePageAnalyzer";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  buildMarketingPageScope,
  evaluatePageSocialCard,
  MARKETING_PAGE_SURFACE_NAME,
} from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { type SerpDevice } from "@/features/marketing/seo/serp/SerpResult";
import { useOpenSerpAnalyzerWindow } from "@/features/overlays/openers/serpAnalyzerWindow";
import { useOpenSocialCardWindow } from "@/features/overlays/openers/socialCardAnalyzerWindow";
import { type SocialPlatform } from "@/features/marketing/seo/social/SocialCard";
import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
} from "@/features/marketing/lib/snapshot-content";
import {
  CondensedFieldGrid,
  formatDate,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingUrlRow } from "@/features/marketing/components/shared/MarketingUrlRow";
import { cn } from "@/lib/utils";
import { PageQueriesCard } from "@/features/marketing/components/pages/cards/PageQueriesCard";
import { PageFindingsCard } from "@/features/marketing/components/pages/cards/PageFindingsCard";
import { PageLinksCard } from "@/features/marketing/components/pages/cards/PageLinksCard";
import { PageBacklinksCard } from "@/features/marketing/components/pages/cards/PageBacklinksCard";
import { PageIntentCard } from "@/features/marketing/components/pages/cards/PageIntentCard";
import { SerpPreview } from "@/features/marketing/components/pages/cards/SerpPreviewCard";
import { SocialCardPreview } from "@/features/marketing/components/pages/cards/SocialCardPreview";
import { IndexabilitySection } from "@/features/marketing/components/pages/cards/IndexabilitySection";
import { HeadingsOutline } from "@/features/marketing/components/pages/cards/HeadingsOutline";
import { ContentStats } from "@/features/marketing/components/pages/cards/ContentStats";
import { SitemapMembershipsCard } from "@/features/marketing/components/pages/cards/SitemapMembershipsCard";
import { PageCapturesCard } from "@/features/marketing/components/pages/cards/PageCapturesCard";
import { PageAnalyzerCard } from "@/features/marketing/components/pages/cards/PageAnalyzerCard";
import { PagespeedCard } from "@/features/marketing/components/pages/cards/PagespeedCard";
import { PageAnalyticsCard } from "@/features/marketing/components/pages/cards/PageAnalyticsCard";
import { buildKeywordBrief } from "@/features/marketing/seo/keyword/keyword-brief";
import { useResolvedKeyword } from "@/features/marketing/seo/keyword/hooks";
import type { KeywordSuggestion } from "@/features/marketing/seo/keyword/types";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

export function PageWorkspace({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const { brandId, getBaseValues } = useMarketingSiteSurfaceBase();
  const workspace = usePageWorkspace(site.id, pageId);
  // Everything the page loads is emitted as a surface value (completeness
  // law) — these share react-query caches with the cards below.
  const screenshots = usePageScreenshots(site.id, pageId);
  const sitemapMemberships = usePageSitemapMemberships(site.id, pageId);
  const pagespeedRows = usePagePerformance(site.id, pageId);
  const analyticsRows = usePageWebAnalytics(site.id, pageId);
  // Lifted so the surface scope emits the same artifact the card renders.
  const analyzer = usePageAnalyzer(pageId);
  // The saved target keyword resolved against the keyword library — shares
  // the react-query cache with IntentForm; feeds `target_keyword_data` into
  // the surface scope so agents get the market data, never just the phrase.
  const resolvedTargetKeyword = useResolvedKeyword(
    workspace.data?.page.target_keyword ?? null,
  );
  const openSerpAnalyzer = useOpenSerpAnalyzerWindow();
  const openSocialCards = useOpenSocialCardWindow();
  const [serpDevice, setSerpDevice] = useState<SerpDevice>("desktop");
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>("x");
  // The extracted markdown IS the page_content surface value — decode it from
  // the same module-level blob cache PageContentCard renders from (no
  // duplicate fetch), so agents receive the full body at launch time.
  const markdownBlob = useFileBlob(
    workspace.data?.latestSnapshot?.markdown_file_id ?? null,
  );
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const blob = markdownBlob.blob;
    // Async continuation only — never a synchronous setState in the effect
    // body (react-hooks/set-state-in-effect).
    void (async () => {
      const value = blob ? await blob.text() : null;
      if (active) setMarkdownText(value);
    })();
    return () => {
      active = false;
    };
  }, [markdownBlob.blob]);
  if (workspace.isLoading)
    return <LoadingSurface label="Loading canonical page…" />;
  if (workspace.isError || !workspace.data) {
    return (
      <QueryError
        error={workspace.error ?? new Error("Page not found")}
        onRetry={() => void workspace.refetch()}
      />
    );
  }
  const data = workspace.data;
  const page = data.page;
  const snapshot = data.latestSnapshot;
  const head = parseSnapshotHeadTags(snapshot ? snapshot.head_tags : null);
  const extracted = parseSnapshotExtracted(snapshot?.extracted ?? null);
  const headings = parseSnapshotHeadings(snapshot?.headings ?? null);
  // Page Analyzer keywords become first-class target-keyword suggestions —
  // the analyzer's picture of the page feeds the intent form directly.
  const analyzerArtifact = analyzer.state.result?.artifact ?? null;
  const analyzerKeywordSuggestions: KeywordSuggestion[] = analyzerArtifact
    ? [
        {
          phrase: analyzerArtifact.inferred_primary_keyword.phrase,
          source: "analyzer" as const,
          detail: "inferred primary",
        },
        ...analyzerArtifact.supported_keywords.map(
          (k): KeywordSuggestion => ({
            phrase: k.phrase,
            source: "analyzer",
            detail: "supporting",
          }),
        ),
        ...analyzerArtifact.discovered_keywords.map(
          (k): KeywordSuggestion => ({
            phrase: k.phrase,
            source: "analyzer",
            detail: "discovered",
          }),
        ),
      ]
    : [];
  const searchPerformance = data.searchPerformance;
  const searchCtr = searchPerformance.gsc_impressions_28d
    ? (searchPerformance.gsc_clicks_28d ?? 0) /
      searchPerformance.gsc_impressions_28d
    : null;

  // Live surface-scope builder — called only at agent-launch / menu-open time,
  // never on render. Emits the inherited site base + this page's loaded values
  // (no fetching; everything is already in the workspace query result).
  const getScope = () =>
    buildMarketingPageScope({
      brandId,
      page,
      snapshot,
      openFindings: data.openFindings,
      markdown: markdownText,
      gscMetrics: searchPerformance.in_gsc
        ? {
            clicks: searchPerformance.gsc_clicks_28d ?? 0,
            impressions: searchPerformance.gsc_impressions_28d ?? 0,
            ctr: searchCtr,
            position: searchPerformance.gsc_position_28d,
          }
        : undefined,
      screenshots: screenshots.data ?? null,
      analyzerArtifact: analyzer.state.result?.artifact ?? null,
      pagespeedRows: pagespeedRows.data ?? null,
      analyticsRows: analyticsRows.data ?? null,
      sitemapMemberships: sitemapMemberships.data ?? null,
      pageScore: data.score,
      failedChecks: data.failCount,
      targetKeywordData:
        page.target_keyword && resolvedTargetKeyword.data?.keyword
          ? buildKeywordBrief({
              phrase: page.target_keyword,
              keyword: resolvedTargetKeyword.data.keyword,
              market: resolvedTargetKeyword.data.market,
            }).data
          : null,
      base: getBaseValues(),
    });

  const pageCopy = webCopy({
    kind: "web-page",
    label: `Page ${page.path || "/"}`,
    description:
      "A canonical page from the Marketing site workspace: identity, user intent, and its latest observed snapshot.",
    surface: `Page workspace — ${page.url}`,
    data: { page, latestSnapshot: snapshot, openFindings: data.openFindings },
    lines: [
      ["URL", page.url],
      ["Status", page.status],
      ["Provenance", page.provenance],
      [L.target_keyword, page.target_keyword],
      ["Observed title", head.title],
      ["Observed description", head.metaDescription],
      [L.open_findings, data.openFindings],
      [L.http_status, page.http_status_last],
      ["Words", snapshot?.word_count ?? null],
      ["Captured", snapshot ? formatDate(snapshot.captured_at) : "never"],
    ],
    attributes: { page_id: page.id, site_id: site.id },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_PAGE_SURFACE_NAME}
      isEditable={false}
      getScope={getScope}
    >
      <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span data-surface-value="page_status">
                <StatusBadge value={page.status} />
              </span>
              <Badge
                variant="outline"
                className="uppercase"
                data-surface-value="page_provenance"
              >
                {page.provenance}
              </Badge>
            </div>
            <h1
              className="mt-2 truncate font-mono text-sm font-semibold text-foreground"
              data-surface-value="page_path"
            >
              {page.path || "/"}
            </h1>
            <MarketingUrlRow url={page.url} className="mt-0.5" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <CopyButtons size="icon" {...pageCopy} />
            <FetchPageButton siteId={site.id} url={page.url} pageId={page.id} />
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href={`${sitePath}/pages/${page.id}/snapshots`}>
                <History className="mr-1.5 h-3.5 w-3.5" />
                Snapshot history
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label={L.open_findings}
            value={data.openFindings}
            detail="Current state"
            tone={data.openFindings ? "warning" : "good"}
            anchor="open_findings"
          />
          <MetricCell
            label={L.http_status}
            value={page.http_status_last ?? "—"}
            detail="Latest observed"
            anchor="http_status"
          />
          <MetricCell
            label={L.word_count}
            value={snapshot?.word_count?.toLocaleString() ?? "—"}
            detail="Latest snapshot"
            anchor="word_count"
          />
          <MetricCell
            label={L.first_seen}
            value={formatDate(page.first_seen)}
            anchor="first_seen"
          />
          <MetricCell
            label={L.last_seen}
            value={formatDate(page.last_seen)}
            anchor="last_seen"
          />
          <MetricCell
            label={L.snapshot_captured_at}
            value={snapshot ? formatDate(snapshot.captured_at) : "None"}
            detail={snapshot ? "Latest snapshot" : "No accepted snapshot"}
            anchor="snapshot_captured_at"
          />
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard
            title="Search result preview"
            collapsible
            copy={webCopy({
              kind: "web-page-serp",
              label: "Search result preview",
              description:
                "Observed search-appearance metadata vs the desired editorial targets for this page.",
              surface: `Search result preview — ${page.url}`,
              data: {
                url: page.url,
                observed: {
                  title: head.title,
                  description: head.metaDescription,
                },
                desired: {
                  title: page.meta_title_desired,
                  description: page.meta_description_desired,
                  targetKeyword: page.target_keyword,
                },
                seoMetrics: snapshot?.seo_metrics ?? null,
              },
              lines: [
                ["URL", page.url],
                ["Observed title", head.title ?? "none"],
                ["Observed description", head.metaDescription ?? "none"],
                ["Desired title", page.meta_title_desired],
                ["Desired description", page.meta_description_desired],
                [L.target_keyword, page.target_keyword],
              ],
              attributes: { page_id: page.id },
            })}
            headerExtra={
              <div className="flex items-center gap-1">
                <div className="flex items-center rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setSerpDevice("desktop")}
                    aria-label="Desktop preview"
                    title="Desktop preview"
                    className={cn(
                      "flex h-6 w-7 items-center justify-center rounded-l-[5px] transition-colors",
                      serpDevice === "desktop"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSerpDevice("mobile")}
                    aria-label="Mobile preview"
                    title="Mobile preview"
                    className={cn(
                      "flex h-6 w-7 items-center justify-center rounded-r-[5px] transition-colors",
                      serpDevice === "mobile"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const head = snapshot
                      ? parseSnapshotHeadTags(snapshot.head_tags)
                      : parseSnapshotHeadTags(null);
                    openSerpAnalyzer({
                      url: page.url,
                      title: head.title ?? page.meta_title_desired ?? "",
                      description:
                        head.metaDescription ??
                        page.meta_description_desired ??
                        "",
                    });
                  }}
                  aria-label="Open in Search Appearance analyzer"
                  title="Open in Search Appearance analyzer"
                  className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <AppWindow className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          >
            <SerpPreview page={page} snapshot={snapshot} device={serpDevice} />
          </SectionCard>
          <PageIntentCard
            key={`${page.id}:${page.updated_at}`}
            page={page}
            brandId={brandId}
            observedTitle={head.title}
            observedDescription={head.metaDescription}
            observedH1={
              headings.all.find((heading) => heading.level === 1)?.text ?? null
            }
            analyzerKeywords={analyzerKeywordSuggestions}
          />
        </div>

        {snapshot ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard
                title={L.social_card}
                collapsible
                anchor="social_card"
                headerExtra={
                  <div className="flex items-center gap-1">
                    <div className="flex items-center rounded-md border border-border">
                      {(
                        [
                          ["x", "X"],
                          ["facebook", "FB"],
                          ["linkedin", "LI"],
                        ] as const
                      ).map(([value, label], index) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSocialPlatform(value)}
                          aria-label={`${label} preview`}
                          title={`${label} preview`}
                          className={cn(
                            "flex h-6 w-7 items-center justify-center text-[10px] font-semibold transition-colors",
                            index === 0 && "rounded-l-[5px]",
                            index === 2 && "rounded-r-[5px]",
                            socialPlatform === value
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const observed = evaluatePageSocialCard(snapshot);
                        openSocialCards({
                          url: observed.url ?? page.url,
                          title: observed.title ?? "",
                          description: observed.description ?? "",
                          image: observed.image ?? "",
                          siteName: observed.siteName ?? "",
                          ogType: observed.ogType ?? "",
                          cardType: observed.cardType ?? "",
                        });
                      }}
                      aria-label="Open in Social Cards analyzer"
                      title="Open in Social Cards analyzer"
                      className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <AppWindow className="h-3.5 w-3.5" />
                    </button>
                  </div>
                }
                copy={webCopy({
                  kind: "web-page-social-card",
                  label: L.social_card,
                  description:
                    "Observed Open Graph and Twitter card tags controlling how shares of this URL render.",
                  surface: `Social share preview — ${page.url}`,
                  data: { url: page.url, og: head.og, twitter: head.twitter },
                  lines: [
                    ["URL", page.url],
                    [
                      "Social title",
                      head.og.title ?? head.twitter.title ?? "none",
                    ],
                    [
                      "Social description",
                      head.og.description ?? head.twitter.description ?? "none",
                    ],
                    [
                      "Share image",
                      head.og.image ?? head.twitter.image ?? "none",
                    ],
                    ["Twitter card", head.twitter.card ?? "none"],
                    ["og:type", head.og.type],
                  ],
                  attributes: { page_id: page.id },
                })}
              >
                <SocialCardPreview
                  snapshot={snapshot}
                  page={page}
                  platform={socialPlatform}
                />
              </SectionCard>
              <SectionCard
                title={L.indexability}
                collapsible
                anchor="indexability"
                copy={webCopy({
                  kind: "web-page-indexability",
                  label: L.indexability,
                  description:
                    "Crawl/indexing signals observed on this page: HTTP status, robots, canonical, redirects.",
                  surface: `Indexability — ${page.url}`,
                  data: {
                    url: page.url,
                    http_status: snapshot.http_status,
                    meta_robots: head.metaRobots,
                    canonical_url: head.canonicalUrl,
                    redirect_chain: extracted.redirectChain,
                    final_url: snapshot.final_url,
                    lang: head.lang,
                  },
                  lines: [
                    ["URL", page.url],
                    ["HTTP status", snapshot.http_status],
                    ["Meta robots", head.metaRobots ?? "not set"],
                    ["Canonical URL", head.canonicalUrl ?? "not set"],
                    [
                      "Redirects",
                      extracted.redirectChain.length > 1
                        ? extracted.redirectChain
                            .map((hop) => `${hop.status ?? "—"} ${hop.url}`)
                            .join(" → ")
                        : "direct",
                    ],
                    ["Final URL", snapshot.final_url ?? page.url],
                  ],
                  attributes: { page_id: page.id },
                })}
              >
                <IndexabilitySection page={page} snapshot={snapshot} />
              </SectionCard>
            </div>
            <div className="grid gap-3 lg:grid-cols-1">
              <PageAnalyzerCard
                page={page}
                state={analyzer.state}
                run={analyzer.run}
              />
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <SectionCard
                title={L.gsc_metrics_28d}
                collapsible
                anchor="gsc_metrics_28d"
                headerExtra={
                  <button
                    type="button"
                    disabled
                    aria-label="Refresh Search Console data for this page"
                    title="A page-scoped Search Console collection command is not available yet"
                    className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                }
                copy={webCopy({
                  kind: "web-page-search-console",
                  label: "Google Search Console",
                  description:
                    "Stored 28-day Google Search Console performance for this canonical page.",
                  surface: `Google Search Console — ${page.url}`,
                  data: {
                    url: page.url,
                    ...searchPerformance,
                    ctr_28d: searchCtr,
                    site_synced_at: site.gsc_synced_at,
                  },
                  lines: [
                    ["URL", page.url],
                    ["Clicks (28d)", searchPerformance.gsc_clicks_28d],
                    [
                      "Impressions (28d)",
                      searchPerformance.gsc_impressions_28d,
                    ],
                    ["CTR (28d)", searchCtr],
                    [
                      "Average position (28d)",
                      searchPerformance.gsc_position_28d,
                    ],
                    ["Site last synced", site.gsc_synced_at],
                  ],
                  attributes: { page_id: page.id },
                })}
              >
                <div className="grid gap-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Search className="h-3.5 w-3.5 text-primary" />
                      Last 28 days
                    </span>
                    <Badge
                      variant={searchPerformance.in_gsc ? "success" : "outline"}
                    >
                      {searchPerformance.in_gsc ? "Reporting" : "No page data"}
                    </Badge>
                  </div>
                  <CondensedFieldGrid
                    fields={[
                      {
                        label: "Clicks",
                        value:
                          searchPerformance.gsc_clicks_28d?.toLocaleString() ??
                          "—",
                      },
                      {
                        label: "Impressions",
                        value:
                          searchPerformance.gsc_impressions_28d?.toLocaleString() ??
                          "—",
                      },
                      {
                        label: "CTR",
                        value:
                          searchCtr === null
                            ? "—"
                            : `${(searchCtr * 100).toFixed(2)}%`,
                      },
                      {
                        label: "Average position",
                        value:
                          searchPerformance.gsc_position_28d?.toFixed(1) ?? "—",
                      },
                    ]}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Site collection last completed{" "}
                    {formatDate(site.gsc_synced_at)}. The existing refresh
                    command syncs the whole site, so it is intentionally not
                    presented here as a page-only refresh.
                  </p>
                </div>
              </SectionCard>
              <PagespeedCard page={page} />
              <PageAnalyticsCard page={page} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard
                title={L.headings_outline}
                collapsible
                anchor="headings_outline"
                copy={webCopy({
                  kind: "web-page-headings",
                  label: "Headings outline",
                  description:
                    "The observed heading structure (h1–h6) of this page, in document order.",
                  surface: `Headings outline — ${page.url}`,
                  data: { url: page.url, headings: headings.all },
                  lines: [
                    ["URL", page.url],
                    ["H1 count", headings.h1Count],
                    ...headings.all.map((heading): [string, string] => [
                      `h${heading.level}`,
                      heading.text,
                    ]),
                  ],
                  attributes: { page_id: page.id, count: headings.all.length },
                })}
              >
                <HeadingsOutline snapshot={snapshot} />
              </SectionCard>
              <SectionCard
                title={L.content_stats}
                collapsible
                anchor="content_stats"
                copy={webCopy({
                  kind: "web-page-content-stats",
                  label: "Content stats",
                  description:
                    "Quantitative content signals from this page's latest snapshot.",
                  surface: `Content stats — ${page.url}`,
                  data: {
                    url: page.url,
                    word_count: snapshot.word_count,
                    extracted: snapshot.extracted,
                    links_summary: snapshot.links_summary,
                    images: snapshot.images,
                    captured_at: snapshot.captured_at,
                  },
                  lines: [
                    ["URL", page.url],
                    ["Words", snapshot.word_count],
                    ["Sentences", extracted.sentenceCount],
                    ["Flesch reading ease", extracted.fleschReadingEase],
                    ["Captured", formatDate(snapshot.captured_at)],
                  ],
                  attributes: { page_id: page.id },
                })}
              >
                <ContentStats snapshot={snapshot} />
              </SectionCard>
            </div>
            {snapshot.markdown_file_id ? (
              <PageContentCard
                page={page}
                markdownFileId={snapshot.markdown_file_id}
                getPageScope={getScope}
              />
            ) : null}
          </>
        ) : (
          <section className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
            <FileQuestion className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              This canonical URL exists independently, but nothing has produced
              an accepted snapshot yet — observed content sections appear after
              the first capture.
            </p>
            <FetchPageButton siteId={site.id} url={page.url} pageId={page.id} />
          </section>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <PageQueriesCard page={page} />
          <PageFindingsCard page={page} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <PageLinksCard page={page} />
          <PageBacklinksCard page={page} />
        </div>

        <SitemapMembershipsCard page={page} />

          <PageCapturesCard page={page} />
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}
