"use client";

import { useMemo, type ReactNode } from "react";
import { ExternalLink, Film, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";
import {
  parseSnapshotImages,
  parseSnapshotResources,
  type ParsedSnapshotResource,
} from "@/features/marketing/lib/snapshot-content";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  buildSnapshotMediaAssets,
  bucketSnapshotAssets,
} from "@/features/marketing/lib/snapshot-media";
import {
  MediaEmptyState,
  SnapshotMediaGallery,
} from "@/features/marketing/components/media/SnapshotMediaGallery";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";

/**
 * Media inventory for one canonical page's latest snapshot — every observed
 * image rendered through the shared size/tier/aspect categorization core
 * (`@/lib/media/categorization`, same heuristics as research's MediaGallery),
 * plus the OG/social share images and any video/embed resources the crawl
 * captured. Honest empty state when the crawler only persisted counts.
 *
 * External crawl assets render via plain `<img loading="lazy">` — a conscious
 * exception to InlineMediaRef/fileHandler (third-party site assets, no file_id).
 */

/** DOM resource kinds that count as playable/embedded media evidence. */
const MEDIA_RESOURCE_KINDS = new Set(["video", "audio", "embed", "iframe"]);

function mediaResources(
  resources: ParsedSnapshotResource[],
): ParsedSnapshotResource[] {
  return resources.filter((resource) =>
    MEDIA_RESOURCE_KINDS.has(resource.kind.toLowerCase()),
  );
}

function ShareImageTile({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/20 p-1.5">
      {/* Third-party crawl asset — see the exception note at the top. */}
      <img
        src={url}
        alt=""
        className="h-14 w-24 shrink-0 rounded-md border border-border/60 bg-muted/50 object-cover"
        loading="lazy"
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-[10px] text-foreground hover:text-primary"
          title={url}
        >
          {url}
        </a>
      </div>
    </div>
  );
}

export function PageMediaCard({
  page,
  snapshot,
  refetchAction,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
  /** Rendered inside the "inventory not captured" empty states — the caller's
   *  fetch-now button, so a stale (pre-inventory) snapshot is one click from
   *  a capture that carries the full per-image inventory. */
  refetchAction?: ReactNode;
}) {
  const images = useMemo(
    () => parseSnapshotImages(snapshot.images),
    [snapshot.images],
  );
  const headTags = useMemo(
    () => parseSnapshotHeadTags(snapshot.head_tags),
    [snapshot.head_tags],
  );
  const embeds = useMemo(
    () => mediaResources(parseSnapshotResources(snapshot.extracted).items),
    [snapshot.extracted],
  );

  const { assets, withoutSrc } = useMemo(
    () =>
      buildSnapshotMediaAssets(
        images.items.map((image) => ({ image, page: null })),
      ),
    [images.items],
  );
  const buckets = useMemo(() => bucketSnapshotAssets(assets), [assets]);
  const missingAltAssets = assets.filter((asset) => asset.missingAlt).length;

  const shareImages: Array<{ label: string; url: string }> = [];
  if (headTags.og.image) {
    shareImages.push({ label: "og:image", url: headTags.og.image });
  }
  if (headTags.twitter.image && headTags.twitter.image !== headTags.og.image) {
    shareImages.push({ label: "twitter:image", url: headTags.twitter.image });
  }

  const hasInventory = assets.length > 0;
  const hasCountsOnly =
    !hasInventory && images.count !== null && images.count > 0;

  const copy = webCopy({
    kind: "web-page-media",
    label: "Media inventory",
    description:
      "Every image observed on this canonical page's latest snapshot with size-tier/aspect categorization and alt-text coverage, plus the OG/social share images and embedded video/audio/iframe resources.",
    surface: `Media inventory — ${page.url}`,
    data: {
      counts: {
        images: images.count,
        missingAlt: images.missingAlt,
        inventoried: assets.length,
        withoutSrc,
      },
      assets,
      shareImages,
      embeds,
      capturedAt: snapshot.captured_at,
    },
    lines: [
      ["Page", page.url],
      ["Images (snapshot count)", images.count],
      ["Missing alt (snapshot count)", images.missingAlt],
      ["Inventoried assets", assets.length],
      ["Assets missing alt", hasInventory ? missingAltAssets : null],
      ["Share images", shareImages.length],
      ["Embedded media resources", embeds.length],
    ],
  });

  return (
    <SectionCard title="Media" copy={copy} collapsible anchor="media_inventory">
      <div className="space-y-4 p-3">
        {/* Summary strip — counts come from the snapshot even when the
            per-image inventory is absent. */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {images.count === null
              ? "Image count not captured"
              : `${images.count.toLocaleString()} image${images.count === 1 ? "" : "s"} on this page`}
          </span>
          {images.missingAlt !== null && images.missingAlt > 0 ? (
            <Badge
              variant="outline"
              className="h-4 border-amber-500/50 px-1 text-[9px] text-amber-600 dark:text-amber-400"
            >
              {images.missingAlt} missing alt
            </Badge>
          ) : null}
          {withoutSrc > 0 ? (
            <span className="text-[10px] text-muted-foreground/70">
              {withoutSrc} inventory entr{withoutSrc === 1 ? "y" : "ies"}{" "}
              without a src
            </span>
          ) : null}
        </div>

        {shareImages.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Share2 className="h-3.5 w-3.5 text-foreground/60" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Social share image{shareImages.length === 1 ? "" : "s"}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shareImages.map((image) => (
                <ShareImageTile
                  key={image.label}
                  label={image.label}
                  url={image.url}
                />
              ))}
            </div>
          </section>
        ) : null}

        {hasInventory ? (
          <SnapshotMediaGallery buckets={buckets} />
        ) : hasCountsOnly ? (
          <MediaEmptyState
            title={`${images.count?.toLocaleString()} image${images.count === 1 ? "" : "s"} counted — inventory not captured yet`}
            detail="This snapshot only persisted image counts. Fetch the page again to capture the full per-image inventory (src, dimensions, alt)."
            action={refetchAction}
          />
        ) : shareImages.length === 0 && embeds.length === 0 ? (
          <MediaEmptyState
            title="No media evidence captured"
            detail="The latest snapshot carries no image inventory, counts, or share images for this page. Fetch the page again to capture the current media."
            action={refetchAction}
          />
        ) : null}

        {embeds.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Film className="h-3.5 w-3.5 text-foreground/60" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Video & embedded media
              </h3>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {embeds.length}
              </span>
            </div>
            <div className="divide-y divide-border/40 rounded-md border border-border/60">
              {embeds.map((resource, index) => (
                <div
                  key={`${resource.url}-${index}`}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 px-1 text-[9px] uppercase"
                  >
                    {resource.kind}
                  </Badge>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground hover:text-primary"
                    title={resource.url}
                  >
                    {resource.url}
                  </a>
                  {resource.mimeType ? (
                    <span className="shrink-0 text-[9px] text-muted-foreground/70">
                      {resource.mimeType}
                    </span>
                  ) : null}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SectionCard>
  );
}
