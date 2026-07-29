"use client";

import {
  HelpCircle,
  ImageIcon,
  RectangleHorizontal,
  RectangleVertical,
  Shapes,
  Square,
  Star,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isFeaturedPhoto } from "@/lib/media/categorization";
import type {
  SnapshotMediaAsset,
  SnapshotMediaBuckets,
} from "@/features/marketing/lib/snapshot-media";

/**
 * Size-separated gallery over crawled snapshot image inventories — the
 * marketing twin of research's MediaGallery, consuming the SAME shared
 * categorization core (`@/lib/media/categorization`): photos split by aspect
 * with a featured/standard tile band, graphics at natural size, icons in a
 * compact strip.
 *
 * CONSCIOUS EXCEPTION to the InlineMediaRef/fileHandler rule: these are
 * THIRD-PARTY site assets observed by the crawler, not our media files —
 * there is no `file_id` to re-mint from, so plain `<img loading="lazy">`
 * against the external URL is the correct rendering here.
 */

function srcTail(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? src;
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments.at(-1) ?? src;
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  description?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-foreground/60" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          {title}
        </h3>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
      {description ? (
        <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
          · {description}
        </span>
      ) : null}
    </div>
  );
}

function MissingAltBadge() {
  return (
    <Badge
      variant="outline"
      className="h-4 shrink-0 border-amber-500/50 px-1 text-[9px] text-amber-600 dark:text-amber-400"
    >
      no alt
    </Badge>
  );
}

