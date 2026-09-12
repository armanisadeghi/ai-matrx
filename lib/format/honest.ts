/**
 * lib/format/honest.ts — number formatters that refuse to invent a value.
 *
 * THE LAW THIS ENFORCES. A screen never lies: a value is either absent or
 * honest, never a confident wrong number. The recurring way we broke it was
 * `?? 0` in front of a display string — `$${(app.total_cost ?? 0).toFixed(4)}`
 * renders "$0.0000" for a cost NOBODY MEASURED, and the reader walks away
 * believing the run was free. Same shape, different masks: a division whose
 * denominator can be zero prints "NaN% used"; an absent percentage prints
 * "0%".
 *
 * THE CONVENTION is the fleet's existing one, set by `formatFileSize` in
 * `@ai-matrx/kit/format`: unknown reads as an em-dash ("—"), and that function
 * returns it for null, undefined, non-finite and negative byte counts.
 *
 * THE OTHER HALF OF THE LAW, and the easy thing to get wrong while fixing the
 * first half: a zero that is REALLY a zero still prints as zero. `0` is a
 * measurement; `null` is the absence of one. These helpers separate the two
 * and never collapse them.
 *
 * NOTE FOR THE NEXT AGENT: these are host-local on purpose. They are strong
 * candidates for `@ai-matrx/kit/format` alongside `formatFileSize`, but a new
 * package export is Arman's call, not an agent's.
 */

/** What every surface in the fleet prints when a value is unknown. */
export const UNKNOWN_DISPLAY = "—";

/** True only for a real, usable measurement. `0` passes; `null`/NaN do not. */
export function isKnownNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface UnknownOption {
  /** Override the "—" that stands in for an unmeasured value. */
  unknown?: string;
}

/**
 * USD with a fixed number of decimals — "$0.0000" ONLY for a measured zero.
 * Unknown costs return the em-dash.
 */
export function formatUsd(
  value: number | null | undefined,
  options: { digits?: number } & UnknownOption = {},
): string {
  const { digits = 2, unknown = UNKNOWN_DISPLAY } = options;
  if (!isKnownNumber(value)) return unknown;
  return `$${value.toFixed(digits)}`;
}

/** Locale-grouped integer — "0" for a measured zero, em-dash for unknown. */
export function formatCount(
  value: number | null | undefined,
  options: UnknownOption = {},
): string {
  const { unknown = UNKNOWN_DISPLAY } = options;
  if (!isKnownNumber(value)) return unknown;
  return value.toLocaleString();
}

/**
 * A ratio, or `null` when it is INDETERMINATE. This is the guard the
 * "NaN% used" class of defect was missing: `0 / 0` is not zero, it is
 * unknown, and so is any division by a zero or non-finite denominator.
 */
export function safeRatio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (!isKnownNumber(numerator) || !isKnownNumber(denominator)) return null;
  if (denominator === 0) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : null;
}

/**
 * Render a 0..1 fraction as a percentage. A measured `0` renders "0%"; an
 * unknown fraction renders the em-dash. Nothing is clamped here — a
 * percentage over 100 is usually a real signal and hiding it is its own lie.
 */
export function formatPercentFromFraction(
  fraction: number | null | undefined,
  options: { digits?: number } & UnknownOption = {},
): string {
  const { digits = 0, unknown = UNKNOWN_DISPLAY } = options;
  if (!isKnownNumber(fraction)) return unknown;
  return `${(fraction * 100).toFixed(digits)}%`;
}

/**
 * The CSS width for a progress bar: clamped to 0–100% so an over-quota or
 * indeterminate reading cannot draw a bar outside its track. A bar is
 * decoration — the honest number lives in the label beside it, which is why
 * clamping is safe here and refused in `formatPercentFromFraction`.
 */
export function clampedBarWidth(fraction: number | null | undefined): string {
  if (!isKnownNumber(fraction)) return "0%";
  const pct = Math.min(100, Math.max(0, fraction * 100));
  return `${pct}%`;
}
