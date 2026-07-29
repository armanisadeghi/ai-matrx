/**
 * Shared, type-agnostic media size/tier/aspect categorization — the ONE place
 * the "photo vs graphic vs icon" heuristics live. Extracted from
 * `features/research/components/media/` so research and marketing (and any
 * future crawl/media surface) consume identical rules instead of forking them.
 *
 * Callers adapt their row shape to `CategorizableMedia` (a minimal
 * `{url, width, height, alt, kind}` view) — see
 * `features/research/components/media/mediaCategorization.ts` and
 * `features/marketing/lib/snapshot-media.ts` for the two adapters.
 */

/** Minimal shape the categorization heuristics need. */
export interface CategorizableMedia {
  url: string;
  /** Known pixel width (DB column / HTML attribute), if any. */
  width: number | null;
  /** Known pixel height (DB column / HTML attribute), if any. */
  height: number | null;
  /** Alt text / caption used for logo-and-icon hints. */
  alt: string | null;
  /** Media class — anything other than "image" bypasses the size tiers. */
  kind: string;
  /** Optional metadata record that may carry `width`/`height` (or `w`/`h`). */
  metadata?: unknown;
}

export type DimSource = "db" | "url" | "none";

export interface ResolvedDimensions {
  width: number | null;
  height: number | null;
  source: DimSource;
  hints: string[];
}

const MAX_SANE_PX = 8192;

function parsePx(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v) || v <= 0 || v > MAX_SANE_PX) return null;
  return v;
}

function isBogusPair(w: number, h: number): boolean {
  if (w > MAX_SANE_PX || h > MAX_SANE_PX) return true;
  const ratio = w / h;
  return ratio > 20 || ratio < 0.05;
}

export function isSvgUrl(url: string): boolean {
  return /\.svg(?:\?|$)/i.test(url);
}

export function parseDimensionsFromUrl(url: string): {
  width: number | null;
  height: number | null;
  hints: string[];
} {
  const hints: string[] = [];
  let width: number | null = null;
  let height: number | null = null;

  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname);

    const queryW =
      parsePx(parsed.searchParams.get("w")) ??
      parsePx(parsed.searchParams.get("width"));
    const queryH =
      parsePx(parsed.searchParams.get("h")) ??
      parsePx(parsed.searchParams.get("height"));

    if (queryW) {
      width = queryW;
      hints.push(`query:w=${queryW}`);
    }
    if (queryH) {
      height = queryH;
      hints.push(`query:h=${queryH}`);
    }

    const pathPair =
      path.match(/(?:^|\/|[-_])(\d{2,4})x(\d{2,4})(?:\.|\/|[-_]|$)/i) ??
      url.match(/(?:^|\/|[-_])(\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp|gif)/i);
    if (pathPair) {
      const pw = parsePx(pathPair[1]);
      const ph = parsePx(pathPair[2]);
      if (pw && ph && !isBogusPair(pw, ph)) {
        const fromQueryOnly = !!(queryW || queryH);
        const looksLikeAspectToken =
          !fromQueryOnly && pw < 64 && ph < 64 && Math.max(pw, ph) <= 32;
        if (!looksLikeAspectToken) {
          width = pw;
          height = ph;
          hints.push(`path:${pw}x${ph}`);
        }
      }
    }

    const dashPair = url.match(
      /-(\d{2,4})-(\d{2,4})\.(?:jpe?g|png|webp|gif)(?:\?|$)/i,
    );
    if (dashPair && !pathPair) {
      const pw = parsePx(dashPair[1]);
      const ph = parsePx(dashPair[2]);
      if (pw && ph && !isBogusPair(pw, ph)) {
        width = pw;
        height = ph;
        hints.push(`cdn:${pw}x${ph}`);
      }
    }

    const widthInPath = path.match(/width[:\-](\d{2,4})/i);
    if (widthInPath && !width) {
      width = parsePx(widthInPath[1]);
      if (width) hints.push(`path:width=${width}`);
    }
  } catch {
    // ignore malformed URLs
  }

  return { width, height, hints };
}

