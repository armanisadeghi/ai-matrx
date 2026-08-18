/**
 * Curve application. The ONLY place a transform is computed.
 *
 * Every function here is pure and total: given a value it returns a number or
 * `null` (unmeasured). It never throws and never returns NaN/Infinity — a
 * scoring engine that can emit NaN prices a link at NaN dollars.
 */

import type { Curve, SegmentCurve } from "./types";

/** Half-up to `decimals`, matching spreadsheet ROUND (not banker's rounding). */
export function roundHalfUp(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const scaled = value * factor;
  // `Math.round` is half-up for positives and half-down for negatives; mirror
  // the spreadsheet by rounding the magnitude and restoring the sign.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / factor;
}

function safe(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function segmentValue(
  segment: { intercept: number; slope: number },
  at: number,
): number {
  return segment.intercept + segment.slope * at;
}

/**
 * Piecewise linear with optional smoothing across the jumps.
 *
 * Unsmoothed, this reproduces a nested-IF ladder exactly, discontinuities and
 * all. Smoothed, each segment blends into the next across its own span, so two
 * near-identical inputs can no longer land in different price tiers.
 */
function applySegments(curve: SegmentCurve, at: number): number {
  const segments = curve.segments;
  const index = segments.findIndex((segment) => at < segment.upTo);
  if (index === -1) return segmentValue(curve.fallback, at);

  const active = segments[index];
  if (!active) return segmentValue(curve.fallback, at);

  const base = segmentValue(active, at);
  if (!curve.smooth) return base;

  // Smoothing: blend toward the NEXT segment's value across this segment's own
  // span, so the cliff becomes a ramp. Two near-identical inputs can then no
  // longer land in different price tiers.
  const next = segments[index + 1] ?? curve.fallback;
  const lower =
    index === 0
      ? active.upTo - 1
      : (segments[index - 1]?.upTo ?? active.upTo - 1);
  const span = active.upTo - lower;
  if (span <= 0) return base;
  const progress = Math.min(1, Math.max(0, (at - lower) / span));
  const nextValue = segmentValue(next, active.upTo);
  return base * (1 - progress) + nextValue * progress;
}

/**
 * Apply a curve to a raw value.
 *
 * Returns `null` for "cannot be measured from this input" — a log of zero, a
 * missing value, an enum nobody defined. Callers must treat `null` as absent,
 * never as 0.
 */
export function applyCurve(
  curve: Curve,
  raw: number | string | null,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (curve.kind === "categorical") {
    if (typeof raw !== "string") return null;
    const key = raw.trim().toLowerCase();
    for (const [candidate, points] of Object.entries(curve.map)) {
      if (candidate.trim().toLowerCase() === key) return safe(points);
    }
    return safe(curve.fallback);
  }

  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numeric)) return null;

  switch (curve.kind) {
    case "linear":
      return safe(numeric * curve.scale + curve.offset);

    case "rescale": {
      const span = curve.inMax - curve.inMin;
      if (span === 0) return safe(curve.outMin);
      const ratio = (numeric - curve.inMin) / span;
      const bounded = curve.clamp ? Math.min(1, Math.max(0, ratio)) : ratio;
      return safe(curve.outMin + bounded * (curve.outMax - curve.outMin));
    }

    case "logGain": {
      if (numeric <= curve.floorInput) return null;
      return safe(curve.mult * (Math.log(numeric) / Math.log(curve.base)));
    }

    case "logDrop": {
      if (numeric <= curve.floorInput) return null;
      return safe(
        curve.mult * (curve.ceiling - Math.log(numeric) / Math.log(curve.base)),
      );
    }

    case "segments":
      return safe(applySegments(curve, numeric));

    default:
      return null;
  }
}

/**
 * Interpolate a value off a set of (x, y) points — the money curve.
 * Clamps outside the declared range rather than extrapolating, because
 * extrapolating a price curve invents money.
 */
export function interpolatePoints(
  points: readonly { at: number; value: number }[],
  at: number,
  interpolate: boolean,
): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return 0;
  if (at <= first.at) return first.value;
  if (at >= last.at) return last.value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const low = sorted[index];
    const high = sorted[index + 1];
    if (!low || !high) continue;
    if (at >= low.at && at <= high.at) {
      if (!interpolate) return low.value;
      const span = high.at - low.at;
      if (span === 0) return low.value;
      const progress = (at - low.at) / span;
      return low.value + progress * (high.value - low.value);
    }
  }
  return last.value;
}
