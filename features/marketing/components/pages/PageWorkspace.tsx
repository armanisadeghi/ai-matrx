"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileCode2,
  FileQuestion,
  FileText,
  History,
  ImageOff,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  usePageScreenshots,
  usePageSitemapMemberships,
  usePageWorkspace,
  useUpdatePageIntent,
} from "@/features/marketing/data/hooks";
import type {
  MarketingPage,
  PageSnapshot,
} from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
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
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {title.length} characters
          </span>
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
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {description.length} characters
          </span>
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
}: {
  label: string;
  observed: string | null;
  desired: string | null;
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

function SerpPreview({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot | null;
}) {
  const head = snapshot
    ? parseSnapshotHeadTags(snapshot.head_tags)
    : parseSnapshotHeadTags(null);
  const title = head.title;
  const description = head.metaDescription;

  let host = page.url;
  let pathCrumbs = "";
  try {
    const parsed = new URL(page.url);
    host = parsed.host;
    pathCrumbs = parsed.pathname
      .split("/")
      .filter(Boolean)
      .join(" › ");
  } catch {
    /* keep raw URL */
  }

  return (
    <div className="grid gap-3 p-3">
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="truncate text-xs text-muted-foreground">
          {host}
          {pathCrumbs ? ` › ${pathCrumbs}` : ""}
        </p>
        {title ? (
          <p className="mt-0.5 line-clamp-1 text-[15px] font-medium leading-snug text-primary">
            {title}
          </p>
        ) : (
          <p className="mt-0.5 text-[15px] italic text-muted-foreground">
            No observed title
          </p>
        )}
        {description ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : (
          <p className="mt-0.5 text-xs italic text-muted-foreground">
            No observed meta description — search engines will improvise one.
          </p>
        )}
        <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
          Title {title?.length ?? 0} chars
          {(title?.length ?? 0) > 60 ? " (long)" : ""} · Description{" "}
          {description?.length ?? 0} chars
          {(description?.length ?? 0) > 160 ? " (long)" : ""}
        </p>
      </div>
      <div className="grid gap-2.5">
        <IntentDiffRow
          label="Desired title"
          observed={title}
          desired={page.meta_title_desired}
        />
        <IntentDiffRow
          label="Desired description"
          observed={description}
          desired={page.meta_description_desired}
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
          <Button asChild variant="outline" size="sm" className="h-7">
            <Link href={`/files/f/${snapshot.body_file_id}`}>
              <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
              Captured HTML
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </Link>
          </Button>
        ) : null}
        {snapshot.markdown_file_id ? (
          <Button asChild variant="outline" size="sm" className="h-7">
            <Link href={`/files/f/${snapshot.markdown_file_id}`}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Extracted Markdown
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </Link>
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

function PageScreenshots({ pageId }: { pageId: string }) {
  const { site } = useMarketingSite();
  const screenshots = usePageScreenshots(site.id, pageId);
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
    (screenshot) => screenshot.file_id,
  );
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        No screenshots have been captured for this page.
      </p>
    );
  }
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((screenshot) => (
        <Link
          key={screenshot.id}
          href={`/files/f/${screenshot.file_id}`}
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          <div className="relative aspect-[16/10] bg-muted/40">
            <InlineMediaRef
              ref={
                screenshot.file_id
                  ? fileIdToMediaRef(screenshot.file_id, "image/png")
                  : null
              }
              size="fill"
              fit="contain"
              rounded="none"
              fallback="icon"
              errorFallback="icon"
              alt={`${screenshot.kind} screenshot`}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5 text-[11px]">
            <span className="font-medium">{screenshot.kind}</span>
            <span className="text-muted-foreground">
              {formatDate(screenshot.captured_at)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function PageWorkspace({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const workspace = usePageWorkspace(site.id, pageId);
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
          <SectionCard title="Search result preview">
            <SerpPreview page={page} snapshot={snapshot} />
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

        <SectionCard title="Screenshots">
          <PageScreenshots pageId={page.id} />
        </SectionCard>
      </div>
    </main>
  );
}
