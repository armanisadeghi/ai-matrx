import type { ResearchMedia } from "../../types";
import {
  isSvgUrl,
  resolveMediaDimensions,
  resolvedMaxDimension,
  resolvedPixelArea,
  type DimSource,
  type ResolvedDimensions,
} from "./mediaDimensions";

export const ICON_MAX_DIM = 64;
export const GRAPHIC_MAX_DIM = 200;
/** Ratio within [1 − t, 1 + t] counts as square. */
export const SQUARE_ASPECT_TOLERANCE = 0.12;

// A "photo" is a substantial content image — big enough on BOTH sides, with
// enough area, and not a banner strip. Anything that fails these is a graphic
// (logo / thumbnail / banner / small avatar) and is shown small, never blown up
// into a big photo tile. Tuned against real examples: 348×100 / 216×46 / 200×300
// → graphic; 700×700 / 1280×720 / 2560×1706 → photo.
export const PHOTO_MIN_SHORT_SIDE = 200; // the shorter side must be ≥ this
export const PHOTO_MIN_LONG_SIDE = 320; // the longer side must be ≥ this
export const PHOTO_MIN_AREA = 90_000; // ≈ 300×300
export const BANNER_MAX_RATIO = 3; // wider/taller than 3:1 is a banner strip

export type SizeTier = "photo" | "graphic" | "icon";

/**
 * Display weight for a photo, from its resolution. Drives tile size in the
 * gallery so big, high-quality images render large and modest ones stay small
 * — instead of every image filling the same box.
 */
export type PhotoGrade = "hero" | "large" | "standard" | "modest";
export type AspectBucket = "landscape" | "square" | "portrait" | "unknown";

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

export function isLikelyIconUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("favicon") ||
    u.endsWith(".ico") ||
    u.includes("/favicon") ||
    /\/icons?\//.test(u) ||
    /\/icon[-/]/.test(u) ||
    /-icon\.(png|svg|webp|gif|jpe?g)(\?|$)/.test(u) ||
    /apple-touch-icon/.test(u)
  );
}

function altHintsIconOrLogo(alt: string | null): boolean {
  if (!alt) return false;
  const a = alt.toLowerCase();
  return (
    /\bicon\b/.test(a) ||
    /\blogo\b/.test(a) ||
    /\bavatar\b/.test(a) ||
    a.includes("favicon")
  );
}

export function isLikelyLogoOrIcon(item: ResearchMedia): boolean {
  const u = item.url.toLowerCase();
  return (
    isLikelyIconUrl(item.url) ||
    isSvgUrl(item.url) ||
    u.includes("/logo") ||
    /logo[-.]/.test(u) ||
    u.includes("avatar") ||
    altHintsIconOrLogo(item.alt_text)
  );
}

export function isLikelyThumbnailOrSmallGraphic(item: ResearchMedia): boolean {
  const u = item.url.toLowerCase();
  if (
    u.includes("/thumbs/") ||
    u.includes("/thumbnails/") ||
    u.includes("thumbnail") ||
    u.includes("placeholder") ||
    u.includes("-sm.") ||
    u.includes("-thumb.")
  ) {
    return true;
  }
  if (/-lrg\.(png|jpe?g|webp)/i.test(u) || /\/thumbs\//i.test(u)) {
    return true;
  }
  const resolved = resolveMediaDimensions(item);
  const max = resolvedMaxDimension(resolved);
  if (max > ICON_MAX_DIM && max < GRAPHIC_MAX_DIM) return true;
  return false;
}

function getResolved(item: ResearchMedia): ResolvedDimensions {
  return resolveMediaDimensions(item);
}

export function categorizeSizeTier(item: ResearchMedia): SizeTier {
  if (item.media_type !== "image") return "photo";

  if (isSvgUrl(item.url)) {
    return isLikelyLogoOrIcon(item) ? "icon" : "graphic";
  }

  const resolved = getResolved(item);
  const w = resolved.width ?? 0;
  const h = resolved.height ?? 0;
  const max = Math.max(w, h);
  const min = Math.min(w, h);
  const area = w * h;
  const ratio = min > 0 ? max / min : 0;

  if (max > 0) {
    if (max <= ICON_MAX_DIM) return "icon";
    // Substantial content image, and not a logo/icon/avatar by URL or alt.
    const isSubstantial =
      min >= PHOTO_MIN_SHORT_SIDE &&
      max >= PHOTO_MIN_LONG_SIDE &&
      area >= PHOTO_MIN_AREA &&
      ratio <= BANNER_MAX_RATIO;
    if (isSubstantial && !isLikelyLogoOrIcon(item)) return "photo";
    // Everything else with known dims that isn't tiny → a graphic (logo,
    // thumbnail, banner strip, small avatar). Shown small, never blown up.
    return "graphic";
  }

  // No dimensions — fall back to URL/alt heuristics.
  if (isLikelyLogoOrIcon(item)) return "icon";
  if (isLikelyThumbnailOrSmallGraphic(item)) return "graphic";
  return "photo";
}

/**
 * Resolution-derived display weight for a photo. `unknown`-dimension images
 * default to `standard`. Thresholds use the longer side OR total area so a
 * 2560×1706 hero and a 1600×1600 both read as large, while a 400×400 stays
 * modest.
 */
export function photoGrade(item: ResearchMedia): PhotoGrade {
  const resolved = getResolved(item);
  const max = resolvedMaxDimension(resolved);
  const area = resolvedPixelArea(resolved);
  if (max === 0) return "standard";
  if (max >= 1600 || area >= 2_200_000) return "hero";
  if (max >= 900 || area >= 600_000) return "large";
  if (max >= 520 || area >= 230_000) return "standard";
  return "modest";
}

/**
 * A photo big enough to deserve a larger "featured" tile. Cut tuned to real
 * feedback: 700×700 / 1280×720 / 2560×1706 read large; 400×400 / 640×360 stay
 * in the small standard band.
 */
export function isFeaturedPhoto(item: ResearchMedia): boolean {
  const resolved = getResolved(item);
  const max = resolvedMaxDimension(resolved);
  const area = resolvedPixelArea(resolved);
  return max >= 1000 || area >= 450_000;
}

export function aspectRatioFromResolved(
  resolved: ResolvedDimensions,
): number | null {
  const w = resolved.width ?? 0;
  const h = resolved.height ?? 0;
  if (w <= 0 || h <= 0) return null;
  return w / h;
}

export function categorizeAspect(item: ResearchMedia): AspectBucket {
  const ratio = aspectRatioFromResolved(getResolved(item));
  if (ratio == null) return "unknown";
  if (
    ratio >= 1 - SQUARE_ASPECT_TOLERANCE &&
    ratio <= 1 + SQUARE_ASPECT_TOLERANCE
  ) {
    return "square";
  }
  return ratio > 1 ? "landscape" : "portrait";
}

export function sortByAreaDesc(a: ResearchMedia, b: ResearchMedia): number {
  return resolvedPixelArea(getResolved(b)) - resolvedPixelArea(getResolved(a));
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
    documents: [],
    audio: [],
  };

  for (const item of items) {
    // Non-image resources (PDFs, videos incl. YouTube links, audio) carry no
    // intrinsic dimensions — route them to dedicated buckets, never the
    // image size/aspect tiers.
    if (item.media_type === "video") {
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
  const resolved = getResolved(item);
  const approx = resolved.source === "url" ? "~" : "";
  if (resolved.width && resolved.height) {
    return `${resolved.width}×${resolved.height}${approx}`;
  }
  if (resolved.width) return `${resolved.width}w${approx}`;
  if (resolved.height) return `${resolved.height}h${approx}`;
  return null;
}
