/**
 * Locate the picture inside an image-generation `agent_call` result — pure, so
 * it is unit-testable without the render tree.
 *
 * Uses the canonical shape classifier and NEVER a second URL heuristic, so
 * anything `detectResultShape` learns to recognize (a signed S3 URL, a
 * `media_ref` envelope, a bare `file_id`) is understood here for free.
 */

import { detectResultShape, isPlainObject } from "../../result-fields/shape";
import type { MediaRef } from "@/features/files/types";

/** Keys an image agent may hand its picture back on, most specific first. */
const IMAGE_RESULT_KEYS = ["result", "image", "images", "output"] as const;

/**
 * Returns the media the child agent produced, or null when the result carries
 * no image — the caller then falls back to the honest generic rendering rather
 * than inventing one.
 */
export function findResultMedia(result: unknown): MediaRef | null {
  const direct = detectResultShape(result);
  if (direct.kind === "media") return direct.ref;

  if (!isPlainObject(result)) return null;

  for (const key of IMAGE_RESULT_KEYS) {
    if (!(key in result)) continue;
    const value = result[key];
    const shape = detectResultShape(value);
    if (shape.kind === "media") return shape.ref;
    // An agent asked for several images hands back a list; show the first and
    // leave the rest to the overlay (which shows the untouched result).
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemShape = detectResultShape(item);
        if (itemShape.kind === "media") return itemShape.ref;
      }
    }
  }

  return null;
}
