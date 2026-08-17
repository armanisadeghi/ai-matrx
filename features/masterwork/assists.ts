/**
 * Masterwork's improvement-brain chips — the frontend half of the
 * elicitation-move producer (`aidream/services/masterwork_assists/`).
 *
 * The producer raises `platform.assists` rows on the Rulebook surface whose
 * action is a `navigate` back to `/masterwork/[id]?assist=<dedupe_key>`. The
 * row's `metadata.launch` carries the launch contract this module reads:
 * which lane to open (`interview` opens the Scout panel with the composer
 * SEEDED — never auto-sent; `ingest` opens the source/exemplar dialog) and
 * the composer seed (which, for the critique-a-bad-draft move, contains the
 * server-generated weak draft).
 *
 * One reader, one contract — the page never parses assist rows itself.
 */

import { createClient } from "@/utils/supabase/client";

/** `<client>/<surface>` — must match the producer's RULEBOOK_SURFACE. */
export const MASTERWORK_RULEBOOK_SURFACE = "matrx-user/masterwork-rulebook";

export interface MasterworkAssistLaunch {
  open: "interview" | "ingest";
  seed: string | null;
  move: string | null;
}

/**
 * Resolve the launch contract for one pending assist by its dedupe key
 * (the `?assist=` query param the chip's navigate action carries).
 * Returns null when the row is gone or decided — the page then simply
 * lands without opening anything, which is the honest fallback.
 */
export async function fetchAssistLaunch(
  dedupeKey: string,
): Promise<MasterworkAssistLaunch | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("assists")
    .select("metadata")
    .eq("dedupe_key", dedupeKey)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = data.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const launch = (metadata as Record<string, unknown>).launch;
  if (typeof launch !== "object" || launch === null || Array.isArray(launch)) {
    return null;
  }
  const rec = launch as Record<string, unknown>;
  const open = rec.open === "ingest" ? "ingest" : rec.open === "interview" ? "interview" : null;
  if (!open) return null;
  return {
    open,
    seed: typeof rec.seed === "string" && rec.seed.trim() ? rec.seed : null,
    move: typeof rec.move === "string" ? rec.move : null,
  };
}
