/**
 * Shared cell + header helpers for the backlink tables — consumed by
 * BacklinkObservationTable and BacklinkDimensionTable so rank/spam/date
 * rendering can never drift between the two. Pure presentational pieces;
 * no data fetching, no table state.
 */

import type { ReactNode } from "react";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  spamTone,
  type SpamTone,
} from "@/features/marketing/components/backlinks/lib/vocab";

const SPAM_TONE_CLASS: Record<SpamTone, string> = {
  ok: "text-muted-foreground",
  warn: "text-warning",
  toxic: "text-destructive",
};

/** Spam score with the canonical ok/warn/toxic tone. */
export function SpamCell({ score }: { score: number | null }) {
  const tone = spamTone(score);
  if (score === null || tone === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`text-xs font-medium tabular-nums ${SPAM_TONE_CLASS[tone]}`}
    >
      {score}
    </span>
  );
}

/** A 0–1000 DataForSEO rank number. */
export function RankCell({
  value,
  zeroLabel,
}: {
  value: number | null;
  zeroLabel?: string;
}) {
  return value === null ? (
    <span className="text-xs text-muted-foreground">—</span>
  ) : value === 0 && zeroLabel ? (
    <span
      className="whitespace-nowrap text-[11px] text-muted-foreground"
      title="The provider returned a real value of 0; this metric is not missing."
    >
      {zeroLabel}
    </span>
  ) : (
    <span className="text-xs tabular-nums text-foreground">{value}</span>
  );
}

/** UTC date-only cell — these columns are days, never local datetimes. */
export function DateCell({ iso }: { iso: string | null }) {
  return (
    <span className="whitespace-nowrap text-xs text-foreground">
      {formatGscDate(iso)}
    </span>
  );
}

/** Column header with an explainer tooltip (e.g. the rank-scale note). */
export function headerWithTooltip(label: string, tooltip: string): ReactNode {
  return (
    <span title={tooltip} className="cursor-help underline decoration-dotted">
      {label}
    </span>
  );
}

/**
 * URL path for display — origin stripped for readability; callers keep the
 * full URL in `title` and copy payloads. Unparseable input passes through.
 */
export function urlPath(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path === "/" || path === "" ? parsed.hostname : path;
  } catch {
    return url;
  }
}

/** Top-N keys of a provider histogram (platform types, countries), by count. */
export function dominantKeys(
  histogram: Record<string, number> | null,
  max: number,
): string[] {
  if (!histogram) return [];
  return Object.entries(histogram)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([key]) => key);
}

/** Tiny muted chip for secondary facts (platform, country, rel attributes). */
export function MutedChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-muted px-1 py-px text-[10px] leading-4 text-muted-foreground">
      {children}
    </span>
  );
}
