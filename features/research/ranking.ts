/**
 * Source importance ranking.
 *
 * This is a websearch — rank is everything. A source can appear under several
 * keywords, each with its OWN search-engine rank (`rs_keyword_source.rank_for_keyword`;
 * `rs_source.rank` is ambiguous and must NOT be used). Importance rewards both
 * depth (good ranks) AND breadth (ranking for many keywords): a source in the
 * top 10 for three keywords (#5, #7, #9) outscores a single #1.
 *
 * The numbers live in IMPORTANCE_CONFIG below — tweak them there, not in the
 * functions. Keep this file pure + dependency-free so it runs identically on
 * the client and on a Next.js server, and mirror it in the Python backend
 * (aidream `research/ranking.py`) if the server ever needs to compute/store it.
 */

export interface ImportanceConfig {
  /** Ranks 1..topN earn weight; ranks worse than topN earn `beyondTopNWeight`. */
  topN: number;
  /** Weight at rank #1 (the best possible). */
  bestWeight: number;
  /** Linear decay per rank step: weight(r) = bestWeight - (r - 1) * decayPerRank. */
  decayPerRank: number;
  /** Weight for ranks worse than topN. 0 = they don't count toward importance. */
  beyondTopNWeight: number;
  /** Weight for an appearance with no/unknown rank. */
  unrankedWeight: number;
}

/**
 * Tweak these freely. Defaults give the linear "11 − rank" curve:
 *   #1 → 10, #5 → 6, #9 → 2, #10 → 1, #11+ → 0.
 * So #5 + #7 + #9 = 12 beats a lone #1 = 10 (breadth wins, as intended).
 */
export const IMPORTANCE_CONFIG: ImportanceConfig = {
  topN: 10,
  bestWeight: 10,
  decayPerRank: 1,
  beyondTopNWeight: 0,
  unrankedWeight: 0,
};

/** Weight a single search rank contributes to a source's importance. */
export function importanceWeight(
  rank: number | null | undefined,
  cfg: ImportanceConfig = IMPORTANCE_CONFIG,
): number {
  if (rank == null || rank < 1) return cfg.unrankedWeight;
  if (rank > cfg.topN) return cfg.beyondTopNWeight;
  return Math.max(0, cfg.bestWeight - (rank - 1) * cfg.decayPerRank);
}

/** A source's total importance = sum of its per-keyword rank weights. */
export function computeImportance(
  ranks: ReadonlyArray<number | null | undefined>,
  cfg: ImportanceConfig = IMPORTANCE_CONFIG,
): number {
  let total = 0;
  for (const r of ranks) total += importanceWeight(r, cfg);
  return Math.round(total * 100) / 100;
}

/** One keyword a source ranked for. */
export interface KeywordRank {
  keyword_id: string;
  keyword: string;
  rank: number | null;
}

export interface SourceImportance {
  /** Total importance score (higher = more important). */
  score: number;
  /** Best (lowest) single rank across all keywords, for a quick "#N" badge. */
  bestRank: number | null;
  /** How many keywords this source ranks for. */
  keywordCount: number;
  /** Per-keyword ranks, best first — for the "always visible" breakdown. */
  perKeyword: KeywordRank[];
}

/** Build the full importance summary for one source from its keyword ranks. */
export function summarizeImportance(
  perKeyword: ReadonlyArray<KeywordRank>,
  cfg: ImportanceConfig = IMPORTANCE_CONFIG,
): SourceImportance {
  const sorted = [...perKeyword].sort((a, b) => {
    const ra = a.rank ?? Number.POSITIVE_INFINITY;
    const rb = b.rank ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });
  const ranks = sorted.map((k) => k.rank);
  const ranked = ranks.filter((r): r is number => r != null && r >= 1);
  return {
    score: computeImportance(ranks, cfg),
    bestRank: ranked.length > 0 ? Math.min(...ranked) : null,
    keywordCount: sorted.length,
    perKeyword: sorted,
  };
}
