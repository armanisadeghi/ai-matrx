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
  const abs = Math.abs(n);
  // Thresholds sit at 999.95×unit, not 1×unit: at one-decimal precision a value
  // like 999,999 rounds to "1000.0k", which should read "1M" — so it has to
  // cross into the higher tier just early to avoid a "1000k" / "1000M" glitch.
  if (abs >= 999_950_000) return `${trimZero(n / 1_000_000_000)}B`;
  if (abs >= 999_950) return `${trimZero(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trimZero(n / 1_000)}k`;
  return String(n);
}

function trimZero(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}
