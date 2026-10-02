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
 * The canonical media channel on an `agent_call` result: aidream's
 * `AgentRunResult.media` → `[{file_id, mime_type, kind}]`. Identity only, by
 * design — a signed URL is minted at handoff and never travels between parts of
 * the platform. Read this BEFORE guessing at url-ish keys.
 */
function mediaFromChannel(result: Record<string, unknown>): MediaRef | null {
  const media = result.media;
  if (!Array.isArray(media)) return null;
  for (const item of media) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const fileId = entry.file_id;
    if (typeof fileId !== "string" || fileId.length === 0) continue;
    const ref: MediaRef = { file_id: fileId };
    if (typeof entry.mime_type === "string") ref.mime_type = entry.mime_type;
    return ref;
  }
  return null;
}

/**
 * Returns the media the child agent produced, or null when the result carries
 * no image — the caller then falls back to the honest generic rendering rather
 * than inventing one.
 */
export function findResultMedia(result: unknown): MediaRef | null {
  const direct = detectResultShape(result);
  if (direct.kind === "media") return direct.ref;

  if (!isPlainObject(result)) return null;

  // The declared channel beats every heuristic below it.
  const declared = mediaFromChannel(result);
  if (declared) return declared;

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
