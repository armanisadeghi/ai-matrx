/**
 * Masterwork's improvement-brain chips — the frontend half of the
 * elicitation-move producer (`aidream/services/masterwork_assists/`).
 *
 * The producer raises `platform.assists` rows on the Rulebook surface whose
 * action is a `navigate` back to `/masterwork/[id]?assist=<dedupe_key>`. The
 * row's `metadata.launch` carries the launch contract this module reads:
 * which lane to open and the composer seed (which, for the critique-a-bad-draft
 * move, contains the server-generated weak draft):
 *
 *   `interview`  — the Scout panel, composer SEEDED (never auto-sent)
 *   `ingest`     — the source/exemplar dialog
 *   `approaches` — THE Approach picker (browse/ApproachPickerDialog), the
 *                  whole `platform.approach` catalog. Added 2026-08-20: the
 *                  contract supported only the first two, so
 *                  `masterwork.approach_selector` — the "what should we try
 *                  next" Mandate, whose entire job is to name an Approach —
 *                  could not have opened one even if it had ever run.
 *   `approach:<key>` — one named Approach straight into its lane, for a move
 *                  that already knows which one it wants.
 *
 * One reader, one contract — the page never parses assist rows itself.
 */

import { createClient } from "@/utils/supabase/client";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";

/** `<client>/<surface>` — must match the producer's RULEBOOK_SURFACE. */
export const MASTERWORK_RULEBOOK_SURFACE = MASTERWORK_RULEBOOK_SURFACE_NAME;

export type MasterworkAssistOpen = "interview" | "ingest" | "approaches";

export interface MasterworkAssistLaunch {
  open: MasterworkAssistOpen;
  /**
   * `open: "approach:<key>"` names one `platform.approach` row to launch
   * directly; this carries the key and `open` reads as `approaches` so an
   * unknown key still lands the Expert on the picker instead of nowhere.
   */
  approachKey: string | null;
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
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const launch = (metadata as Record<string, unknown>).launch;
  if (typeof launch !== "object" || launch === null || Array.isArray(launch)) {
    return null;
  }
  const rec = launch as Record<string, unknown>;
  const raw = typeof rec.open === "string" ? rec.open : "";
  let open: MasterworkAssistOpen | null = null;
  let approachKey: string | null = null;
  if (raw === "ingest" || raw === "interview" || raw === "approaches") {
    open = raw;
  } else if (raw.startsWith("approach:")) {
    // NO DEAD ENDS: an unrecognised key still opens the picker, where the
    // Expert sees every Approach — never a chip that does nothing.
    open = "approaches";
    approachKey = raw.slice("approach:".length) || null;
  }
  if (!open) return null;
  return {
    open,
    approachKey,
    seed: typeof rec.seed === "string" && rec.seed.trim() ? rec.seed : null,
    move: typeof rec.move === "string" ? rec.move : null,
  };
}
