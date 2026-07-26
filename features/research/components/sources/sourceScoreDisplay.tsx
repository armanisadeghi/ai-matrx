import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";
import type { ResearchSource } from "../../types";

/** Best Google rank across keywords (what pre-read scoring actually uses). */
export function formatBestKeywordRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "—";
  return String(rank);
}

/** @deprecated Prefer `formatBestKeywordRank`. Raw `rs_source.rank` is ambiguous. */
export function formatSearchRank(rank: number | null | undefined): string {
  return formatBestKeywordRank(rank);
}

/** User-facing labels for the four score axes on `rs_source`. */
export const QUALITY_SCORE_LABEL = "Quality";
export const PRIORITY_SCORE_LABEL = "Priority";
export const POST_READ_SCORE_LABEL = "Post";
export const AUTH_SCORE_LABEL = "Auth";

function preReadDisplayFromBreakdown(breakdown: Json | null): number | null {
  if (
    breakdown == null ||
    typeof breakdown !== "object" ||
    Array.isArray(breakdown)
  ) {
    return null;
  }
  const raw = (breakdown as Record<string, unknown>).pre_read_score_display;
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.round(raw)
    : null;
}

/**
 * Pre-read priority on the normalized 0–100 display scale (matches backend
 * `PreReadScoreBreakdown.pre_read_score_display`). `pre_read_score` is itself
 * already a normalized 0–100 value — just rounded for display.
 */
export function preReadDisplayScore(source: ResearchSource): number | null {
  const fromBreakdown = preReadDisplayFromBreakdown(source.pre_read_breakdown);
  if (fromBreakdown != null) return fromBreakdown;
  if (
    source.pre_read_score == null ||
    !Number.isFinite(source.pre_read_score)
  ) {
    return null;
  }
  return Math.round(source.pre_read_score);
}

export function formatPreReadDisplay(source: ResearchSource): string {
  const display = preReadDisplayScore(source);
  if (display == null) return "—";
  return String(display);
}

/** @deprecated Prefer `formatPreReadDisplay`. Raw float confuses users (1.2 ≠ 12%). */
export function formatPreReadScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return score.toFixed(2);
}

export function formatPostReadScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return String(Math.round(score));
}

/** Color bands for 0–100 absolute scores (Quality, Auth, Post). */
export function scoreDisplayTone(score: number | null | undefined): {
  text: string;
  bg: string;
} {
  if (score == null || !Number.isFinite(score)) {
    return { text: "text-muted-foreground/35", bg: "bg-transparent" };
  }
  const s = Math.round(score);
  if (s >= 75) {
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/15",
    };
  }
  if (s >= 50) {
    return {
      text: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-500/15",
    };
  }
  if (s >= 25) {
    return {
      text: "text-orange-700 dark:text-orange-300",
      bg: "bg-orange-500/15",
    };
  }
  return {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-500/15",
  };
}

/** @deprecated Use `scoreDisplayTone`. */
export const qualityScoreTone = scoreDisplayTone;

/**
 * Priority colors are RELATIVE to the topic's score spread — not absolute 0–100.
 * On a 1,000-source topic the top priority might be 48; that must read as "best",
 * not red. Uses percentile rank within `topicScores` (all included sources).
 */
export function priorityScoreTone(
  score: number | null | undefined,
  topicScores: readonly number[],
): { text: string; bg: string } {
  if (score == null || !Number.isFinite(score)) {
    return { text: "text-muted-foreground/35", bg: "bg-transparent" };
  }
  if (topicScores.length === 0) {
    return scoreDisplayTone(score);
  }

  const sorted = [...topicScores].sort((a, b) => a - b);
  if (sorted.length === 1 || sorted[0] === sorted[sorted.length - 1]) {
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/15",
    };
  }

  let strictlyAbove = 0;
  let below = 0;
  for (const v of topicScores) {
    if (v > score) strictlyAbove++;
    if (v < score) below++;
  }
  const percentile = below / (sorted.length - 1);

  // Top of the topic — on PRP-style topics only a handful exceed ~20 while
  // the long tail sits in single digits; always highlight the head of the pack.
  const topN = Math.min(3, sorted.length);
  if (strictlyAbove < topN) {
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/15",
    };
  }

  if (percentile >= 0.9) {
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/15",
    };
  }
  if (percentile >= 0.75) {
    return {
      text: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-500/15",
    };
  }
  if (percentile >= 0.5) {
    return {
      text: "text-sky-700 dark:text-sky-300",
      bg: "bg-sky-500/15",
    };
  }
  if (percentile >= 0.25) {
    return {
      text: "text-muted-foreground",
      bg: "bg-muted/40",
    };
  }
  return {
    text: "text-muted-foreground/60",
    bg: "bg-transparent",
  };
}

