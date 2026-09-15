// features/masterwork/review/signature.ts
//
// THE EXPERT'S SIGNATURE ON A RESULT — the single most important signal.
//
// Arman, 2026-09-15: "If the system is getting a result that the expert says
// 'Yes, that's great' or simply gives a thumbs up, then we have the most
// important indication we need." Doctrine §7: "The expert's thumbs-up on a
// result is the most important signal we have… The expert's 'yes, that's mine'
// is the release gate."
//
// 🚨 NO NEW TABLE, NO NEW PATH. A signature is a row in
// `platform.output_feedback` — the platform primitive for "was this AI output
// good?" (`lib/output-feedback/FEATURE.md`), written through the same
// `upsert_output_feedback` RPC every thumbs button in the app uses. What makes
// it a SIGNATURE rather than an ordinary thumb is the surface that captured it:
// `surface_name = masterwork.expert_signature`. That one field is what lets the
// Rulebook count its own signed outputs without a second store, a second
// verdict vocabulary, or a migration.
//
//   thumbs up   -> verdict `positive` on this surface = SIGNED. It is a
//                  positive example for the hindsight/replay loop, which reads
//                  the same table.
//   thumbs down -> verdict `negative`, and the existing correction flow opens:
//                  the Expert's corrected text lands on the SAME row
//                  (`corrected_content`, what Level-1 replay ranks against) and
//                  becomes a rule candidate in their Rulebook.
//
// Subject tokens are the canonical `platform.entity_types` tokens the FK
// enforces: `workflow_run` for a Masterwork run (Encore, the Studio's Try box),
// `message` for a Conductor answer or an Oracle turn.

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { operationFailed } from "@/utils/errors";
import { fetchOutputFeedbackForSubjects } from "@/lib/output-feedback/service";

/** The surface every expert sign-off writes under. Never reused elsewhere. */
export const EXPERT_SIGNATURE_SURFACE = "masterwork.expert_signature";

/** A finished Masterwork run — `workflow.run`, token `workflow_run`. */
export const MASTERWORK_RUN_SUBJECT_TYPE = "workflow_run";
/** A Conductor answer or an Oracle turn — `chat.message`, token `message`. */
export const MASTERWORK_MESSAGE_SUBJECT_TYPE = "message";

/**
 * The Conductor's answers are ORDINARY CHAT MESSAGES in the canonical column,
 * and that column already carries the platform thumbs — same table, same RPC,
 * plus the Oracle nudge that turns a judged answer into a rule candidate. A
 * second thumbs control beside it would be exactly the duplicate-affordance
 * defect `lib/output-feedback/FEATURE.md` was written to end. So the Conductor
 * is counted, not re-instrumented: its rows are the ones whose `surface_name`
 * is this Rulebook's conductor surface key (`ConductorPanel`'s `surfaceKey`).
 *
 * The Oracle is the same loop in `/chat`, where the message belongs to no
 * Rulebook — its thumbs-up is a positive example and its thumbs-down opens the
 * rule-candidate dialog, but there is nothing to attribute it to, so it is not
 * counted here rather than being guessed at.
 */
export function conductorSurfaceKey(rulebookId: string): string {
  return `masterwork-conduct:${rulebookId}`;
}

export interface SignedOutputTally {
  /** Runs of this Rulebook's Masterworks the Expert signed. */
  signed: number;
  /** Runs they marked wrong — each one is a rule candidate waiting. */
  corrected: number;
}

/**
 * How many of this Rulebook's Masterwork run outputs carry a signature.
 *
 * Reads only what RLS lets this viewer read, which is their own verdicts plus
 * their organization's — so the number is "signatures visible from here", and
 * the surface that renders it says exactly that rather than implying it is
 * every signature that exists anywhere.
 *
 * Returns zeroes for a Rulebook with no built Masterworks: no runs, no
 * signatures, and that is a true fact rather than a loading state.
 */
export async function countSignedOutputs(opts: {
  rulebookId: string;
  masterworkIds: readonly string[];
}): Promise<SignedOutputTally> {
  const tally = { signed: 0, corrected: 0 };

  // Leg 1 — the Masterwork RUN outputs, signed through `ExpertSignOff`.
  if (opts.masterworkIds.length > 0) {
    const { data, error } = await supabase
      .schema("workflow")
      .from("run")
      .select("id")
      .in("definition_id", opts.masterworkIds as string[]);
    if (error)
      throw operationFailed("count the signatures on this Rulebook's results", error);
    const runIds = (data ?? []).map((row) => String(row.id));
    if (runIds.length > 0) {
      const rows = await fetchOutputFeedbackForSubjects(
        MASTERWORK_RUN_SUBJECT_TYPE,
        runIds,
      );
      for (const row of rows) {
        if (row.surfaceName !== EXPERT_SIGNATURE_SURFACE) continue;
        if (row.verdict === "positive") tally.signed += 1;
        else if (row.verdict === "negative") tally.corrected += 1;
      }
    }
  }

  // Leg 2 — the Conductor's answers, judged with the platform thumbs the chat
  // column already carries. `readAllRows` because this count is treated as
  // complete, and a bare select silently stops at 1000.
  const conductorRows = await readAllRows<{ id: string; verdict: string }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("output_feedback")
        .select("id,verdict", { count: "exact" })
        .eq("subject_type", MASTERWORK_MESSAGE_SUBJECT_TYPE)
        .eq("surface_name", conductorSurfaceKey(opts.rulebookId))
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "platform.output_feedback (conductor signatures)" },
  );
  for (const row of conductorRows) {
    if (row.verdict === "positive") tally.signed += 1;
    else if (row.verdict === "negative") tally.corrected += 1;
  }

  return tally;
}
