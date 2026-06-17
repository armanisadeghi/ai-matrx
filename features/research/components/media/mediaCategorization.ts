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

export type SizeTier = "photo" | "graphic" | "icon";
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
  const max = resolvedMaxDimension(resolved);

  if (max > 0) {
    if (max <= ICON_MAX_DIM) return "icon";
    if (max < GRAPHIC_MAX_DIM) return "graphic";
    return "photo";
  }

  if (isLikelyLogoOrIcon(item)) return "icon";
  if (isLikelyThumbnailOrSmallGraphic(item)) return "graphic";
  return "photo";
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
