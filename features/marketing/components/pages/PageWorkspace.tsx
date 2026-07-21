"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AppWindow,
  FileCode2,
  FileQuestion,
  FileText,
  History,
  ImageOff,
  Loader2,
  Monitor,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
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
  useDeleteScreenshot,
  usePageScreenshots,
  usePageSitemapMemberships,
  usePageWorkspace,
  useUpdatePageIntent,
} from "@/features/marketing/data/hooks";
import type {
  MarketingPage,
  PageSnapshot,
  SiteScreenshot,
} from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { SerpResult, type SerpDevice } from "@/features/seo/serp/SerpResult";
import { SerpFieldChips } from "@/features/seo/serp/SerpValidation";
import { MetaRecommendations } from "@/features/seo/serp/MetaRecommendations";
import {
  evaluateMetaTitle,
  evaluateMetaDescription,
  type MetaEvaluation,
} from "@/features/seo/serp/metrics";
import { useOpenSerpAnalyzerWindow } from "@/features/overlays/openers/serpAnalyzerWindow";
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
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

function IntentForm({ page }: { page: MarketingPage }) {
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

  return (
    <div className="grid gap-3 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="target-keyword" className="text-xs">
          Target keyword
        </Label>
        <Input
          id="target-keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Primary search intent"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="desired-title" className="text-xs">
            Desired meta title
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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="desired-description" className="text-xs">
            Desired meta description
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
  const state = !desired
    ? "none"
    : observed === desired
      ? "match"
      : "differs";
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
 * Search result preview — renders the canonical SerpResult (features/seo/serp)
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
          label="Desired title"
          observed={title}
          desired={page.meta_title_desired}
          metrics={desiredTitleEval}
        />
        <IntentDiffRow
          label="Desired description"
          observed={description}
          desired={page.meta_description_desired}
          metrics={desiredDescEval}
        />
      </div>
    </div>
  );
}

