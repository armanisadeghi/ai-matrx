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
import { postgrestError } from "@/lib/failure/postgrestError";

/** The key `aidream/services/masterworks/build.py` stamps on every Masterwork. */
const BUILT_FROM_RULEBOOK = "built_from_rulebook";

function rulebookIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[BUILT_FROM_RULEBOOK];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Lookups already answered this page, by id (a woken or remounted run surface
 * re-reads nothing — THE REMOUNT LAW, 2026-10-02). A failed read is dropped so
 * the next ask tries again; a Masterwork's origin never changes.
 */
const rulebookByMasterwork = new Map<string, Promise<string | null>>();
const rulebookByRun = new Map<string, Promise<string | null>>();

function remembered(
  cache: Map<string, Promise<string | null>>,
  id: string,
  read: () => Promise<string | null>,
): Promise<string | null> {
  const known = cache.get(id);
  if (known) return known;
  // A refusal still answers null (enrichment never throws at a renderer); it
  // is just not remembered.
  const pending = read().catch(() => {
    cache.delete(id);
    return null;
  });
  cache.set(id, pending);
  return pending;
}

/** The Rulebook a Masterwork (a `workflow.definition`) was built from. */
export function rulebookIdForMasterwork(
  masterworkId: string,
): Promise<string | null> {
  return remembered(rulebookByMasterwork, masterworkId, () =>
    readRulebookIdForMasterwork(masterworkId),
  );
}

async function readRulebookIdForMasterwork(
  masterworkId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("metadata")
    .eq("id", masterworkId)
    .maybeSingle();
  if (error) throw postgrestError(error, { action: "finding the Rulebook this Masterwork was built from", fallback: "The database refused the read with no reason given." });
  if (!data) return null;
  return rulebookIdFromMetadata(data.metadata);
}

/** The Rulebook behind one run — its definition's, one hop further out. */
export function rulebookIdForRun(runId: string): Promise<string | null> {
  return remembered(rulebookByRun, runId, () => readRulebookIdForRun(runId));
}

async function readRulebookIdForRun(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("run")
    .select("definition_id")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw postgrestError(error, { action: "finding the Masterwork this run belongs to", fallback: "The database refused the read with no reason given." });
  if (!data?.definition_id) return null;
  return rulebookIdForMasterwork(String(data.definition_id));
}