function assetTooltip(asset: SnapshotMediaAsset): string {
  return [
    asset.alt,
    asset.sizeLabel,
    asset.loading ? `loading=${asset.loading}` : null,
    asset.pages.length > 1 ? `on ${asset.pages.length} pages` : null,
    asset.src,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PhotoTile({
  asset,
  aspectClass,
  showPages,
}: {
  asset: SnapshotMediaAsset;
  aspectClass: string;
  showPages: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all",
        asset.missingAlt ? "border-amber-500/40" : "border-border",
      )}
      title={assetTooltip(asset)}
    >
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-muted/50",
          aspectClass,
        )}
      >
        {/* Third-party crawl asset — see the exception note at the top. */}
        <img
          src={asset.src}
          alt={asset.alt ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      {asset.featured ? (
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium text-foreground backdrop-blur-sm">
          <Star className="h-2.5 w-2.5 text-primary" />
          Featured
        </span>
      ) : null}
      <div className="space-y-0.5 p-1.5">
        <div className="flex items-center gap-1.5">
          <p
            className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
            title={asset.src}
          >
            {srcTail(asset.src)}
          </p>
          {asset.sizeLabel ? (
            <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/70">
              {asset.sizeLabel}
            </span>
          ) : null}
          {asset.loading ? (
            <span className="shrink-0 text-[9px] text-muted-foreground/70">
              {asset.loading}
            </span>
          ) : null}
          {asset.missingAlt ? <MissingAltBadge /> : null}
        </div>
        {asset.alt ? (
          <p
            className="truncate text-[10px] text-muted-foreground"
            title={asset.alt}
          >
            alt: {asset.alt}
          </p>
        ) : null}
        {showPages && asset.pages.length > 0 ? (
          <p
            className="truncate text-[9px] text-muted-foreground/70"
            title={asset.pages.map((page) => page.path ?? page.url).join("\n")}
          >
            {asset.pages.length === 1 && asset.pages[0]
              ? (asset.pages[0].path ?? asset.pages[0].url)
              : `${asset.pages.length} pages`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GraphicTile({ asset }: { asset: SnapshotMediaAsset }) {
  return (
    <div
      className={cn(
        "group relative inline-flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/20 transition-all",
        asset.missingAlt ? "border-amber-500/40" : "border-border",
      )}
      title={assetTooltip(asset)}
    >
      {/* Third-party crawl asset — see the exception note at the top. */}
      <img
        src={asset.src}
        alt={asset.alt ?? ""}
        className="h-full w-auto max-w-[200px] object-contain"
        loading="lazy"
      />
      {asset.sizeLabel ? (
        <span className="absolute bottom-1 left-1 rounded bg-background/70 px-1 text-[9px] tabular-nums text-muted-foreground/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          {asset.sizeLabel}
        </span>
      ) : null}
      {asset.missingAlt ? (
        <span className="absolute right-1 top-1 rounded bg-background/70 px-1 text-[9px] font-medium text-amber-600 backdrop-blur-sm dark:text-amber-400">
          no alt
        </span>
      ) : null}
    </div>
  );
}

function IconTile({ asset }: { asset: SnapshotMediaAsset }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border bg-card transition-transform hover:z-10 hover:scale-110",
        asset.missingAlt ? "border-amber-500/40" : "border-border/60",
      )}
      title={assetTooltip(asset)}
    >
      {/* Third-party crawl asset — see the exception note at the top. */}
      <img
        src={asset.src}
        alt={asset.alt ?? ""}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

function PhotoAspectSection({
  icon,
  title,
  description,
  assets,
  aspectClass,
  featuredGrid,
  standardGrid,
  showPages,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  assets: SnapshotMediaAsset[];
  aspectClass: string;
  featuredGrid: string;
  standardGrid: string;
  showPages: boolean;
}) {
  // Assets arrive sorted by area (largest first). Split into a big-tile
  // "featured" band and a small-tile "standard" band so resolution drives
  // display size — same rule as the research gallery.
  const featured = assets.filter((asset) => isFeaturedPhoto(asset.media));
  const standard = assets.filter((asset) => !isFeaturedPhoto(asset.media));
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={icon}
        title={title}
        count={assets.length}
        description={description}
      />
      {featured.length > 0 ? (
        <div className={featuredGrid}>
          {featured.map((asset) => (
            <PhotoTile
              key={asset.src}
              asset={asset}
              aspectClass={aspectClass}
              showPages={showPages}
            />
          ))}
        </div>
      ) : null}
      {standard.length > 0 ? (
        <div className={standardGrid}>
          {standard.map((asset) => (
            <PhotoTile
              key={asset.src}
              asset={asset}
              aspectClass={aspectClass}
              showPages={showPages}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SnapshotMediaGallery({
  buckets,
  showPages = false,
}: {
  buckets: SnapshotMediaBuckets;
  /** Show which pages each asset appears on (site-level aggregation). */
  showPages?: boolean;
}) {
  const total =
    buckets.landscape.length +
    buckets.square.length +
    buckets.portrait.length +
    buckets.unknownAspect.length +
    buckets.graphics.length +
    buckets.icons.length;
  if (total === 0) {
    return (
      <p className="px-1 text-[11px] text-muted-foreground">
        No images matched the current filters.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {buckets.landscape.length > 0 ? (
        <PhotoAspectSection
          icon={RectangleHorizontal}
          title="Landscape"
          description="Wider than tall"
          assets={buckets.landscape}
          aspectClass="aspect-video"
          featuredGrid="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          standardGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
          showPages={showPages}
        />
      ) : null}
      {buckets.square.length > 0 ? (
        <PhotoAspectSection
          icon={Square}
          title="Square"
          description="Roughly 1:1"
          assets={buckets.square}
          aspectClass="aspect-square"
          featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
          standardGrid="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
          showPages={showPages}
        />
      ) : null}
      {buckets.portrait.length > 0 ? (
        <PhotoAspectSection
          icon={RectangleVertical}
          title="Portrait"
          description="Taller than wide"
          assets={buckets.portrait}
          aspectClass="aspect-[3/4]"
          featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
          standardGrid="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
          showPages={showPages}
        />
      ) : null}
      {buckets.unknownAspect.length > 0 ? (
        <PhotoAspectSection
          icon={HelpCircle}
          title="Unknown Dimensions"
          description="Images without width/height evidence"
          assets={buckets.unknownAspect}
          aspectClass="aspect-video"
          featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
          standardGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
          showPages={showPages}
        />
      ) : null}
      {buckets.graphics.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader
            icon={Shapes}
            title="Graphics"
            count={buckets.graphics.length}
            description="Logos, thumbnails, banners, and small graphics — shown at their real size"
          />
          <div className="flex flex-wrap gap-2">
            {buckets.graphics.map((asset) => (
              <GraphicTile key={asset.src} asset={asset} />
            ))}
          </div>
        </section>
      ) : null}
      {buckets.icons.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader
            icon={Zap}
            title="Icons & Favicons"
            count={buckets.icons.length}
            description="Tiny graphics shown at native size (64px or less)"
          />
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
            {buckets.icons.map((asset) => (
              <IconTile key={asset.src} asset={asset} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Shared empty-state icon block for media surfaces. */
export function MediaEmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/8">
        <ImageIcon className="h-5 w-5 text-primary/40" />
      </div>
      <div>
        <p className="text-xs font-medium text-foreground/70">{title}</p>
        <p className="mx-auto mt-1 max-w-[320px] text-[10px] text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
