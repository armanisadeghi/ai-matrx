/**
 * lib/format/honest.ts — what is LEFT after the honest-number formatters moved
 * into `@ai-matrx/kit/format` (kit 0.12.0, 2026-09-12).
 *
 * WHERE THEY WENT. `formatUsd`, `formatCount`, `formatPercentFromFraction`,
 * `safeRatio`, `sumKnown`, `isKnownNumber` and `UNKNOWN_DISPLAY` are package
 * exports now, beside `formatFileSize`, whose em-dash-for-unknown convention
 * they were built on. A census found the identical lying-screen class in
 * matrx-extend, matrx-local and both aidream apps — currency in ~85 files,
 * percentages in ~149 — so keeping them host-local meant every other client
 * re-derived them. Import from `@ai-matrx/kit/format` directly; this file
 * keeps NO copy of any of them.
 *
 * WHAT STAYED, AND WHY. `clampedBarWidth` is deliberately NOT in the package.
 * It returns a CSS width and it CLAMPS — the exact opposite of the contract
 * every function that moved is built on. That is defensible here and only
 * here: a progress bar is decoration, the honest number lives in the label
 * beside it, and a bar drawn outside its own track is a rendering bug rather
 * than a claim about a value. Shipping a deliberately-clamping helper in the
 * same module as the honesty formatters would invite exactly the misuse they
 * exist to stop, so it stays host glue with its reasoning attached.
 *
 * The re-export below exists for ONE caller, `features/agent-apps/format.ts`,
 * which this lane was not permitted to edit. It re-exports the package's
 * functions — it does not redefine them — and should be deleted the moment
 * that file's owner points it at `@ai-matrx/kit/format`.
 */

export {
  formatCount,
  formatPercentFromFraction,
  formatUsd,
  isKnownNumber,
  safeRatio,
  sumKnown,
  UNKNOWN_DISPLAY,
} from "@ai-matrx/kit/format";

import { isKnownNumber } from "@ai-matrx/kit/format";

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
