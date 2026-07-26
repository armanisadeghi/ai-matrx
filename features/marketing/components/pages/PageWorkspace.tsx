"use client";

import { useEffect, useState } from "react";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import Link from "next/link";
import {
  AlertTriangle,
  AppWindow,
  BrainCircuit,
  CheckCircle,
  Download,
  FileCode2,
  FileQuestion,
  FileText,
  Gauge,
  History,
  ImageOff,
  LineChart,
  Loader2,
  Monitor,
  OctagonAlert,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { PageContentCard } from "@/features/marketing/components/pages/PageContentCard";
import { FetchPageButton } from "@/features/marketing/components/pages/FetchPageButton";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import {
  marketingKeys,
  useDeleteScreenshot,
  usePagePerformance,
  usePageScreenshots,
  usePageSitemapMemberships,
  usePageWebAnalytics,
  usePageWorkspace,
  useUpdatePageIntent,
} from "@/features/marketing/data/hooks";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePageAnalyzer,
  type PageAnalyzerState,
} from "@/features/marketing/components/pages/usePageAnalyzer";
import type {
  MarketingPage,
  PageSnapshot,
  SiteScreenshot,
} from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  buildMarketingPageScope,
  captureAvailability,
  evaluatePageIndexability,
  evaluatePageSocialCard,
  latestPagespeedByStrategy,
  MARKETING_PAGE_SURFACE_NAME,
  pageCaptureRows,
  rawSocialTags,
  webAnalyticsTotals,
} from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import {
  surfaceGroupLabels,
  surfaceValueLabels,
} from "@/features/surfaces/utils/surface-display";
import { SerpResult, type SerpDevice } from "@/features/marketing/seo/serp/SerpResult";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import { MetaRecommendations } from "@/features/marketing/seo/serp/MetaRecommendations";
import {
  evaluateMetaTitle,
  evaluateMetaDescription,
  type MetaEvaluation,
} from "@/features/marketing/seo/serp/metrics";
import { useOpenSerpAnalyzerWindow } from "@/features/overlays/openers/serpAnalyzerWindow";
import { useOpenSocialCardWindow } from "@/features/overlays/openers/socialCardAnalyzerWindow";
import {
  evaluateHeadingStructure,
  headingInputsFromRaw,
} from "@/features/marketing/seo/audit/headings";
import { type IndexabilityEvaluation } from "@/features/marketing/seo/audit/indexability";
import { evaluateUrlQuality } from "@/features/marketing/seo/audit/url-quality";
import { AuditIssueList } from "@/features/marketing/seo/audit/AuditIssueList";
import {
  SocialCard,
  parseSocialDomain,
  type SocialPlatform,
} from "@/features/marketing/seo/social/SocialCard";
import { isJsonRecord } from "@/features/marketing/types";
import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
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
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import { syncPagespeed } from "@/features/marketing/pagespeed/data";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);
const G = surfaceGroupLabels(marketingPageManifest);

