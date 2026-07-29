"use client";

import { useMemo, useState } from "react";
import { ImageIcon, Search, Share2 } from "lucide-react";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSiteMedia } from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  buildSnapshotMediaAssets,
  bucketSnapshotAssets,
  type SiteMediaPageRow,
  type SnapshotMediaAsset,
} from "@/features/marketing/lib/snapshot-media";
import {
  MediaEmptyState,
  SnapshotMediaGallery,
} from "@/features/marketing/components/media/SnapshotMediaGallery";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { SizeTier } from "@/lib/media/categorization";

/**
 * Site-level Media view — aggregates the per-image inventory across ALL
 * canonical pages' latest snapshots, dedupes by src, and renders the shared
 * size-separated gallery with tier / missing-alt / page filters. Every asset
 * shows the pages it appears on. Same categorization core as research
 * (`@/lib/media/categorization`).
 *
 * External crawl assets render via plain `<img loading="lazy">` — conscious
 * exception to InlineMediaRef/fileHandler (third-party assets, no file_id).
 */

type TierFilter = "all" | SizeTier;

interface ShareImageRow {
  url: string;
  labels: string[];
  pages: Array<{ pageId: string; url: string; path: string | null }>;
}

function collectShareImages(rows: SiteMediaPageRow[]): ShareImageRow[] {
  const byUrl = new Map<string, ShareImageRow>();
  for (const row of rows) {
    const pageRef = { pageId: row.pageId, url: row.url, path: row.path };
    const candidates: Array<[string, string | null]> = [
      ["og:image", row.ogImage],
      ["twitter:image", row.twitterImage],
    ];
    for (const [label, url] of candidates) {
      if (!url) continue;
      const existing = byUrl.get(url);
      if (!existing) {
        byUrl.set(url, { url, labels: [label], pages: [pageRef] });
        continue;
      }
      if (!existing.labels.includes(label)) existing.labels.push(label);
      if (!existing.pages.some((page) => page.pageId === row.pageId)) {
        existing.pages.push(pageRef);
      }
    }
  }
  return [...byUrl.values()];
}

