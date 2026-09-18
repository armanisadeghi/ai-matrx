import { formatCount } from "@ai-matrx/kit/format";
/**
 * Compact, human-readable counts for the research UI — the single formatter for
 * source counts, scraped character sizes, and any aggregate shown in a tight
 * cell. Trailing `.0` is trimmed so round values stay clean.
 *
 *   950       → "950"
 *   1234      → "1.2k"
 *   15000     → "15k"
 *   15432     → "15.4k"
 *   6234393   → "6.2M"
 *   null      → "—"
 *
 * Replaces the per-component `fmtNum` / `fmtSize` copies that had drifted
 * (one handled only `k`, the other only `M`).
 */
export function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  // The tier-crossing correction this body carried by hand — 999,999 must read
  // "1.0M", never "1000k" — is kit's own rule as of 0.14.0, and "B" is BILLION
  // in that voice by contract, which is what this file's byte-size shapeAllow
  // entry used to say in prose.
  return formatCount(n, { style: "compact" });
}
