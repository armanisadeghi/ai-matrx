// features/rich-document/actions/sources/note.ts
//
// Source adapter for note content. Phase 0: only instanceKeyPrefix.
// Phase 1 plugs in edit/delete via NotesAPI.

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
};
