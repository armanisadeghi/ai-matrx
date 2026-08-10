/**
 * The vocabulary of the text→image generation request.
 *
 * ONE home for the aspect options and the count bounds, so the Generate
 * form's own Selects, the `matrx-user/image-generate` surface manifest's
 * write-target contract prose, and the write handler's validation can never
 * drift from each other (the `surface-write-targets` rule: validate against
 * the SAME constants the controls render from, never re-typed literals).
 */

export const IMAGE_GENERATE_SIZE_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
  { value: "wide", label: "Wide (16:9)" },
  { value: "tall", label: "Tall (9:16)" },
] as const;

export type ImageGenerateSize =
  (typeof IMAGE_GENERATE_SIZE_OPTIONS)[number]["value"];

/** Just the wire values, in display order — for enum checks and prose. */
export const IMAGE_GENERATE_SIZES: readonly ImageGenerateSize[] =
  IMAGE_GENERATE_SIZE_OPTIONS.map((o) => o.value);

/** How many images one Generate may produce. */
export const IMAGE_GENERATE_MIN_COUNT = 1;
export const IMAGE_GENERATE_MAX_COUNT = 4;

/** The selectable counts, in display order. */
export const IMAGE_GENERATE_COUNTS: readonly number[] = Array.from(
  { length: IMAGE_GENERATE_MAX_COUNT - IMAGE_GENERATE_MIN_COUNT + 1 },
  (_, i) => IMAGE_GENERATE_MIN_COUNT + i,
);
