import type { ResearchMedia } from "../../types";
import {
  resolveDimensions,
  type CategorizableMedia,
  type ResolvedDimensions,
} from "@/lib/media/categorization";

// The size/dimension heuristics live in the shared core (`@/lib/media/
// categorization`) — this module is the thin ResearchMedia adapter. Import
// generic helpers (parseDimensionsFromUrl, isSvgUrl, resolvedMaxDimension,
// resolvedPixelArea) and the DimSource/ResolvedDimensions types straight
// from the core.

/** Adapt a `rs_media` row to the shared categorization shape. */
export function toCategorizableMedia(item: ResearchMedia): CategorizableMedia {
  return {
    url: item.url,
    width: item.width,
    height: item.height,
    alt: item.alt_text,
    kind: item.media_type,
    metadata: item.metadata,
  };
}

export function resolveMediaDimensions(
  item: ResearchMedia,
): ResolvedDimensions {
  return resolveDimensions(toCategorizableMedia(item));
}
