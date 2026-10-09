/**
 * A BUILT-IN STARTER OWNS ITS NOTES (2026-10-09). A starter's note tile carries only a `seed` (the words the note
 * starts with), never a record id. Using the starter files each seed as the person's own new Note, in the BOARD's
 * organization, and stores the new id on the tile - so a board never opens onto a note that is missing or that
 * lives in some other organization ("We couldn't find this note"). A seed that cannot be filed now stays a seed:
 * the tile files it when it opens, under the board's organization (`NoteItemBody`), never a different one.
 */

import type { BoardDocument, BoardNode } from "../board/document";
import { noteLabelFromText, noteSeed, noteSource } from "../items/work-sources";

export interface StarterNoteServices {
  /** File a new Note in the organization with these words; returns its id. */
  createNote(input: { label: string; content: string; organizationId: string }): Promise<{ id: string }>;
}

export const defaultStarterNoteServices: StarterNoteServices = {
  async createNote({ label, content, organizationId }) {
    const { NotesAPI } = await import("@/features/notes/service/notesApi");
    const note = await NotesAPI.create({ label, content, folder_name: "Draft", tags: [], organization_id: organizationId });
    return { id: note.id };
  },
};

export async function materializeStarterNotes(
  doc: BoardDocument,
  organizationId: string | null,
  services: StarterNoteServices = defaultStarterNoteServices,
): Promise<BoardDocument> {
  if (!organizationId) return doc;
  if (!doc.nodes.some((n) => noteSeed(n.source))) return doc;
  const nodes: BoardNode[] = await Promise.all(
    doc.nodes.map(async (node) => {
      const seed = noteSeed(node.source);
      if (!seed) return node;
      try {
        const created = await services.createNote({ label: noteLabelFromText(seed), content: seed, organizationId });
        return { ...node, source: noteSource(node.source, created.id) };
      } catch (err) {
        console.error("[board/starter] could not file the starter note now; the tile files it when it opens", err);
        return node;
      }
    }),
  );
  return { ...doc, nodes };
}
