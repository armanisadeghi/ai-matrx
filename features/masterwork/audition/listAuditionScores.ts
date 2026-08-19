/**
 * THE ONE quality-score read — shared by the Expert's home and the Operator's
 * Encore.
 *
 * Both surfaces answer the same question from the same rows: how did this
 * Rulebook's Masterwork score against the Expert's own reference work
 * (`platform.masterwork_run.quality_score`, stamped by the Audition judge —
 * 50 = parity)? The home reads the TREND (latest vs. previous); Encore reads
 * the LATEST plus the judge's plain-English verdict sentence. Two readers, one
 * query — a second copy of this select is a defect.
 */

import { supabase } from "@/utils/supabase/client";

/** One audited run's score, plus the sentence the judge wrote about it. */
export interface RulebookAuditionScore {
  rulebookId: string;
  qualityScore: number;
  createdAt: string;
  /**
   * The vanilla-comparison sentence ("The Masterwork beat vanilla AI on 2 of
   * 4 rules…"), persisted on the run result. Null on a two-way run.
   */
  verdictSentence: string | null;
}

/**
 * `result->>verdict_sentence` is pulled as a JSON path rather than selecting
 * the whole `result` object: that column carries the full judge payload
 * (both arms' findings, the vanilla output text), and no caller here needs it.
 * The select string is widened to `string` and the row shape declared with
 * `.returns<>()` — PostgREST's JSON-path select types blow the TS instantiation
 * budget otherwise (TS2589).
 */
const SCORE_SELECT: string =
  "rulebook_id,quality_score,created_at,result->>verdict_sentence";

interface ScoreRow {
  rulebook_id: string;
  quality_score: number | null;
  created_at: string;
  verdict_sentence: string | null;
}

/** Audited scores for these Rulebooks, OLDEST FIRST so a caller reads a trend. */
export async function listAuditionScores(
  rulebookIds: string[],
): Promise<RulebookAuditionScore[]> {
  if (rulebookIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select(SCORE_SELECT)
    .in("rulebook_id", rulebookIds)
    .not("quality_score", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<ScoreRow[]>();
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? [])
    .filter((row) => typeof row.quality_score === "number")
    .map((row) => ({
      rulebookId: row.rulebook_id,
      qualityScore: row.quality_score as number,
      createdAt: row.created_at,
      verdictSentence: row.verdict_sentence,
    }));
}

/** The most recent audited score per Rulebook, keyed by Rulebook id. */
export function latestScoreByRulebook(
  scores: RulebookAuditionScore[],
): Map<string, RulebookAuditionScore> {
  const byId = new Map<string, RulebookAuditionScore>();
  for (const score of scores) byId.set(score.rulebookId, score); // oldest first
  return byId;
}