function SocialCardPreview({ snapshot }: { snapshot: PageSnapshot }) {
  const { og, twitter } = parseSnapshotHeadTags(snapshot.head_tags);
  const title = og.title ?? twitter.title;
  const description = og.description ?? twitter.description;
  const image = og.image ?? twitter.image;
  const [imageBroken, setImageBroken] = useState(false);

  if (!title && !description && !image) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No Open Graph or Twitter card tags were observed — shares of this URL
        will render as a bare link.
      </p>
    );
  }
  return (
    <div className="p-3">
      <div className="max-w-md overflow-hidden rounded-lg border border-border bg-background">
        {/* og:image is the brand's own public URL (never our storage) — a raw
            img with a loud broken state is correct here. */}
        {image && !imageBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={title ?? "Social share image"}
            className="aspect-[1.91/1] w-full bg-muted/40 object-cover"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="flex aspect-[1.91/1] w-full items-center justify-center gap-2 bg-muted/40 text-xs text-muted-foreground">
            <ImageOff className="h-4 w-4" />
            {image ? "Share image failed to load" : "No share image"}
          </div>
        )}
        <div className="border-t border-border px-3 py-2">
          <p className="truncate text-[10px] uppercase text-muted-foreground">
            {og.siteName ?? og.url ?? ""}
          </p>
          <p className="line-clamp-1 text-xs font-semibold text-foreground">
            {title ?? "No social title"}
          </p>
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            {description ?? "No social description"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {twitter.card ? `Twitter card: ${twitter.card}` : "No Twitter card tag"}
        {og.type ? ` · og:type ${og.type}` : ""}
      </p>
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
  const noindex = head.metaRobots?.toLowerCase().includes("noindex") ?? false;
  const canonicalMismatch = Boolean(
    head.canonicalUrl && head.canonicalUrl !== page.url,
  );
  return (
    <div className="p-3">
      <CondensedFieldGrid
        fields={[
          {
            label: "HTTP status",
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
  const headings = parseSnapshotHeadings(snapshot.headings);
  if (headings.all.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No headings were observed on this page.
      </p>
    );
  }
  return (
    <div className="p-3">
      {headings.h1Count !== 1 ? (
        <Badge variant="warning" className="mb-2 text-[10px]">
          {headings.h1Count === 0
            ? "No H1 on this page"
            : `${headings.h1Count} H1 headings — expected exactly 1`}
        </Badge>
      ) : null}
      <ol className="grid max-h-80 gap-1 overflow-y-auto">
        {headings.all.map((heading, index) => (
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
                heading.level === 1
                  ? "font-medium text-foreground"
                  : "text-foreground/90",
              )}
            >
              {heading.text}
            </span>
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
            label: "Word count",
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
          { label: "Captured", value: formatDate(snapshot.captured_at) },
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

function SitemapMemberships({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const memberships = usePageSitemapMemberships(site.id, pageId);
  if (memberships.isLoading) {
    return (
      <div className="m-3 h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (memberships.isError) {
    return (
      <QueryError
        error={memberships.error}
        onRetry={() => void memberships.refetch()}
      />
    );
  }
  const rows = memberships.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No sitemap advertises this URL — it was found another way.
      </p>
    );
  }
  return (
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

/** Current capture per kind + per-page capture history, canonical file viewer on click. */
function PageCaptures({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const screenshots = usePageScreenshots(site.id, pageId);
  const deleteMutation = useDeleteScreenshot(site.id);
  const openFilePreview = useOpenFilePreviewWindow();
  const [deleting, setDeleting] = useState<SiteScreenshot | null>(null);

  if (screenshots.isLoading) {
    return (
      <div className="m-3 h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }
  if (screenshots.isError) {
    return (
      <QueryError
        error={screenshots.error}
        onRetry={() => void screenshots.refetch()}
      />
    );
  }
  const rows = (screenshots.data ?? []).filter(
    (screenshot): screenshot is SiteScreenshot & { file_id: string } =>
      Boolean(screenshot.file_id),
  );
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        No captures exist for this page yet — they are stored by site
        initialization and screenshot-enabled crawls.
      </p>
    );
  }

  // Rows arrive newest-first; the first row per kind is the current capture.
  const byKind = new Map<string, (SiteScreenshot & { file_id: string })[]>();
  for (const row of rows) {
    const list = byKind.get(row.kind) ?? [];
    list.push(row);
    byKind.set(row.kind, list);
  }

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

  return (
    <div className="grid gap-4 p-3">
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
                        onClick={() => openFilePreview({ fileId: capture.file_id })}
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

export function PageWorkspace({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const workspace = usePageWorkspace(site.id, pageId);
  const openSerpAnalyzer = useOpenSerpAnalyzerWindow();
  const [serpDevice, setSerpDevice] = useState<SerpDevice>("desktop");
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

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge value={page.status} />
              <Badge variant="outline" className="uppercase">
                {page.provenance}
              </Badge>
            </div>
            <h1 className="mt-2 truncate font-mono text-sm font-semibold text-foreground">
              {page.path || "/"}
            </h1>
            <MarketingUrlRow url={page.url} className="mt-0.5" />
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
            <Link href={`${sitePath}/pages/${page.id}/snapshots`}>
              <History className="mr-1.5 h-3.5 w-3.5" />
              Snapshot history
            </Link>
          </Button>
        </section>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="Open findings"
            value={data.openFindings}
            detail="Current state"
            tone={data.openFindings ? "warning" : "good"}
          />
          <MetricCell
            label="Last HTTP"
            value={page.http_status_last ?? "—"}
            detail="Latest observed"
          />
          <MetricCell
            label="Words"
            value={snapshot?.word_count?.toLocaleString() ?? "—"}
            detail="Latest snapshot"
          />
          <MetricCell label="First seen" value={formatDate(page.first_seen)} />
          <MetricCell label="Last seen" value={formatDate(page.last_seen)} />
          <MetricCell
            label="Current content"
            value={snapshot ? "Captured" : "None"}
            detail={
              snapshot
                ? formatDate(snapshot.captured_at)
                : "No accepted snapshot"
            }
          />
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard
            title="Search result preview"
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
          <SectionCard title="User-owned page intent">
            <IntentForm key={`${page.id}:${page.updated_at}`} page={page} />
          </SectionCard>
        </div>

        {snapshot ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard title="Social share preview">
                <SocialCardPreview snapshot={snapshot} />
              </SectionCard>
              <SectionCard title="Indexability">
                <IndexabilitySection page={page} snapshot={snapshot} />
              </SectionCard>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard title="Headings outline">
                <HeadingsOutline snapshot={snapshot} />
              </SectionCard>
              <SectionCard title="Content stats">
                <ContentStats snapshot={snapshot} />
              </SectionCard>
            </div>
          </>
        ) : (
          <section className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
            <FileQuestion className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              This canonical URL exists independently, but no crawl has
              produced an accepted snapshot yet — observed content sections
              will appear after the first capture.
            </p>
          </section>
        )}

        <SectionCard title="Sitemap memberships">
          <SitemapMemberships pageId={page.id} />
        </SectionCard>

        <SectionCard title="Captures">
          <PageCaptures pageId={page.id} />
        </SectionCard>
      </div>
    </main>
  );
}
