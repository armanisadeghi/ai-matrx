/**
 * Sticky notes' words through the notes service (the only way the board
 * touches Notes): a Note in the person's "Sticky notes" folder.
 *
 * Organization (the `ensureOrgId` contract): a sticky is part of its board, so
 * its Note is filed in the BOARD's own organization; a board with none (a demo)
 * files in the active organization. Nothing here picks one.
 *
 * The folder: `createNote` with `folder_name` gets-or-creates it per person and
 * organization (`workbench.note_folder_get_or_create`), so every person has it
 * from their first sticky on.
 */

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { createNote, fetchNotesByIds, updateNote } from "@/features/notes/service/notesService";
import { STICKY_NOTES_FOLDER, type StickyNoteStore, stickyNoteLabel } from "../board/sticky-notes";

export function stickyNoteStore(boardOrganizationId: string | null): StickyNoteStore {
  return {
    create: async (text) => {
      const organization_id = await ensureOrgId(boardOrganizationId);
      const note = await createNote({
        label: stickyNoteLabel(text),
        content: text,
        folder_name: STICKY_NOTES_FOLDER,
        organization_id,
      });
      return note.id;
    },
    update: async (noteId, text) => {
      await updateNote(noteId, { content: text, label: stickyNoteLabel(text) });
    },
    read: async (noteIds) => {
      const rows = await fetchNotesByIds(noteIds);
      return new Map(rows.map((n) => [n.id, n.content ?? ""]));
    },
  };
}
