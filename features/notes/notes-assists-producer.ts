/**
 * Deterministic Assists producer for Notes — the "unorganized pileup"
 * noticer. When enough of the user's notes carry NO organization at all
 * (no scope tags, no project/task link, no tags, default folder), one chip
 * offers the Notes Organizer agent pre-filled with the exact list, so the
 * fix is a review-and-send instead of a hunt.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - one dedupe key per user; `filterUndecidedKeys` first so a dismissal is
 *   durable — re-noticing never resurrects the chip.
 * - capped: at most ONE chip per sweep (the pileup aggregates), expires set.
 * - cheapest-first: pure reads over the already-hydrated Redux notes list
 *   and scope assignments; zero fetches, zero tokens to notice.
 * - the action is real: launches the `notes.organizer` agent slot
 *   (swappable from /agents/slots, no deploy) with the note list ready.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";

const SOURCE_KEY = "notes.unorganized";

/** `/notes` resolves to this surface (features/surfaces/utils/route-to-surface.ts). */
export const NOTES_ASSIST_SURFACE = "matrx-user/notes";

/** Agent-slot the launch action resolves at click time (agent.slot_definition,
 * seeded by migrations/agent_slots_assist_producers_seed.sql — swappable from
 * the admin slots console, no deploy). */
export const NOTES_ORGANIZER_SLOT = "notes.organizer";

// Conservative threshold — a couple of loose notes is normal; a pileup is
// the signal ("loud, never nagging").
const MIN_UNORGANIZED = 5;
const MAX_LISTED = 12;
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

export interface UnorganizedNote {
  id: string;
  label: string;
}

/**
 * One sweep per session (the strip gates it). Emits at most one assist.
 */
export async function produceNotesAssists(args: {
  userId: string;
  /** Notes with no organization signal at all — computed by the caller from
   * already-loaded Redux state (list + scope assignments). */
  unorganized: UnorganizedNote[];
  dispatch: AppDispatch;
}): Promise<void> {
  const { userId, unorganized, dispatch } = args;
  if (unorganized.length < MIN_UNORGANIZED) return;

  const dedupeKey = `${SOURCE_KEY}:${userId}`;
  const undecided = await filterUndecidedKeys([dedupeKey]);
  if (undecided.length === 0) return;

  const count = unorganized.length;
  const listed = unorganized.slice(0, MAX_LISTED);
  const overflow = count - listed.length;
  const draftText = [
    `I have ${count} notes with no organization — no folder, no tags, and no connection to a project, task, or workspace context. Help me organize them.`,
    "",
    "Unorganized notes (title — note id):",
    ...listed.map((n) => `- ${n.label} — ${n.id}`),
    ...(overflow > 0 ? [`…and ${overflow} more like these.`] : []),
    "",
    "Look at what these notes are about, suggest how to group them (folders, tags, or my workspace contexts), and once I agree, apply the organization for me.",
  ].join("\n");

  await emitAssistTracked(
    userId,
    {
      sourceKey: SOURCE_KEY,
      title: `Organize ${count} loose notes`,
      body: `${count} of your notes have no folder, tags, project, or context — so they won't show up when you browse by any of those. One click opens the Notes Organizer with the full list ready; it suggests a grouping and applies it only after you agree.`,
      action: {
        kind: "launch_agent",
        slotKey: NOTES_ORGANIZER_SLOT,
        agentName: "Notes Organizer",
        draftText,
      },
      surfaceName: NOTES_ASSIST_SURFACE,
      dedupeKey,
      expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
      priority: 5,
    },
    dispatch,
  );
}