function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-card px-2 py-1">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "warning"
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function SiteMediaWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const media = useSiteMedia(site.id);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [altFilter, setAltFilter] = useState<"all" | "missing">("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => media.data ?? [], [media.data]);

  const { assets, withoutSrc } = useMemo(
    () =>
      buildSnapshotMediaAssets(
        rows.flatMap((row) =>
          row.images.items.map((image) => ({
            image,
            page: { pageId: row.pageId, url: row.url, path: row.path },
          })),
        ),
      ),
    [rows],
  );

  const shareImages = useMemo(() => collectShareImages(rows), [rows]);

  const pagesWithInventory = useMemo(
    () => rows.filter((row) => row.images.items.length > 0),
    [rows],
  );
  const countedImages = rows.reduce(
    (sum, row) => sum + (row.images.count ?? 0),
    0,
  );
  const countedMissingAlt = rows.reduce(
    (sum, row) => sum + (row.images.missingAlt ?? 0),
    0,
  );
  const missingAltAssets = assets.filter((asset) => asset.missingAlt).length;

  const filtered = useMemo(() => {
    let items: SnapshotMediaAsset[] = assets;
    if (tierFilter !== "all") {
      items = items.filter((asset) => asset.tier === tierFilter);
    }
    if (altFilter === "missing") {
      items = items.filter((asset) => asset.missingAlt);
    }
    if (pageFilter !== "all") {
      items = items.filter((asset) =>
        asset.pages.some((page) => page.pageId === pageFilter),
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (asset) =>
          asset.src.toLowerCase().includes(q) ||
          (asset.alt ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [assets, tierFilter, altFilter, pageFilter, search]);

  const buckets = useMemo(() => bucketSnapshotAssets(filtered), [filtered]);

  const copy = webCopy({
    kind: "web-site-media",
    label: "Site media inventory",
    description:
      "Every image asset observed across this site's canonical pages (latest snapshot per page), deduped by src, with size-tier/aspect categorization, alt-text coverage, the pages each asset appears on, and the social share images.",
    surface: `Media — ${site.name}`,
    data: {
      counts: {
        crawledPages: rows.length,
        pagesWithInventory: pagesWithInventory.length,
        uniqueAssets: assets.length,
        assetsMissingAlt: missingAltAssets,
        countedImages,
        countedMissingAlt,
        withoutSrc,
      },
      assets,
      shareImages,
    },
    lines: [
      ["Site", site.name],
      ["Crawled pages", rows.length],
      ["Pages with per-image inventory", pagesWithInventory.length],
      ["Unique image assets", assets.length],
      ["Assets missing alt", missingAltAssets],
      ["Share images", shareImages.length],
    ],
  });

  if (media.isLoading) {
    return <LoadingSurface label="Loading site media…" />;
  }
  if (media.isError) {
    return (
      <QueryError error={media.error} onRetry={() => void media.refetch()} />
    );
  }

  const hasInventory = assets.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-foreground/60" />
            <h1 className="text-sm font-semibold text-foreground">Media</h1>
          </div>
          <StatChip label="crawled pages" value={rows.length.toLocaleString()} />
          <StatChip
            label="unique assets"
            value={assets.length.toLocaleString()}
          />
          <StatChip
            label="missing alt"
            value={missingAltAssets.toLocaleString()}
            tone={missingAltAssets > 0 ? "warning" : "default"}
          />
          <StatChip
            label="share images"
            value={shareImages.length.toLocaleString()}
          />
          <div className="ml-auto">
            <CopyButtons size="icon" {...copy} />
          </div>
        </div>

        {hasInventory ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search src or alt text…"
                className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
              />
            </div>
            <Select
              value={tierFilter}
              onValueChange={(value) => setTierFilter(value as TierFilter)}
            >
              <SelectTrigger className="h-7 w-[7.5rem] px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
                <SelectItem value="all">All sizes</SelectItem>
                <SelectItem value="photo">Photos</SelectItem>
                <SelectItem value="graphic">Graphics</SelectItem>
                <SelectItem value="icon">Icons</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={altFilter}
              onValueChange={(value) =>
                setAltFilter(value === "missing" ? "missing" : "all")
              }
            >
              <SelectTrigger className="h-7 w-[7.5rem] px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
                <SelectItem value="all">Any alt</SelectItem>
                <SelectItem value="missing">Missing alt</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pageFilter} onValueChange={setPageFilter}>
              <SelectTrigger className="h-7 w-[13rem] px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
                <SelectItem value="all">All pages</SelectItem>
                {pagesWithInventory.map((row) => (
                  <SelectItem key={row.pageId} value={row.pageId}>
                    {row.path ?? row.url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {filtered.length}/{assets.length}
            </span>
          </div>
        ) : null}

        {hasInventory ? (
          <SnapshotMediaGallery buckets={buckets} showPages />
        ) : rows.length === 0 ? (
          <MediaEmptyState
            title="No crawled pages yet"
            detail="This site has no pages with snapshots. Run a crawl to capture media evidence."
          />
        ) : (
          <MediaEmptyState
            title={
              countedImages > 0
                ? `${countedImages.toLocaleString()} images counted across ${rows.length.toLocaleString()} crawled pages — inventories not captured yet`
                : "No image inventory captured yet"
            }
            detail={
              countedImages > 0
                ? `The latest snapshots only persisted image counts${countedMissingAlt > 0 ? ` (${countedMissingAlt.toLocaleString()} missing alt)` : ""}. The per-image inventory (src, dimensions, alt) will appear after the next crawl of this site.`
                : "The latest snapshots carry no image inventory or counts. The inventory will appear after the next crawl of this site."
            }
          />
        )}

        {shareImages.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Share2 className="h-3.5 w-3.5 text-foreground/60" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Social share images
              </h3>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {shareImages.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shareImages.map((image) => (
                <div
                  key={image.url}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/20 p-1.5"
                >
                  {/* Third-party crawl asset — see the exception note at top. */}
                  <img
                    src={image.url}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-md border border-border/60 bg-muted/50 object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      {image.labels.map((label) => (
                        <Badge
                          key={label}
                          variant="outline"
                          className="h-4 px-1 text-[9px]"
                        >
                          {label}
                        </Badge>
                      ))}
                      <span className="text-[9px] text-muted-foreground/70">
                        {image.pages.length} page
                        {image.pages.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-mono text-[10px] text-foreground hover:text-primary"
                      title={image.url}
                    >
                      {image.url}
                    </a>
                    <p
                      className="truncate text-[9px] text-muted-foreground/70"
                      title={image.pages
                        .map((page) => page.path ?? page.url)
                        .join("\n")}
                    >
                      {image.pages
                        .map((page) => page.path ?? page.url)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {hasInventory ? (
          <p className="px-1 text-[10px] text-muted-foreground/70">
            Assets link back to their pages under{" "}
            <span className="font-mono">{sitePath}/pages</span> — hover a tile
            to see every page it appears on.
            {withoutSrc > 0
              ? ` ${withoutSrc} inventory entr${withoutSrc === 1 ? "y" : "ies"} had no src and were skipped.`
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