function IntentForm({
  page,
  observedTitle,
  observedDescription,
}: {
  page: MarketingPage;
  observedTitle: string | null;
  observedDescription: string | null;
}) {
  const mutation = useUpdatePageIntent();
  const [keyword, setKeyword] = useState(page.target_keyword ?? "");
  const [title, setTitle] = useState(page.meta_title_desired ?? "");
  const [description, setDescription] = useState(
    page.meta_description_desired ?? "",
  );
  const dirty =
    keyword !== (page.target_keyword ?? "") ||
    title !== (page.meta_title_desired ?? "") ||
    description !== (page.meta_description_desired ?? "");

  // Live verdict on the editorial draft — same deterministic evaluator the
  // scraper and the Search Appearance analyzer use.
  const draftTitleEval = title.trim() ? evaluateMetaTitle(title) : null;
  const draftDescEval = description.trim()
    ? evaluateMetaDescription(description)
    : null;

  const save = async () => {
    try {
      await mutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        targetKeyword: keyword.trim() || null,
        desiredMetaTitle: title.trim() || null,
        desiredMetaDescription: description.trim() || null,
      });
      toast.success("Page intent saved");
    } catch (error) {
      toast.error("Could not save page intent", {
        description: extractErrorMessage(error),
      });
    }
  };

  const useObservedMetadata = () => {
    setTitle(observedTitle ?? "");
    setDescription(observedDescription ?? "");
    toast.success("Current metadata copied into page intent");
  };

  const copy = webCopy({
    kind: "web-page-intent",
    label: G.page_intent,
    description:
      "The user-owned editorial intent for this page (target keyword + desired metadata).",
    surface: `Page intent — ${page.url}`,
    data: {
      url: page.url,
      target_keyword: page.target_keyword,
      meta_title_desired: page.meta_title_desired,
      meta_description_desired: page.meta_description_desired,
      seo_metrics_desired: page.seo_metrics_desired,
    },
    lines: [
      ["URL", page.url],
      [L.target_keyword, page.target_keyword ?? "not set"],
      ["Desired title", page.meta_title_desired ?? "not set"],
      ["Desired description", page.meta_description_desired ?? "not set"],
    ],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title={G.page_intent}
      copy={copy}
      collapsible
      anchor="page_intent"
      headerExtra={
        <button
          type="button"
          onClick={useObservedMetadata}
          disabled={!observedTitle && !observedDescription}
          aria-label="Fill intent from current page metadata"
          title="Fill desired title and description from the latest captured page"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="grid gap-3 p-3">
        <div className="space-y-1.5" data-surface-value="target_keyword">
          <Label htmlFor="target-keyword" className="text-xs">
            {L.target_keyword}
          </Label>
          <Input
            id="target-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Primary search intent"
          />
        </div>
        <div className="space-y-1.5" data-surface-value="desired_title">
          <div className="flex items-center justify-between">
            <Label htmlFor="desired-title" className="text-xs">
              {L.desired_title}
            </Label>
            {draftTitleEval ? (
              <SerpFieldChips
                chars={draftTitleEval.charCount}
                pixels={draftTitleEval.pixelWidth}
                ok={draftTitleEval.ok}
              />
            ) : (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                0 characters
              </span>
            )}
          </div>
          <Input
            id="desired-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Editorial target, separate from observed content"
          />
        </div>
        <div className="space-y-1.5" data-surface-value="desired_description">
          <div className="flex items-center justify-between">
            <Label htmlFor="desired-description" className="text-xs">
              {L.desired_description}
            </Label>
            {draftDescEval ? (
              <SerpFieldChips
                chars={draftDescEval.charCount}
                pixels={draftDescEval.pixelWidth}
                ok={draftDescEval.ok}
              />
            ) : (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                0 characters
              </span>
            )}
          </div>
          <Textarea
            id="desired-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minHeight={86}
            maxHeight={160}
            placeholder="Editorial target, separate from observed content"
          />
        </div>
        {draftTitleEval?.issues.length || draftDescEval?.issues.length ? (
          <MetaRecommendations
            titleEval={draftTitleEval}
            descriptionEval={draftDescEval}
            issuesOnly
            compact
          />
        ) : null}
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8"
            disabled={!dirty || mutation.isPending}
            onClick={() => void save()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save intent
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** Observed vs desired: the editorial diff line under the SERP preview. */
function IntentDiffRow({
  label,
  observed,
  desired,
  metrics,
}: {
  label: string;
  observed: string | null;
  desired: string | null;
  /** Deterministic evaluation of the DESIRED value (null when unset). */
  metrics: MetaEvaluation | null;
}) {
  const state = !desired ? "none" : observed === desired ? "match" : "differs";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {state === "match" ? (
          <Badge variant="success" className="text-[10px]">
            Matches
          </Badge>
        ) : state === "differs" ? (
          <Badge variant="warning" className="text-[10px]">
            Differs from live
          </Badge>
        ) : null}
        {desired && metrics ? (
          <SerpFieldChips
            chars={metrics.charCount}
            pixels={metrics.pixelWidth}
            ok={metrics.ok}
          />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-0.5 break-words text-xs",
          state === "none" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {desired || "No editorial target set"}
      </p>
    </div>
  );
}

/**
 * Search result preview — renders the canonical SerpResult (features/marketing/seo/serp)
 * for the OBSERVED metadata with a desktop/mobile toggle, deterministic
 * pixel/char chips, the observed-vs-desired editorial diff, and condensed
 * recommendations. The section header carries the "open in Search Appearance"
 * window-panel launcher.
 */
function SerpPreview({
  page,
  snapshot,
  device,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot | null;
  device: SerpDevice;
}) {
  const head = snapshot
    ? parseSnapshotHeadTags(snapshot.head_tags)
    : parseSnapshotHeadTags(null);
  const title = head.title;
  const description = head.metaDescription;

  const titleEval = title ? evaluateMetaTitle(title) : null;
  const descEval = description ? evaluateMetaDescription(description) : null;
  const desiredTitleEval = page.meta_title_desired
    ? evaluateMetaTitle(page.meta_title_desired)
    : null;
  const desiredDescEval = page.meta_description_desired
    ? evaluateMetaDescription(page.meta_description_desired)
    : null;

  return (
    <div className="grid gap-3 p-3">
      <div className="rounded-lg border border-border bg-background px-4 py-3">
        <SerpResult
          url={page.url}
          title={title ?? undefined}
          description={description ?? undefined}
          device={device}
          density="compact"
          placeholderTitle="No observed title"
          placeholderDescription="No observed meta description — search engines will improvise one."
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2">
          <span data-surface-value="observed_title">
            {titleEval ? (
              <SerpFieldChips
                prefix="Title"
                chars={titleEval.charCount}
                pixels={titleEval.pixelWidth}
                ok={titleEval.ok}
              />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Title —
              </span>
            )}
          </span>
          <span data-surface-value="observed_description">
            {descEval ? (
              <SerpFieldChips
                prefix="Description"
                chars={descEval.charCount}
                pixels={descEval.pixelWidth}
                ok={descEval.ok}
              />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Description —
              </span>
            )}
          </span>
        </div>
      </div>

      {titleEval?.issues.length || descEval?.issues.length ? (
        <MetaRecommendations
          titleEval={titleEval}
          descriptionEval={descEval}
          issuesOnly
          compact
        />
      ) : null}

      <div className="grid gap-2.5">
        <IntentDiffRow
          label={L.desired_title}
          observed={title}
          desired={page.meta_title_desired}
          metrics={desiredTitleEval}
        />
        <IntentDiffRow
          label={L.desired_description}
          observed={description}
          desired={page.meta_description_desired}
          metrics={desiredDescEval}
        />
      </div>
    </div>
  );
}

/**
 * Social share preview — canonical platform-faithful cards (features/marketing/seo/
 * social) for the OBSERVED share tags, with a platform toggle and the
 * deterministic checks (features/marketing/seo/audit, exact parity with the scraper's
 * crawl-time `audit_metrics.social`).
 */
function SocialCardPreview({
  snapshot,
  page,
  platform,
}: {
  snapshot: PageSnapshot;
  page: MarketingPage;
  platform: SocialPlatform;
}) {
  // The SAME deterministic evaluation the surface scope emits (social_card).
  const evaluation = evaluatePageSocialCard(snapshot);

  return (
    <div className="grid gap-3 p-3">
      <SocialCard
        platform={platform}
        title={evaluation.title}
        description={evaluation.description}
        image={evaluation.image}
        domain={parseSocialDomain(evaluation.url ?? page.url)}
        cardType={evaluation.cardType ?? "summary"}
        className="max-w-md"
      />
      <p className="text-[10px] text-muted-foreground">
        {evaluation.cardType
          ? `Twitter card: ${evaluation.cardType}`
          : "No Twitter card tag"}
        {evaluation.ogType ? ` · og:type ${evaluation.ogType}` : ""}
        {evaluation.titleSource === "twitter"
          ? " · title from twitter:title"
          : ""}
      </p>
      <AuditIssueList
        issues={evaluation.issues}
        successText="Share tags look great — title, image, description, card type, and canonical link are all present."
        compact
      />
    </div>
  );
}

/** One deterministic verdict pill: Indexable / Needs review / Blocked. */
function IndexabilityVerdictBanner({
  evaluation,
}: {
  evaluation: IndexabilityEvaluation;
}) {
  const tone =
    evaluation.verdict === "indexable"
      ? "border-success/40 bg-success/10 text-success"
      : evaluation.verdict === "check"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  const Icon =
    evaluation.verdict === "indexable"
      ? CheckCircle
      : evaluation.verdict === "check"
        ? AlertTriangle
        : OctagonAlert;
  const label =
    evaluation.verdict === "indexable"
      ? "Indexable"
      : evaluation.verdict === "check"
        ? "Needs review"
        : "Blocked from Google";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        tone,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-semibold">{label}</span>
      <span className="ml-auto text-[10px] opacity-80">
        {evaluation.issues.length
          ? `${evaluation.issues.length} signal${evaluation.issues.length === 1 ? "" : "s"}`
          : "All signals clean"}
      </span>
    </div>
  );
}

function IndexabilitySection({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const head = parseSnapshotHeadTags(snapshot.head_tags);
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  // Deterministic verdict — the SAME evaluation the surface scope emits
  // (indexability), identical to the scraper's crawl-time
  // `audit_metrics.indexability` by construction.
  const evaluation = evaluatePageIndexability(page, snapshot);
  const noindex = evaluation.noindex;
  const canonicalMismatch = evaluation.canonicalMatches === false;
  // URL quality needs no crawl data — always computed live from the URL.
  const urlQuality = evaluateUrlQuality(page.url);
  return (
    <div className="grid gap-3 p-3">
      <IndexabilityVerdictBanner evaluation={evaluation} />
      <AuditIssueList issues={evaluation.issues} compact />
      <AuditIssueList issues={urlQuality.issues} compact />
      <CondensedFieldGrid
        fields={[
          {
            label: L.http_status,
            value: snapshot.http_status ?? "—",
            tone:
              snapshot.http_status !== null && snapshot.http_status >= 400
                ? "bad"
                : "default",
          },
          {
            label: "Meta robots",
            value: head.metaRobots ?? "Not set",
            tone: noindex ? "bad" : "default",
          },
          {
            label: "Canonical URL",
            value: head.canonicalUrl ?? "Not set",
            tone: canonicalMismatch ? "warning" : "default",
            span: 2,
          },
          {
            label: "Redirect chain",
            value:
              extracted.redirectChain.length > 1 ? (
                <span className="grid gap-0.5">
                  {extracted.redirectChain.map((hop, index) => (
                    <span
                      key={`${hop.url}:${index}`}
                      className="break-all font-mono text-[11px]"
                    >
                      {hop.status ?? "—"} · {hop.url}
                    </span>
                  ))}
                </span>
              ) : (
                "Direct — no redirects"
              ),
            tone: extracted.redirectChain.length > 1 ? "warning" : "default",
            span: 2,
          },
          {
            label: "Final URL",
            value: snapshot.final_url ?? page.url,
            span: 2,
          },
          { label: "Language", value: head.lang ?? "Not declared" },
        ]}
      />
    </div>
  );
}

function HeadingsOutline({ snapshot }: { snapshot: PageSnapshot }) {
  // Evaluate the RAW headings JSON (keeps empty-text entries the display
  // parser drops) — identical to the scraper's `audit_metrics.headings`.
  const rawHeadings = isJsonRecord(snapshot.headings)
    ? headingInputsFromRaw(snapshot.headings.all)
    : [];
  const evaluation = evaluateHeadingStructure(rawHeadings);
  if (rawHeadings.length === 0) {
    return (
      <div className="grid gap-2 p-4">
        <AuditIssueList issues={evaluation.issues} compact />
      </div>
    );
  }
  // Mark outline rows involved in a skipped-level transition so the warning
  // is visible in place, not just in the issue list.
  const skipsAfter = new Set<number>();
  for (let i = 1; i < rawHeadings.length; i += 1) {
    if (rawHeadings[i].level > rawHeadings[i - 1].level + 1) skipsAfter.add(i);
  }
  return (
    <div className="grid gap-2.5 p-3">
      <AuditIssueList
        issues={evaluation.issues}
        successText={`Clean outline — ${evaluation.total} headings, exactly one H1, no skipped levels.`}
        compact
      />
      <ol className="grid max-h-80 gap-1 overflow-y-auto">
        {rawHeadings.map((heading, index) => (
          <li
            key={`${heading.level}:${index}`}
            className="flex min-w-0 items-baseline gap-2 text-xs"
            style={{ paddingLeft: `${(heading.level - 1) * 14}px` }}
          >
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] uppercase",
                heading.level === 1
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
              )}
            >
              h{heading.level}
            </span>
            <span
              className={cn(
                "truncate",
                !heading.text.trim()
                  ? "italic text-muted-foreground"
                  : heading.level === 1
                    ? "font-medium text-foreground"
                    : "text-foreground/90",
              )}
            >
              {heading.text.trim() || "(empty heading)"}
            </span>
            {skipsAfter.has(index) ? (
              <Badge variant="warning" className="shrink-0 text-[9px]">
                skipped level
              </Badge>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ContentStats({ snapshot }: { snapshot: PageSnapshot }) {
  const openFilePreview = useOpenFilePreviewWindow();
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  const links = parseSnapshotLinksSummary(snapshot.links_summary);
  const images = parseSnapshotImages(snapshot.images);
  return (
    <div className="p-3">
      <CondensedFieldGrid
        fields={[
          {
            label: L.word_count,
            value: snapshot.word_count?.toLocaleString() ?? "—",
          },
          {
            label: "Sentences",
            value: extracted.sentenceCount?.toLocaleString() ?? "—",
          },
          {
            label: "Flesch reading ease",
            value:
              extracted.fleschReadingEase === null
                ? "—"
                : extracted.fleschReadingEase.toFixed(1),
            tone:
              extracted.fleschReadingEase !== null &&
              extracted.fleschReadingEase < 30
                ? "warning"
                : "default",
          },
          {
            label: "Links",
            value:
              links.total === null
                ? "—"
                : `${links.total.toLocaleString()} (${links.internal ?? 0} internal · ${links.external ?? 0} external)`,
          },
          {
            label: "Images",
            value:
              images.count === null
                ? "—"
                : `${images.count.toLocaleString()}${images.missingAlt ? ` · ${images.missingAlt} missing alt` : ""}`,
            tone: images.missingAlt ? "warning" : "default",
          },
          { label: L.snapshot_captured_at, value: formatDate(snapshot.captured_at) },
        ]}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {snapshot.body_file_id ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => openFilePreview({ fileId: snapshot.body_file_id })}
          >
            <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
            Captured HTML
          </Button>
        ) : null}
        {snapshot.markdown_file_id ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() =>
              openFilePreview({ fileId: snapshot.markdown_file_id })
            }
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Extracted Markdown
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SitemapMembershipsCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const memberships = usePageSitemapMemberships(site.id, page.id);
  const rows = memberships.data ?? [];
  const copy = webCopy({
    kind: "web-page-sitemap-memberships",
    label: L.sitemap_memberships,
    description: "Which sitemap documents advertise this canonical URL.",
    surface: `Sitemap memberships — ${page.url}`,
    data: rows,
    lines: [
      ["URL", page.url],
      ["Sitemaps advertising this URL", rows.length],
      ...rows.map((membership): [string, string] => [
        "Sitemap",
        `${membership.sitemap.url} (last seen ${formatDate(membership.last_seen)})`,
      ]),
    ],
    attributes: { page_id: page.id, count: rows.length },
  });

  let body: React.ReactNode;
  if (memberships.isLoading) {
    body = (
      <div className="m-3 h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (memberships.isError) {
    body = (
      <QueryError
        error={memberships.error}
        onRetry={() => void memberships.refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="p-4 text-xs text-muted-foreground">
        No sitemap advertises this URL — it was found another way.
      </p>
    );
  } else {
    body = (
      <ul className="divide-y divide-border">
        {rows.map((membership) => (
          <li
            key={membership.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <Link
              href={`${sitePath}/sitemaps/${membership.sitemap.id}`}
              className="min-w-0 flex-1 basis-56 truncate font-mono text-xs text-foreground hover:text-primary"
            >
              {membership.sitemap.url}
            </Link>
            <span className="text-[11px] text-muted-foreground">
              {membership.lastmod
                ? `lastmod ${formatDate(membership.lastmod)}`
                : "no lastmod"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              seen {formatDate(membership.last_seen)}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <SectionCard
      title={L.sitemap_memberships}
      copy={copy}
      collapsible
      anchor="sitemap_memberships"
    >
      {body}
    </SectionCard>
  );
}

/** Current capture per kind + per-page capture history, canonical file viewer on click. */
function PageCapturesCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const pageId = page.id;
  const screenshots = usePageScreenshots(site.id, pageId);
  const deleteMutation = useDeleteScreenshot(site.id);
  const openFilePreview = useOpenFilePreviewWindow();
  const [deleting, setDeleting] = useState<SiteScreenshot | null>(null);

  // Same row filter + desktop/mobile classification the surface scope emits
  // (captures / has_desktop_capture / has_mobile_capture).
  const rows = pageCaptureRows(screenshots.data);
  const { hasDesktopCapture, hasMobileCapture } = captureAvailability(rows);

  // Rows arrive newest-first; the first row per kind is the current capture.
  const byKind = new Map<string, (SiteScreenshot & { file_id: string })[]>();
  for (const row of rows) {
    const list = byKind.get(row.kind) ?? [];
    list.push(row);
    byKind.set(row.kind, list);
  }

  const copy = webCopy({
    kind: "web-page-captures",
    label: "Page captures",
    description:
      "Visual capture records for this page (current per kind + history); file_id values open via the canonical file viewer.",
    surface: `Captures — ${page.url}`,
    data: rows,
    lines: [
      ["URL", page.url],
      ["Captures", rows.length],
      ...[...byKind.entries()].map(([kind, captures]): [string, string] => [
        kind,
        `current as of ${formatDate(captures[0].captured_at)} (${captures.length} total)`,
      ]),
    ],
    attributes: { page_id: pageId, count: rows.length },
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Capture deleted");
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete capture", {
        description: extractErrorMessage(error),
      });
    }
  };

  let body: React.ReactNode;
  if (screenshots.isLoading) {
    body = (
      <div className="m-3 h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (screenshots.isError) {
    body = (
      <QueryError
        error={screenshots.error}
        onRetry={() => void screenshots.refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        No captures exist for this page yet — they are stored by site
        initialization and screenshot-enabled crawls.
      </p>
    );
  } else {
    body = (
      <div className="grid gap-4 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              hasDesktopCapture
                ? "border-border bg-muted/30 text-foreground"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
            {hasDesktopCapture ? "Desktop captured" : "Desktop not captured"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              hasMobileCapture
                ? "border-border bg-muted/30 text-foreground"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            {hasMobileCapture ? "Mobile captured" : "Mobile not captured"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byKind.entries()].map(([kind, captures]) => {
            const current = captures[0];
            return (
              <div key={kind} className="min-w-0">
                <CaptureThumb
                  fileId={current.file_id}
                  alt={`${kind} capture as of ${formatDate(current.captured_at)}`}
                  footer={
                    <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium capitalize">{kind}</span>
                      <span className="text-muted-foreground">
                        as of {formatDate(current.captured_at)}
                      </span>
                    </div>
                  }
                />
                {captures.length > 1 ? (
                  <ul className="mt-1.5 grid gap-1">
                    {captures.slice(1).map((capture) => (
                      <li
                        key={capture.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px]"
                      >
                        <button
                          type="button"
                          className="truncate text-left text-foreground hover:text-primary"
                          onClick={() =>
                            openFilePreview({ fileId: capture.file_id })
                          }
                          title="Open in file viewer"
                        >
                          as of {formatDate(capture.captured_at)}
                          {capture.width && capture.height
                            ? ` · ${capture.width}×${capture.height}`
                            : ""}
                        </button>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {capture.snapshot_id ? (
                            <Link
                              href={`${sitePath}/pages/${pageId}/snapshots/${capture.snapshot_id}`}
                              className="text-muted-foreground hover:text-primary"
                            >
                              Snapshot
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            title="Delete capture"
                            onClick={() => setDeleting(capture)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete capture?"
          description="The capture record moves to trash. The stored file itself is not destroyed."
          variant="destructive"
          confirmLabel="Delete capture"
          busy={deleteMutation.isPending}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    );
  }
  return (
    <SectionCard title={L.captures} copy={copy} collapsible anchor="captures">
      {body}
    </SectionCard>
  );
}

/**
 * Page Analyzer (WS-11 / M-53) — runs the registered Page Analyzer system
 * agent for this canonical page (POST /seo/pages/analyze, durable streamed
 * command) and renders its keyword picture: inferred primary keyword,
 * supporting/discovered keywords, content role, funnel position, and
 * content gaps. Replaces the former "Matrx Analysis" / "Matrx Suggestions"
 * placeholders.
 */
function PageAnalyzerCard({
  page,
  state,
  run,
}: {
  page: MarketingPage;
  /** Lifted analyzer state (PageWorkspace owns the hook so the surface scope
   * emits the same artifact this card renders — `page_analyzer`). */
  state: PageAnalyzerState;
  run: (forceRefresh: boolean) => Promise<void>;
}) {
  const artifact = state.result?.artifact;

  const copy = webCopy({
    kind: "web-page-analyzer",
    label: "Page Analyzer",
    description:
      "AI-derived keyword picture for this page: inferred primary keyword, supporting/discovered keywords, content role, and content gaps.",
    surface: `Page Analyzer — ${page.url}`,
    data: artifact ?? { status: state.status },
    lines: artifact
      ? [
          ["URL", page.url],
          ["Inferred primary keyword", artifact.inferred_primary_keyword.phrase],
          ["Content role", artifact.content_role],
          ["Funnel position", artifact.funnel_position],
          ["Declared vs actual", artifact.declared_vs_actual.status],
          ...artifact.gaps.map((g): [string, string] => ["Gap", `${g.severity}: ${g.gap}`]),
        ]
      : [["URL", page.url], ["Status", "Not yet analyzed"]],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title={L.page_analyzer}
      copy={copy}
      collapsible
      anchor="page_analyzer"
      headerExtra={
        <button
          type="button"
          onClick={() => void run(state.status === "done")}
          disabled={state.status === "running"}
          aria-label="Run Page Analyzer"
          title="Run the Page Analyzer agent for this page"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      }
    >
      <div className="grid gap-3 p-3">
        {state.status === "idle" ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BrainCircuit className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">Not yet analyzed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run the Page Analyzer to infer this page&apos;s keyword picture from its
                stored content, GSC queries, and site context.
              </p>
            </div>
          </div>
        ) : null}
        {state.status === "running" ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {state.stage ?? "Running…"}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
        {artifact ? (
          <>
            <CondensedFieldGrid
              fields={[
                { label: "Primary keyword", value: artifact.inferred_primary_keyword.phrase, span: 2 },
                { label: "Content role", value: artifact.content_role },
                { label: "Funnel position", value: artifact.funnel_position },
                {
                  label: "Declared vs actual",
                  value: artifact.declared_vs_actual.status,
                  tone: artifact.declared_vs_actual.status === "aligned" ? "good" : "warning",
                },
              ]}
            />
            {artifact.supported_keywords.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Supporting keywords
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {artifact.supported_keywords.map((k) => (
                    <Badge key={k.phrase} variant="outline" className="text-[10px]">
                      {k.phrase}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {artifact.discovered_keywords.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Discovered keywords
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {artifact.discovered_keywords.map((k) => (
                    <Badge key={k.phrase} variant="secondary" className="text-[10px]">
                      {k.phrase}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {artifact.gaps.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Content gaps
                </p>
                <ul className="mt-1 grid gap-1">
                  {artifact.gaps.map((gap) => (
                    <li key={gap.gap} className="flex items-start gap-1.5 text-xs">
                      <Badge
                        variant={gap.severity === "high" ? "warning" : "outline"}
                        className="mt-0.5 shrink-0 text-[9px]"
                      >
                        {gap.severity}
                      </Badge>
                      <span className="text-foreground/90">{gap.gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

/**
 * PageSpeed Insights (M-74/M-75, WS-12) — runs a REAL PSI collection for this
 * canonical page's URL (POST /seo/pages/{page_id}/pagespeed/sync, detached
 * NDJSON through the canonical run_collection funnel) and renders the
 * persisted seo.page_performance rows: lab (Lighthouse) scores + CWV, and
 * field (CrUX) data when Google has enough real-user traffic for the page.
 * Replaces the former disabled placeholder.
 */
function PagespeedCard({ page }: { page: MarketingPage }) {
  const queryClient = useQueryClient();
  // Shared query cache — the PageWorkspace surface scope (pagespeed) reads
  // the exact same rows this card renders.
  const performance = usePagePerformance(page.site_id, page.id);
  const rows = performance.data ?? null;
  const loading = performance.isLoading;
  const loadError = performance.isError
    ? extractErrorMessage(performance.error)
    : null;
  const [syncingStrategy, setSyncingStrategy] = useState<
    "mobile" | "desktop" | null
  >(null);

  const runSync = async (strategy: "mobile" | "desktop") => {
    setSyncingStrategy(strategy);
    try {
      await syncPagespeed(page.id, strategy);
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.page(page.site_id, page.id), "pagespeed"],
      });
      toast.success(`PageSpeed Insights synced (${strategy})`);
    } catch (error) {
      toast.error("PageSpeed Insights sync failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSyncingStrategy(null);
    }
  };

  // Same latest-per-strategy selection the surface scope emits.
  const latestByStrategy = latestPagespeedByStrategy(rows);

  const scoreTone = (value: number | null): "good" | "warning" | "bad" | "default" => {
    if (value === null) return "default";
    if (value >= 0.9) return "good";
    if (value >= 0.5) return "warning";
    return "bad";
  };

  return (
    <SectionCard
      title={L.pagespeed}
      collapsible
      anchor="pagespeed"
      headerExtra={
        <div className="flex items-center gap-1">
          {(["mobile", "desktop"] as const).map((strategy) => (
            <button
              key={strategy}
              type="button"
              onClick={() => void runSync(strategy)}
              disabled={syncingStrategy !== null}
              aria-label={`Run PageSpeed Insights (${strategy})`}
              title={`Run a real PageSpeed Insights collection (${strategy})`}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncingStrategy === strategy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {strategy}
            </button>
          ))}
        </div>
      }
      copy={webCopy({
        kind: "web-page-pagespeed",
        label: L.pagespeed,
        description:
          "Persisted Lighthouse lab scores and CrUX field data for this page (desktop + mobile).",
        surface: `PageSpeed Insights — ${page.url}`,
        data: rows ?? [],
        lines: [
          ["URL", page.url],
          ...[...latestByStrategy.entries()].map(([strategy, row]): [string, string] => [
            `${strategy} performance`,
            row.performance_score === null ? "—" : `${Math.round(row.performance_score * 100)}`,
          ]),
        ],
        attributes: { page_id: page.id },
      })}
    >
      <div className="grid gap-3 p-3">
        {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
        {loading && !rows ? (
          <div className="h-32 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">No evidence yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run a mobile or desktop PageSpeed Insights collection to persist
                lab (Lighthouse) and field (CrUX) evidence for this page.
              </p>
            </div>
          </div>
        ) : null}
        {["mobile", "desktop"].map((strategy) => {
          const row = latestByStrategy.get(strategy);
          if (!row) return null;
          const metrics = row.lighthouse?.metrics ?? {};
          const lcp = metrics.lcp_ms?.numeric_value;
          const cls = metrics.cls?.numeric_value;
          const inp = metrics.inp_ms?.numeric_value;
          const fieldCategory =
            row.crux?.page?.overall_category ?? row.crux?.origin?.overall_category ?? null;
          return (
            <div key={strategy} className="rounded-lg border border-border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium capitalize text-foreground">
                  {strategy === "mobile" ? (
                    <Smartphone className="h-3.5 w-3.5" />
                  ) : (
                    <Monitor className="h-3.5 w-3.5" />
                  )}
                  {strategy}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(row.observed_at)}
                </span>
              </div>
              <CondensedFieldGrid
                fields={[
                  {
                    label: "Performance",
                    value:
                      row.performance_score === null
                        ? "—"
                        : Math.round(row.performance_score * 100),
                    tone: scoreTone(row.performance_score),
                  },
                  {
                    label: "Accessibility",
                    value:
                      row.accessibility_score === null
                        ? "—"
                        : Math.round(row.accessibility_score * 100),
                    tone: scoreTone(row.accessibility_score),
                  },
                  {
                    label: "Best practices",
                    value:
                      row.best_practices_score === null
                        ? "—"
                        : Math.round(row.best_practices_score * 100),
                    tone: scoreTone(row.best_practices_score),
                  },
                  {
                    label: "SEO",
                    value: row.seo_score === null ? "—" : Math.round(row.seo_score * 100),
                    tone: scoreTone(row.seo_score),
                  },
                  {
                    label: "LCP (lab)",
                    value:
                      typeof lcp === "number" ? `${(lcp / 1000).toFixed(2)}s` : "—",
                  },
                  {
                    label: "CLS (lab)",
                    value: typeof cls === "number" ? cls.toFixed(3) : "—",
                  },
                  {
                    label: "INP (lab)",
                    value: typeof inp === "number" ? `${Math.round(inp)}ms` : "—",
                  },
                  {
                    label: "Field data (CrUX)",
                    value: fieldCategory ?? "Not available",
                    tone: fieldCategory === "FAST" ? "good" : "default",
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/**
 * Google Analytics (M-74, WS-12) — this page's persisted GA4 landing-page
 * rows (`seo.web_analytics_daily.page_id`). GA4 collection is site-scoped
 * (one property per site), so the sync button here triggers the same
 * whole-site collection the site settings card does, then re-reads this
 * page's slice. Replaces the former disabled placeholder.
 */
function PageAnalyticsCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const queryClient = useQueryClient();
  // Shared query cache — the PageWorkspace surface scope (ga4_metrics) reads
  // the exact same rows this card renders.
  const analytics = usePageWebAnalytics(site.id, page.id);
  const rows = analytics.data ?? null;
  const loading = analytics.isLoading;
  const loadError = analytics.isError
    ? extractErrorMessage(analytics.error)
    : null;
  const [syncing, setSyncing] = useState(false);
  const integrations = parseSiteIntegrations(site.integrations);
  const ga4Enabled = integrations.googleAnalytics4.enabled;

  const runSync = async () => {
    setSyncing(true);
    try {
      await syncSiteAnalytics(site.id);
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.page(site.id, page.id), "web-analytics"],
      });
      toast.success("Google Analytics synced");
    } catch (error) {
      toast.error("Google Analytics sync failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  // Same totals math the surface scope emits.
  const { engagementRate, ...totals } = webAnalyticsTotals(rows);

  return (
    <SectionCard
      title={L.ga4_metrics}
      collapsible
      anchor="ga4_metrics"
      headerExtra={
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing || !ga4Enabled}
          aria-label="Sync Google Analytics"
          title={
            ga4Enabled
              ? "Run a GA4 landing-page collection for this site"
              : "Bind a Google Analytics 4 property to this site first"
          }
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      }
      copy={webCopy({
        kind: "web-page-google-analytics",
        label: L.ga4_metrics,
        description: "Persisted GA4 landing-page traffic for this canonical page.",
        surface: `Google Analytics — ${page.url}`,
        data: { url: page.url, enabled: ga4Enabled, totals },
        lines: [
          ["URL", page.url],
          ["Integration enabled", ga4Enabled ? "yes" : "no"],
          ["Sessions (stored window)", totals.sessions],
          ["Users (stored window)", totals.users],
        ],
        attributes: { page_id: page.id },
      })}
    >
      <div className="grid gap-3 p-3">
        {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
        {loading && !rows ? (
          <div className="h-32 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LineChart className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">No evidence yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ga4Enabled
                  ? "Run a GA4 collection to persist sessions, users, and engagement."
                  : "Connect a Google Analytics 4 property in site integrations, then sync."}
              </p>
            </div>
          </div>
        ) : null}
        {rows && rows.length > 0 ? (
          <CondensedFieldGrid
            fields={[
              { label: "Sessions", value: totals.sessions.toLocaleString() },
              { label: "Users", value: totals.users.toLocaleString() },
              { label: "Engaged sessions", value: totals.engagedSessions.toLocaleString() },
              {
                label: "Engagement rate",
                value: engagementRate === null ? "—" : `${engagementRate.toFixed(1)}%`,
              },
            ]}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

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
    if (!blob) {
      setMarkdownText(null);
      return;
    }
    void blob.text().then((value) => {
      if (active) setMarkdownText(value);
    });
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
          <IntentForm
            key={`${page.id}:${page.updated_at}`}
            page={page}
            observedTitle={head.title}
            observedDescription={head.metaDescription}
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

        <SitemapMembershipsCard page={page} />

          <PageCapturesCard page={page} />
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}