function dimensionsFromMetadata(
  metadata: unknown,
): { width: number | null; height: number | null } | null {
  if (
    metadata == null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  const width =
    typeof m.width === "number"
      ? m.width
      : typeof m.w === "number"
        ? m.w
        : null;
  const height =
    typeof m.height === "number"
      ? m.height
      : typeof m.h === "number"
        ? m.h
        : null;
  if (width && width > 0 && height && height > 0) {
    return { width, height };
  }
  return null;
}

export function resolveDimensions(item: CategorizableMedia): ResolvedDimensions {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return {
      width: item.width,
      height: item.height,
      source: "db",
      hints: ["db"],
    };
  }

  if (isSvgUrl(item.url)) {
    return {
      width: null,
      height: null,
      source: "none",
      hints: ["svg:intrinsic-size-unknown"],
    };
  }

  const fromMeta = dimensionsFromMetadata(item.metadata);
  if (fromMeta) {
    return {
      width: fromMeta.width,
      height: fromMeta.height,
      source: "url",
      hints: ["metadata"],
    };
  }

  const fromUrl = parseDimensionsFromUrl(item.url);
  if (fromUrl.width || fromUrl.height) {
    return {
      width: fromUrl.width,
      height: fromUrl.height,
      source: "url",
      hints: fromUrl.hints,
    };
  }

  return { width: null, height: null, source: "none", hints: [] };
}

export function resolvedMaxDimension(resolved: ResolvedDimensions): number {
  return Math.max(resolved.width ?? 0, resolved.height ?? 0);
}

export function resolvedPixelArea(resolved: ResolvedDimensions): number {
  return (resolved.width ?? 0) * (resolved.height ?? 0);
}

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
 * Display weight for a photo, from its resolution. Drives tile size in a
 * gallery so big, high-quality images render large and modest ones stay small
 * — instead of every image filling the same box.
 */
export type PhotoGrade = "hero" | "large" | "standard" | "modest";
export type AspectBucket = "landscape" | "square" | "portrait" | "unknown";

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

export function isLikelyLogoOrIcon(item: CategorizableMedia): boolean {
  const u = item.url.toLowerCase();
  return (
    isLikelyIconUrl(item.url) ||
    isSvgUrl(item.url) ||
    u.includes("/logo") ||
    /logo[-.]/.test(u) ||
    u.includes("avatar") ||
    altHintsIconOrLogo(item.alt)
  );
}

export function isLikelyThumbnailOrSmallGraphic(
  item: CategorizableMedia,
): boolean {
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
  const resolved = resolveDimensions(item);
  const max = resolvedMaxDimension(resolved);
  if (max > ICON_MAX_DIM && max < GRAPHIC_MAX_DIM) return true;
  return false;
}

export function categorizeSizeTier(item: CategorizableMedia): SizeTier {
  if (item.kind !== "image") return "photo";

  if (isSvgUrl(item.url)) {
    return isLikelyLogoOrIcon(item) ? "icon" : "graphic";
  }

  const resolved = resolveDimensions(item);
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
export function photoGrade(item: CategorizableMedia): PhotoGrade {
  const resolved = resolveDimensions(item);
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
export function isFeaturedPhoto(item: CategorizableMedia): boolean {
  const resolved = resolveDimensions(item);
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

export function categorizeAspect(item: CategorizableMedia): AspectBucket {
  const ratio = aspectRatioFromResolved(resolveDimensions(item));
  if (ratio == null) return "unknown";
  if (
    ratio >= 1 - SQUARE_ASPECT_TOLERANCE &&
    ratio <= 1 + SQUARE_ASPECT_TOLERANCE
  ) {
    return "square";
  }
  return ratio > 1 ? "landscape" : "portrait";
}

export function sortByAreaDesc(
  a: CategorizableMedia,
  b: CategorizableMedia,
): number {
  return (
    resolvedPixelArea(resolveDimensions(b)) -
    resolvedPixelArea(resolveDimensions(a))
  );
}

/** Display label using resolved dimensions (~ suffix = URL-inferred). */
export function formatResolvedSizeLabel(
  item: CategorizableMedia,
): string | null {
  const resolved = resolveDimensions(item);
  const approx = resolved.source === "url" ? "~" : "";
  if (resolved.width && resolved.height) {
    return `${resolved.width}×${resolved.height}${approx}`;
  }
  if (resolved.width) return `${resolved.width}w${approx}`;
  if (resolved.height) return `${resolved.height}h${approx}`;
  return null;
}
