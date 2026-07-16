"use client";

/**
 * useNoteArtifactMaterialization — notes as a materialization surface.
 *
 * Binds the surface-agnostic canvas primitives to ONE note through the notes
 * feature's canonical save path (the same `updateNoteContent`-flush +
 * `saveNote` route content cleanup uses — auto-versioned, autosave-echo-safe;
 * NEVER a parallel write path):
 *
 *  - `materializeNoteArtifacts()` — convert the note's materializable blocks
 *    (fences / `<artifact>` tags / kind-JSON regions) into persisted
 *    `canvas_items` rows and rewrite the note body to canonical R1
 *    `<artifact id>` tags via `materializeBlocks({ system: "note" })`.
 *    Explicit user action only — a note is USER text; nothing auto-rewrites it.
 *  - `unbindSurface` — the `UnbindSurfaceContext` value that gives artifact
 *    refs rendered in the note preview their "Detach as text" path.
 *
 * The host (NoteContentEditor) supplies `getContent` (live, possibly-unsaved
 * body) and `applyContent` (its flush-to-Redux handler) so local editor state,
 * Redux, and the DB stay one write path.
 */

import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  materializeBlocks,
  isRealSourceId,
  type PersistRewrite,
} from "@/features/canvas/materialization/materializeBlocks";
import {
  textToContentBlocks,
  contentBlocksToText,
} from "@/features/canvas/materialization/textSurface";
import type { UnbindSurface } from "@/features/canvas/materialization/UnbindSurfaceContext";
import { saveNote } from "@/features/notes/redux/thunks";

export interface UseNoteArtifactMaterializationArgs {
  noteId: string;
  /** Live note body (local editor state — fresher than Redux mid-keystroke). */
  getContent: () => string;
  /** The editor's flush handler (local state + immediate Redux sync). */
  applyContent: (content: string) => void;
  readOnly?: boolean;
}

export function useNoteArtifactMaterialization(
  args: UseNoteArtifactMaterializationArgs,
) {
  const { noteId, getContent, applyContent, readOnly } = args;
  const dispatch = useAppDispatch();

  /** Canonical note rewrite writer: flush → Redux → saveNote (auto-versions). */
  const persistRewrite: PersistRewrite = async (rewritten) => {
    const text = contentBlocksToText(rewritten);
    if (!text.ok) return { ok: false, error: text.error };
    applyContent(text.text);
    const result = await dispatch(saveNote(noteId));
    if (saveNote.rejected.match(result)) {
      return {
        ok: false,
        error: result.error.message ?? "note save failed",
      };
    }
    return { ok: true };
  };

  const canMaterialize = isRealSourceId(noteId) && !readOnly;

  async function materializeNoteArtifacts(): Promise<void> {
    if (!canMaterialize) {
      toast.error("This note can't convert blocks right now");
      return;
    }
    const res = await materializeBlocks({
      source: { system: "note", id: noteId },
      content: textToContentBlocks(getContent()),
      persistRewrite,
    });
    for (const err of res.errors) {
      console.error(`[materializeNoteArtifacts] note ${noteId}:`, err);
    }
    if (res.errors.length > 0 && res.rewrittenContent == null) {
      toast.error(res.errors[0] ?? "Converting blocks failed");
      return;
    }
    if (res.materializedCount === 0) {
      toast.info("No convertible blocks found in this note");
      return;
    }
    toast.success(
      res.materializedCount === 1
        ? "1 block saved as an artifact"
        : `${res.materializedCount} blocks saved as artifacts`,
    );
  }

  const unbindSurface: UnbindSurface | null = canMaterialize
    ? {
        getContent: () => textToContentBlocks(getContent()),
        persistRewrite,
        surfaceNoun: "note",
      }
    : null;

  return { canMaterialize, materializeNoteArtifacts, unbindSurface };
}
