/**
 * Audition run history + the Expert's own verdict — direct Supabase reads and
 * writes on `platform.masterwork_run` (pure UI<->DB; RLS: rulebook editor).
 *
 * Deliberately NOT in `features/masterwork/service.ts` (concurrently owned by
 * the Encore work); this is the Audition lane's own small read/write pair.
 *
 * - `quality_score` is the judge-DERIVED 0-100 aidream persists per audition
 *   (win 1 / tie 0.5 / loss 0 over judged rules; 50 = parity with the
 *   Expert's reference).
 * - `expert_score` / `expert_verdict` are the Expert's OWN call, written here
 *   after they read the verdict — the ground truth the judge's accuracy
 *   record (`platform.judge_verdict`) gets calibrated against later.
 */

import { supabase } from "@/utils/supabase/client";

export interface AuditionRunSummary {
  id: string;
  startedAt: string;
  qualityScore: number | null;
  expertScore: number | null;
  /** null = two-way run (no vanilla arm). */
  beatVanilla: boolean | null;
  verdict: string | null;
}

/** The Expert's 3-option call, on the same scale as quality_score:
 * 100 = better than my reference, 50 = as good, 0 = not there. */
export const EXPERT_CALLS = [
  { score: 100, label: "Better than me" },
  { score: 50, label: "As good" },
  { score: 0, label: "Not there" },
] as const;

export async function listAuditionRuns(
  rulebookId: string,
  limit = 20,
): Promise<AuditionRunSummary[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("id, started_at, quality_score, expert_score, result")
    .eq("rulebook_id", rulebookId)
    .eq("operation", "audition")
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const result = (row.result ?? {}) as Record<string, unknown>;
    const beat = result.beat_vanilla_rules;
    const lost = result.lost_to_vanilla_rules;
    return {
      id: row.id,
      startedAt: row.started_at,
      qualityScore: row.quality_score,
      expertScore: row.expert_score,
      beatVanilla:
        result.vanilla_compared === true &&
        typeof beat === "number" &&
        typeof lost === "number"
          ? beat > lost
          : null,
      verdict: typeof result.verdict === "string" ? result.verdict : null,
    };
  });
}

export async function saveExpertCall(
  runId: string,
  score: number,
  why: string,
): Promise<void> {
  const { error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .update({ expert_score: score, expert_verdict: why.trim() || null })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}
