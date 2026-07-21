/**
 * features/media-capture/core/geometry.ts
 *
 * Pure geometry for mapping what the preview shows back to SOURCE pixels.
 * NO DOM access — callers pass numbers in.
 *
 * ─── The three-sizes separation rule ────────────────────────────────────────
 * Three sizes exist and are NEVER conflated (invariant 5):
 *   1. Preview container size — layout pixels, from the layout system
 *      (ResizeObserver on the container element).
 *   2. Stream intrinsic size — `video.videoWidth` / `video.videoHeight` (or
 *      track settings). NEVER element offsets (`offsetWidth`, client rects).
 *   3. Persisted output size — the capture canvas / track settings the saved
 *      artifact actually has.
 * `sourceRect` consumes (1) and (2) and returns a region expressed purely in
 * (2)'s coordinate space. Because only the container's ASPECT matters for
 * `viewport-crop`, results are DPR-independent: scaling the container
 * uniformly leaves the returned rect unchanged.
 */

import type { FramingMode } from "./capture-types";

/** A crop region in SOURCE (stream-intrinsic) pixels — drawImage-ready. */
export interface SourceRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * Compute the source region the preview shows.
 *
 * - `full-frame`: identity — the whole stream frame (object-contain letterbox
 *   previews show everything, so capture everything).
 * - `viewport-crop`: the exact centered region an `object-fit: cover` preview
 *   displays in a container of aspect `containerW / containerH`.
 *
 * Throws descriptive errors on degenerate inputs (any dimension ≤ 0 or
 * non-finite) — a zero-sized container or a stream with no frames yet is a
 * caller bug, never something to silently "handle".
 */
export function sourceRect(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  framing: FramingMode,
): SourceRect {
  assertPositiveFinite("containerW", containerW);
  assertPositiveFinite("containerH", containerH);
  assertPositiveFinite("videoW", videoW);
  assertPositiveFinite("videoH", videoH);

  if (framing === "full-frame") {
    return { sx: 0, sy: 0, sWidth: videoW, sHeight: videoH };
  }

  // viewport-crop: object-fit: cover shows the largest centered sub-rect of
  // the video that matches the container aspect ratio.
  const containerAspect = containerW / containerH;
  const videoAspect = videoW / videoH;

  if (videoAspect > containerAspect) {
    // Video is wider than the container — sides are cropped (pillar-crop).
    const sWidth = videoH * containerAspect;
    return { sx: (videoW - sWidth) / 2, sy: 0, sWidth, sHeight: videoH };
  }
  // Video is taller (or equal) — top/bottom are cropped (letter-crop).
  const sHeight = videoW / containerAspect;
  return { sx: 0, sy: (videoH - sHeight) / 2, sWidth: videoW, sHeight };
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `sourceRect: "${name}" must be a positive finite number, got ${String(value)}. ` +
        `A zero/invalid dimension means the container has not laid out or the ` +
        `stream has no frames yet (videoWidth/videoHeight are 0 before loadedmetadata) — ` +
        `the caller must wait, never capture.`,
    );
  }
}
