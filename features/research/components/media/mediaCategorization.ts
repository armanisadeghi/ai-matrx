import type { ResearchMedia } from "../../types";
import {
  ICON_MAX_DIM,
  GRAPHIC_MAX_DIM,
  SQUARE_ASPECT_TOLERANCE,
  resolveDimensions,
  type AspectBucket,
  type DimSource,
  type PhotoGrade,
  type ResolvedDimensions,
  type SizeTier,
} from "@/lib/media/categorization";
import * as core from "@/lib/media/categorization";
import { toCategorizableMedia } from "./mediaDimensions";
// YouTube-link detection — embeddable video URLs must reach the video bucket;
// channel/profile URLs go to `youtubeChannels` instead.
import { isYouTubeChannelUrl, youtubeId } from "@/lib/media/youtube";

// The size-tier / photo-grade / aspect heuristics live in the shared core
// (`@/lib/media/categorization`) — consumed identically by research and
// marketing. This module keeps the ResearchMedia-typed API (and the
// research-only pieces: YouTube buckets, debug payloads) and delegates.
// Thresholds, generic URL heuristics, and the SizeTier/PhotoGrade/
// AspectBucket types are imported straight from the core by consumers.

/** True when the row's URL is an embeddable YouTube video link. */
export function isYouTubeMedia(item: ResearchMedia): boolean {
  return youtubeId(item.url) !== null;
}

/** True when the row's URL is a YouTube channel or profile page. */
export function isYouTubeChannelMedia(item: ResearchMedia): boolean {
  return isYouTubeChannelUrl(item.url);
}

export const CATEGORIZATION_RULES = {
  note: "rs_media.width/height are usually null — client infers from URL query/path when possible",
  sizeTiers: {
    icon: `max ≤ ${ICON_MAX_DIM}px, or favicon/icon/logo/svg/avatar URL+alt heuristics`,
    graphic: `max ${ICON_MAX_DIM + 1}–${GRAPHIC_MAX_DIM - 1}px, or thumb/thumbnail/small ?w= heuristics`,
    photo: `max ≥ ${GRAPHIC_MAX_DIM}px; non-image types`,
  },
  aspectBuckets: {
    square: `ratio within ±${Math.round(SQUARE_ASPECT_TOLERANCE * 100)}% of 1:1 (needs both dims)`,
    landscape: "width > height",
    portrait: "height > width",
    unknown: "only one or zero inferred dimensions",
  },
} as const;

export function isLikelyLogoOrIcon(item: ResearchMedia): boolean {
  return core.isLikelyLogoOrIcon(toCategorizableMedia(item));
}

export function isLikelyThumbnailOrSmallGraphic(item: ResearchMedia): boolean {
  return core.isLikelyThumbnailOrSmallGraphic(toCategorizableMedia(item));
}

function getResolved(item: ResearchMedia): ResolvedDimensions {
  return resolveDimensions(toCategorizableMedia(item));
}

export function categorizeSizeTier(item: ResearchMedia): SizeTier {
  return core.categorizeSizeTier(toCategorizableMedia(item));
}

export function photoGrade(item: ResearchMedia): PhotoGrade {
  return core.photoGrade(toCategorizableMedia(item));
}

export function isFeaturedPhoto(item: ResearchMedia): boolean {
  return core.isFeaturedPhoto(toCategorizableMedia(item));
}

export function categorizeAspect(item: ResearchMedia): AspectBucket {
  return core.categorizeAspect(toCategorizableMedia(item));
}

export function sortByAreaDesc(a: ResearchMedia, b: ResearchMedia): number {
  return core.sortByAreaDesc(toCategorizableMedia(a), toCategorizableMedia(b));
}

export interface SlimMediaDebugEntry {
  id: string;
  alt: string | null;
  url: string;
  dbW: number | null;
  dbH: number | null;
  resW: number | null;
  resH: number | null;
  dimSource: DimSource;
  urlHints: string[];
  tier: SizeTier;
  aspect: AspectBucket;
}

export function buildSlimMediaDebugEntry(
  item: ResearchMedia,
): SlimMediaDebugEntry {
  const resolved = getResolved(item);
  return {
    id: item.id,
    alt: item.alt_text,
    url: item.url,
    dbW: item.width,
    dbH: item.height,
    resW: resolved.width,
    resH: resolved.height,
    dimSource: resolved.source,
    urlHints: resolved.hints,
    tier: categorizeSizeTier(item),
    aspect: categorizeAspect(item),
  };
}

export interface MediaBuckets {
  landscape: ResearchMedia[];
  square: ResearchMedia[];
  portrait: ResearchMedia[];
  unknownAspect: ResearchMedia[];
  graphics: ResearchMedia[];
  icons: ResearchMedia[];
  // Non-image resources — no pixel size, so they get their own groups instead
  // of the image size/aspect tiers (PDFs/videos used to land in "unknown").
  videos: ResearchMedia[];
  youtubeChannels: ResearchMedia[];
  documents: ResearchMedia[];
  audio: ResearchMedia[];
}

