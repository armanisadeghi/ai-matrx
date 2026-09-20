/**
 * WHICH RULEBOOK IS THIS MASTERWORK'S — the one read that makes the rules
 * findable from a run box or a run permalink, with no page having to know.
 *
 * `build.py` stamps `metadata.built_from_rulebook` on every Masterwork it
 * builds, so the Rulebook is one hop from a `workflow.definition` id and two
 * from a `workflow.run` id. Both reads are enrichment: a refusal answers null
 * (the ruling then renders verbatim) and never throws at a renderer.
 *
 * Opened by walk 13, N3.
 */

import { supabase } from "@/utils/supabase/client";

/** The key `aidream/services/masterworks/build.py` stamps on every Masterwork. */
const BUILT_FROM_RULEBOOK = "built_from_rulebook";

function rulebookIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[BUILT_FROM_RULEBOOK];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The Rulebook a Masterwork (a `workflow.definition`) was built from. */
export async function rulebookIdForMasterwork(
  masterworkId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("metadata")
    .eq("id", masterworkId)
    .maybeSingle();
  if (error || !data) return null;
  return rulebookIdFromMetadata(data.metadata);
}

/** The Rulebook behind one run — its definition's, one hop further out. */
export async function rulebookIdForRun(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("run")
    .select("definition_id")
    .eq("id", runId)
    .maybeSingle();
  if (error || !data?.definition_id) return null;
  return rulebookIdForMasterwork(String(data.definition_id));
}
