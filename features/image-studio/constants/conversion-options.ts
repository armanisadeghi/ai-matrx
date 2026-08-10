/**
 * The vocabulary of the Image Studio CONVERSION request.
 *
 * ONE home for the output-format list, the quality bounds, the fit modes, and
 * the crop anchors, so the Output-controls panel's own buttons
 * (`ExportPanel`), the crop picker (`CropControls`), the
 * `matrx-user/image-studio` surface manifest's write-target contract prose,
 * and the write handler's validation can never drift from each other.
 *
 * This is the `surface-write-targets` rule made structural: validate against
 * the SAME constants the controls render from, never re-typed literals. Before
 * this module existed the format list lived in `ExportPanel`, the fit list and
 * the anchor grid lived in `CropControls`, and the quality bounds were inline
 * `min={30} max={100}` props on a Slider — three copies nothing kept in sync.
 *
 * Deliberately JSX-free (like `generation-options.ts`): the manifest imports it
 * to interpolate enums into agent-facing prose, and a manifest must stay a
 * plain data module. The components own their own icons and map them by id.
 */

import type { ImageFit, ImagePositionAnchor, OutputFormat } from "../types";

// ── Output format ─────────────────────────────────────────────────────────

export const OUTPUT_FORMAT_OPTIONS: ReadonlyArray<{
  id: OutputFormat;
  label: string;
  blurb: string;
  supportsAlpha: boolean;
}> = [
  {
    id: "webp",
    label: "WebP",
    blurb: "Best balance — ~30% smaller than JPEG, alpha supported",
    supportsAlpha: true,
  },
  {
    id: "avif",
    label: "AVIF",
    blurb: "Smallest files, slightly slower to decode",
    supportsAlpha: false,
  },
  {
    id: "jpeg",
    label: "JPEG",
    blurb: "Universal support, no alpha",
    supportsAlpha: false,
  },
  {
    id: "png",
    label: "PNG",
    blurb: "Lossless, best for logos/icons, alpha",
    supportsAlpha: true,
  },
];

/** Just the wire values, in display order — for enum checks and prose. */
export const OUTPUT_FORMATS: readonly OutputFormat[] =
  OUTPUT_FORMAT_OPTIONS.map((o) => o.id);

/** The one format that ignores quality entirely (always lossless). */
export const LOSSLESS_OUTPUT_FORMAT: OutputFormat = "png";

// ── Encode quality ────────────────────────────────────────────────────────

/**
 * Bounds of the quality slider. 30 is the floor because below it the lossy
 * encoders produce visible blocking on photographic content; 100 is the
 * ceiling the encoders accept.
 */
export const OUTPUT_QUALITY_BOUNDS = { min: 30, max: 100 } as const;

/** Slider step — quality is a whole-number percentage. */
export const OUTPUT_QUALITY_STEP = 1;

// ── Fit mode ──────────────────────────────────────────────────────────────

export const IMAGE_FIT_OPTIONS: ReadonlyArray<{
  id: ImageFit;
  label: string;
  blurb: string;
}> = [
  {
    id: "cover",
    label: "Cover",
    blurb: "Fill the frame — crops overflow. Best for hero/social images.",
  },
  {
    id: "contain",
    label: "Contain",
    blurb:
      "Fit the whole image; pad with background. Best for logos and flyers.",
  },
  {
    id: "inside",
    label: "Inside",
    blurb:
      "Shrink to fit without cropping or padding. Output may be smaller than the preset.",
  },
];

export const IMAGE_FITS: readonly ImageFit[] = IMAGE_FIT_OPTIONS.map(
  (o) => o.id,
);

/** The only fit mode that consults the crop anchor. */
export const CROPPING_IMAGE_FIT: ImageFit = "cover";

// ── Crop anchor ───────────────────────────────────────────────────────────

/** The 3×3 compass grid, in reading order (the picker renders it as a grid). */
export const POSITION_ANCHOR_GRID: ReadonlyArray<{
  id: ImagePositionAnchor;
  label: string;
}> = [
  { id: "top-left", label: "Top-left" },
  { id: "top", label: "Top" },
  { id: "top-right", label: "Top-right" },
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
  { id: "bottom-left", label: "Bottom-left" },
  { id: "bottom", label: "Bottom" },
  { id: "bottom-right", label: "Bottom-right" },
];

/** Sharp's content-aware anchors — it picks the region itself. */
export const SMART_POSITION_OPTIONS: ReadonlyArray<{
  id: ImagePositionAnchor;
  label: string;
  blurb: string;
}> = [
  {
    id: "attention",
    label: "Attention",
    blurb:
      "Crops toward the most visually prominent area (faces, high contrast).",
  },
  {
    id: "entropy",
    label: "Entropy",
    blurb: "Crops toward the region with the most detail / texture.",
  },
];

/**
 * Every NAMED anchor — the 9 compass points plus the 2 smart algorithms.
 *
 * Note what is NOT here: the continuous `{x, y}` focal point. That value only
 * comes from dragging the live crop preview, which requires seeing the image,
 * so it is a human gesture rather than part of the selectable vocabulary. The
 * surface serializes an active one as `"focal x%,y%"` for reading.
 */
export const IMAGE_POSITION_ANCHORS: readonly ImagePositionAnchor[] = [
  ...POSITION_ANCHOR_GRID.map((o) => o.id),
  ...SMART_POSITION_OPTIONS.map((o) => o.id),
];

// ── Background fill ───────────────────────────────────────────────────────

/**
 * The colour input is `<input type="color">`, which always emits a 6-digit
 * lowercase hex. The paired text field lets the user type, so writes are
 * validated against this shape rather than trusted.
 */
export const BACKGROUND_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isBackgroundColor(value: string): boolean {
  return BACKGROUND_COLOR_PATTERN.test(value);
}
