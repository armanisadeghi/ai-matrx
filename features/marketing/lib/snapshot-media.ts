import type { ParsedSnapshotImage, ParsedSnapshotImages } from "@/features/marketing/lib/snapshot-content";
import {
  categorizeAspect,
  categorizeSizeTier,
  formatResolvedSizeLabel,
  sortByAreaDesc,
  type AspectBucket,
  type CategorizableMedia,
  type SizeTier,
} from "@/lib/media/categorization";

/**
 * Adapter between the crawler's per-image snapshot inventory
 * (`ParsedSnapshotImage`, from `lib/snapshot-content.ts`) and the shared
 * media-categorization core (`@/lib/media/categorization`) — plus the
 * cross-page dedupe used by the site-level Media view. Pure: no fetching.
 */

/** The page a media asset was observed on (site-level aggregation). */
export interface SnapshotMediaPageRef {
  pageId: string;
  url: string;
  path: string | null;
}

/** One deduped (by `src`) image asset with its categorization verdicts. */
export interface SnapshotMediaAsset {
  src: string;
  /** Shared-core shape — feed this to gallery size/aspect helpers. */
  media: CategorizableMedia;
  /** First non-empty alt observed for this src. */
  alt: string | null;
  /** True when ANY occurrence lacked alt text (SEO signal — flag loudly). */
  missingAlt: boolean;
  /** First observed `loading` attribute (`lazy` / `eager`), if any. */
  loading: string | null;
  /** True when any occurrence was crawler-flagged as the featured image. */
  featured: boolean;
  tier: SizeTier;
  aspect: AspectBucket;
  /** e.g. `1280×720` (`~` suffix = URL-inferred), null when unknown. */
  sizeLabel: string | null;
  /** How many times this src appears across the parsed inventory. */
  occurrences: number;
  /** Distinct pages the asset appears on (empty for single-page usage). */
  pages: SnapshotMediaPageRef[];
}

export interface SnapshotMediaAssets {
  assets: SnapshotMediaAsset[];
  /** Inventory entries the crawler persisted without a usable `src`. */
  withoutSrc: number;
}

function toCategorizable(image: ParsedSnapshotImage, src: string): CategorizableMedia {
  return {
    url: src,
    width: image.width,
    height: image.height,
    alt: image.alt,
    kind: "image",
  };
}

/**
 * Dedupe per-image inventory entries by `src`, merging metadata (first known
 * dimensions win, any missing alt marks the asset) and collecting the pages
 * each asset appears on.
 */
export function buildSnapshotMediaAssets(
  inputs: Array<{
    image: ParsedSnapshotImage;
    page: SnapshotMediaPageRef | null;
  }>,
): SnapshotMediaAssets {
  const bySrc = new Map<
    string,
    {
      image: ParsedSnapshotImage;
      alt: string | null;
      missingAlt: boolean;
      loading: string | null;
      featured: boolean;
      occurrences: number;
      pages: Map<string, SnapshotMediaPageRef>;
    }
  >();
  let withoutSrc = 0;

  for (const { image, page } of inputs) {
    const src = image.src?.trim();
    if (!src) {
      withoutSrc += 1;
      continue;
    }
    const missing = image.alt === null || image.alt === "";
    const existing = bySrc.get(src);
    if (!existing) {
      bySrc.set(src, {
        image,
        alt: missing ? null : image.alt,
        missingAlt: missing,
        loading: image.loading,
        featured: image.featured,
        occurrences: 1,
        pages: new Map(page ? [[page.pageId, page]] : []),
      });
      continue;
    }
    existing.occurrences += 1;
    existing.missingAlt = existing.missingAlt || missing;
    if (existing.alt === null && !missing) existing.alt = image.alt;
    if (existing.loading === null) existing.loading = image.loading;
    existing.featured = existing.featured || image.featured;
    // First known dimensions win — later occurrences only fill gaps.
    if (existing.image.width === null && image.width !== null) {
      existing.image = { ...existing.image, width: image.width };
    }
    if (existing.image.height === null && image.height !== null) {
      existing.image = { ...existing.image, height: image.height };
    }
    if (page && !existing.pages.has(page.pageId)) {
      existing.pages.set(page.pageId, page);
    }
  }

  const assets: SnapshotMediaAsset[] = [];
  for (const [src, entry] of bySrc) {
    const media = toCategorizable(entry.image, src);
    assets.push({
      src,
      media,
      alt: entry.alt,
      missingAlt: entry.missingAlt,
      loading: entry.loading,
      featured: entry.featured,
      tier: categorizeSizeTier(media),
      aspect: categorizeAspect(media),
      sizeLabel: formatResolvedSizeLabel(media),
      occurrences: entry.occurrences,
      pages: [...entry.pages.values()],
    });
  }
  return { assets, withoutSrc };
}

/** Size-separated gallery groups, each sorted largest-first. */
export interface SnapshotMediaBuckets {
  landscape: SnapshotMediaAsset[];
  square: SnapshotMediaAsset[];
  portrait: SnapshotMediaAsset[];
  unknownAspect: SnapshotMediaAsset[];
  graphics: SnapshotMediaAsset[];
  icons: SnapshotMediaAsset[];
}

export function bucketSnapshotAssets(
  assets: SnapshotMediaAsset[],
): SnapshotMediaBuckets {
  const buckets: SnapshotMediaBuckets = {
    landscape: [],
    square: [],
    portrait: [],
    unknownAspect: [],
    graphics: [],
    icons: [],
  };
  for (const asset of assets) {
    if (asset.tier === "graphic") {
      buckets.graphics.push(asset);
      continue;
    }
    if (asset.tier === "icon") {
      buckets.icons.push(asset);
      continue;
    }
    if (asset.aspect === "landscape") buckets.landscape.push(asset);
    else if (asset.aspect === "square") buckets.square.push(asset);
    else if (asset.aspect === "portrait") buckets.portrait.push(asset);
    else buckets.unknownAspect.push(asset);
  }
  const byArea = (a: SnapshotMediaAsset, b: SnapshotMediaAsset) =>
    sortByAreaDesc(a.media, b.media);
  buckets.landscape.sort(byArea);
  buckets.square.sort(byArea);
  buckets.portrait.sort(byArea);
  buckets.unknownAspect.sort(byArea);
  buckets.graphics.sort(byArea);
  buckets.icons.sort(byArea);
  return buckets;
}

/**
 * Site-level media source row — one canonical page's latest snapshot, reduced
 * to exactly the media evidence the Media view needs (query-cost rule: the
 * service selects only `images` + `head_tags`, never full snapshots).
 */
export interface SiteMediaPageRow {
  pageId: string;
  url: string;
  path: string | null;
  capturedAt: string;
  images: ParsedSnapshotImages;
  ogImage: string | null;
  twitterImage: string | null;
}