export function bucketMedia(items: ResearchMedia[]): MediaBuckets {
  const buckets: MediaBuckets = {
    landscape: [],
    square: [],
    portrait: [],
    unknownAspect: [],
    graphics: [],
    icons: [],
    videos: [],
    youtubeChannels: [],
    documents: [],
    audio: [],
  };

  for (const item of items) {
    // YouTube channel/profile pages — not embeddable; own bucket.
    if (isYouTubeChannelMedia(item)) {
      buckets.youtubeChannels.push(item);
      continue;
    }

    // Embeddable videos (YouTube watch/embed, Vimeo, direct files, …).
    if (item.media_type === "video" || isYouTubeMedia(item)) {
      buckets.videos.push(item);
      continue;
    }
    if (item.media_type === "document") {
      buckets.documents.push(item);
      continue;
    }
    if (item.media_type === "audio") {
      buckets.audio.push(item);
      continue;
    }

    const tier = categorizeSizeTier(item);
    if (tier === "graphic") {
      buckets.graphics.push(item);
      continue;
    }
    if (tier === "icon") {
      buckets.icons.push(item);
      continue;
    }

    const aspect = categorizeAspect(item);
    if (aspect === "landscape") buckets.landscape.push(item);
    else if (aspect === "square") buckets.square.push(item);
    else if (aspect === "portrait") buckets.portrait.push(item);
    else buckets.unknownAspect.push(item);
  }

  buckets.landscape.sort(sortByAreaDesc);
  buckets.square.sort(sortByAreaDesc);
  buckets.portrait.sort(sortByAreaDesc);
  buckets.unknownAspect.sort(sortByAreaDesc);
  buckets.graphics.sort(sortByAreaDesc);
  buckets.icons.sort(sortByAreaDesc);

  return buckets;
}

export interface MediaDebugPayload {
  topicId: string;
  exportedAt: string;
  scope: "all" | "filtered";
  counts: {
    shown: number;
    total: number;
  };
  dataQuality: {
    dbDimensions: number;
    urlInferredDimensions: number;
    bothDimensions: number;
    noDimensions: number;
    emptyMetadata: number;
  };
  summary: {
    tier: Partial<Record<SizeTier, number>>;
    aspect: Partial<Record<AspectBucket, number>>;
  };
  rules: typeof CATEGORIZATION_RULES;
  items: SlimMediaDebugEntry[];
}

export function buildMediaDebugPayload(
  topicId: string,
  items: ResearchMedia[],
  options: { scope: "all" | "filtered"; totalCount: number },
): MediaDebugPayload {
  const entries = items.map(buildSlimMediaDebugEntry);

  let dbDimensions = 0;
  let urlInferredDimensions = 0;
  let bothDimensions = 0;
  let noDimensions = 0;
  let emptyMetadata = 0;

  for (const item of items) {
    const hasDb = !!(item.width && item.height);
    const resolved = getResolved(item);
    const hasBoth =
      !!(resolved.width && resolved.height) && resolved.source !== "none";
    const hasAny = !!(resolved.width || resolved.height);

    if (hasDb) dbDimensions += 1;
    if (resolved.source === "url" && hasAny) urlInferredDimensions += 1;
    if (hasBoth) bothDimensions += 1;
    if (!hasAny) noDimensions += 1;
    if (
      item.metadata == null ||
      (typeof item.metadata === "object" &&
        !Array.isArray(item.metadata) &&
        Object.keys(item.metadata).length === 0)
    ) {
      emptyMetadata += 1;
    }
  }

  const tier: Partial<Record<SizeTier, number>> = {};
  const aspect: Partial<Record<AspectBucket, number>> = {};
  for (const e of entries) {
    tier[e.tier] = (tier[e.tier] ?? 0) + 1;
    aspect[e.aspect] = (aspect[e.aspect] ?? 0) + 1;
  }

  return {
    topicId,
    exportedAt: new Date().toISOString(),
    scope: options.scope,
    counts: { shown: entries.length, total: options.totalCount },
    dataQuality: {
      dbDimensions,
      urlInferredDimensions,
      bothDimensions,
      noDimensions,
      emptyMetadata,
    },
    summary: { tier, aspect },
    rules: CATEGORIZATION_RULES,
    items: entries,
  };
}

/** Display label using resolved dimensions (~ suffix = URL-inferred). */
export function formatResolvedSizeLabel(item: ResearchMedia): string | null {
  return core.formatResolvedSizeLabel(toCategorizableMedia(item));
}
