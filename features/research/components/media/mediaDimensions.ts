import type { ResearchMedia } from "../../types";

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
  metadata: ResearchMedia["metadata"],
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

export function resolveMediaDimensions(
  item: ResearchMedia,
): ResolvedDimensions {
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

export function isSvgUrl(url: string): boolean {
  return /\.svg(?:\?|$)/i.test(url);
}