/** Collect 0–100 priority display values for topic-relative coloring. */
export function collectPriorityDisplayScores(
  sources: readonly ResearchSource[],
): number[] {
  const out: number[] = [];
  for (const s of sources) {
    const v = preReadDisplayScore(s);
    if (v != null) out.push(v);
  }
  return out;
}

function ProminentScoreCell({
  display,
  tone,
  className,
}: {
  display: string;
  tone: { text: string; bg: string };
  className?: string;
}) {
  if (display === "—") {
    return (
      <span
        className={cn(
          "text-xl font-semibold tabular-nums leading-none",
          tone.text,
          className,
        )}
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[2.75rem] min-h-[2.75rem] px-2 rounded-xl",
        "text-2xl font-bold tabular-nums leading-none tracking-tight",
        tone.text,
        tone.bg,
        className,
      )}
    >
      {display}
    </span>
  );
}

/** Large, centered Priority score — column 2 on the Sources table. */
export function PriorityCell({
  source,
  topicScores,
  className,
}: {
  source: ResearchSource;
  topicScores: readonly number[];
  className?: string;
}) {
  const score = preReadDisplayScore(source);
  const display = score == null ? "—" : String(score);
  return (
    <ProminentScoreCell
      display={display}
      tone={priorityScoreTone(score, topicScores)}
      className={className}
    />
  );
}

/** Large, centered Quality score (same styling as Priority). */
export function QualityCell({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const display = formatScore100(score);
  return (
    <ProminentScoreCell
      display={display}
      tone={scoreDisplayTone(score)}
      className={className}
    />
  );
}

/** 0–100 integer scores (`authority_score`, `final_source_score`, …). */
export function formatScore100(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return String(Math.round(score));
}

const CELL = "text-[11px] tabular-nums whitespace-nowrap text-muted-foreground";

export function ScoreCell({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        CELL,
        value === "—" && "text-muted-foreground/40",
        className,
      )}
    >
      {value}
    </span>
  );
}

/** All score axes, formatted for table cells. */
export function sourceScoreValues(
  source: ResearchSource,
  bestKeywordRank: number | null = null,
) {
  return {
    best: formatBestKeywordRank(bestKeywordRank),
    priority: formatPreReadDisplay(source),
    auth: formatScore100(source.authority_score),
    post: formatPostReadScore(source.post_read_score),
    quality: formatScore100(source.final_source_score),
  };
}

/** Count how many sources have each score axis populated (for toolbar summary). */
export function sourceScoreCoverage(sources: ResearchSource[]) {
  let priority = 0;
  let auth = 0;
  let post = 0;
  let quality = 0;
  for (const s of sources) {
    if (preReadDisplayScore(s) != null) priority++;
    if (s.authority_score != null) auth++;
    if (s.post_read_score != null) post++;
    if (s.final_source_score != null) quality++;
  }
  return {
    total: sources.length,
    priority,
    auth,
    post,
    quality,
  };
}

export function formatSourceScoreCoverage(sources: ResearchSource[]): string {
  const c = sourceScoreCoverage(sources);
  return (
    `${c.total} sources · ${PRIORITY_SCORE_LABEL} ${c.priority} · ` +
    `${AUTH_SCORE_LABEL} ${c.auth} · ${POST_READ_SCORE_LABEL} ${c.post} · ` +
    `${QUALITY_SCORE_LABEL} ${c.quality}`
  );
}

/**
 * Default table order — Priority descending (populated for every ranked source).
 */
export function compareSourcesByPriority(
  a: ResearchSource,
  b: ResearchSource,
): number {
  const pa = preReadDisplayScore(a) ?? -1;
  const pb = preReadDisplayScore(b) ?? -1;
  if (pa !== pb) return pb - pa;
  return compareSourcesByResearchScore(a, b);
}

/**
 * Export + table ordering: Priority → Quality → Auth → search rank.
 * Matches `compareSourcesByPriority`.
 */
export function sourceExportSortKey(
  source: ResearchSource,
): readonly [number, number, number, number] {
  return [
    -(preReadDisplayScore(source) ?? -1),
    -(source.final_source_score ?? -1),
    -(source.authority_score ?? -1),
    source.rank ?? Number.MAX_SAFE_INTEGER,
  ] as const;
}

export function compareSourcesForExport(
  a: ResearchSource,
  b: ResearchSource,
): number {
  const ka = sourceExportSortKey(a);
  const kb = sourceExportSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/** Synthesis ordering when Quality exists: final → pre-read → authority → rank. */
export function compareSourcesByResearchScore(
  a: ResearchSource,
  b: ResearchSource,
): number {
  const key = (s: ResearchSource) =>
    [
      -(s.final_source_score ?? -1),
      -(s.pre_read_score ?? -1),
      -(s.authority_score ?? -1),
      s.rank ?? Number.MAX_SAFE_INTEGER,
    ] as const;
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}
