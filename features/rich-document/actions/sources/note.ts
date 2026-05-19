// features/rich-document/actions/sources/note.ts
//
// Source adapter for note content. Edit + delete go through NotesAPI; both
// are async network calls that surface their errors back to the caller.

import type { ContentSource, ContentSourceAdapter } from "../../types";

export const noteAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "note") {
      throw new Error(
        `noteAdapter received non-note source: ${source.type}`,
      );
    }
    return `note-${source.noteId}`;
  },

  edit: async ({ newContent, source }) => {
    if (source.type !== "note") {
      throw new Error(
        `noteAdapter.edit received non-note source: ${source.type}`,
      );
    }
    // Lazy import — NotesAPI pulls in service utilities and Supabase
    // client glue that we don't want in the chat bundle.
    const { NotesAPI } = await import("@/features/notes/service/notesApi");
    await NotesAPI.update(source.noteId, { content: newContent });
  },

  delete: async ({ source }) => {
    if (source.type !== "note") {
      throw new Error(
        `noteAdapter.delete received non-note source: ${source.type}`,
      );
    }
    const { NotesAPI } = await import("@/features/notes/service/notesApi");
    await NotesAPI.remove(source.noteId);
  },
};
