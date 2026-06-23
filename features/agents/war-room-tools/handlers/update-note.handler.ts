/**
 * `war_room_update_note` handler — edit the tile's ACTIVE note.
 *
 * Resolves the tile's active note (the same note the Notes tab edits — the
 * active 'note' assignment via `selectActiveNoteId`), then writes via the REAL
 * `notesApi.update` and dispatches `upsertNoteFromServer` so the note in Redux
 * — and therefore the open Notes tab — reflects the change live.
 *
 * Modes:
 *   - replace (default) — `content` becomes the note body.
 *   - append            — `content` is added after the existing body, with a
 *                         blank line between. Read fresh from the slice so we
 *                         append to the latest content, not a stale snapshot.
 *
 * If the tile has no note yet we do NOT auto-create one (note creation is a
 * user action that links a fresh note to the tile) — we return a clear result
 * so the agent asks the user to add a note first.
 */

import type { WarRoomToolHandler } from "./types";
import type {
  WarRoomUpdateNoteArgs,
  WarRoomUpdateNoteResult,
} from "../tools/schemas";
import { update as updateNoteApi } from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";
import type { UpdateNoteInput } from "@/features/notes/types";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { selectActiveNoteId } from "@/features/war-room/redux/selectors";

export const updateNoteHandler: WarRoomToolHandler<
  WarRoomUpdateNoteArgs,
  WarRoomUpdateNoteResult
> = {
  name: "war_room_update_note",
  async run(args, ctx) {
    const { tileId, dispatch, getState } = ctx;

    const state = getState();
    const noteId = selectActiveNoteId(tileId)(state);
    if (!noteId) {
      return {
        ok: false,
        message:
          "This tile has no note yet. Ask the user to add a note to the tile first.",
      };
    }

    const updates: UpdateNoteInput = {};
    if (args.label !== undefined) updates.label = args.label;

    if (args.content !== undefined) {
      if ((args.mode ?? "replace") === "append") {
        const existing = (selectNoteById(noteId)(state)?.content ?? "").trim();
        updates.content = existing
          ? `${existing}\n\n${args.content}`
          : args.content;
      } else {
        updates.content = args.content;
      }
    }

    const saved = await updateNoteApi(noteId, updates);
    // Mirror into Redux so the Notes tab updates live (server data, full status).
    dispatch(upsertNoteFromServer({ note: saved, fetchStatus: "full" }));

    return {
      ok: true,
      note: {
        id: saved.id,
        label: saved.label ?? null,
        length: (saved.content ?? "").length,
      },
    };
  },
};
