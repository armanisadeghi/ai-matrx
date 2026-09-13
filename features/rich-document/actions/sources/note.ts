// features/rich-document/actions/sources/note.ts
//
// Source adapter for note content. Edit + delete go through NotesAPI; both
// are async network calls that surface their errors back to the caller.

import type { ContentSource, ContentSourceAdapter } from "../../types";
import { supabase } from "@/utils/supabase/client";
import {
  isPreparedEditableNoteSource,
  noteEditableContentSource,
} from "@/features/notes/richDocumentSource";

export const noteAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "note") {
      throw new Error(
        `noteAdapter received non-note source: ${source.type}`,
      );
    }
    return `note-${source.noteId}`;
  },

  prepareEdit: async ({ source, isAuthenticated }) => {
    if (source.type !== "note" || !isAuthenticated) {
      throw new Error("Sign in before editing this note.");
    }
    if (source.mode === "editable") {
      if (!isPreparedEditableNoteSource(source)) {
        throw new Error("This note editor has no valid acknowledged base. Reload it before saving.");
      }
      return { source, content: source.displayedPhysicalSnapshot.content };
    }
    const { data: before, error: beforeError } = await supabase.auth.getSession();
    if (beforeError || !before.session?.user.id) {
      throw new Error("Sign in before editing this note.");
    }
    const { fetchNoteById } = await import("@/features/notes/service/notesService");
    const note = await fetchNoteById(source.noteId);
    const { data: after, error: afterError } = await supabase.auth.getSession();
    if (afterError || after.session?.user.id !== before.session.user.id) {
      throw new Error("Your sign-in changed while this note was opening. Try again.");
    }
    if (!note) throw new Error("This note is unavailable or you no longer have access.");
    return {
      source: noteEditableContentSource({
        note,
        actorId: before.session.user.id,
        sourceId: source.sourceId,
        snapshotId: `${source.sourceId}:${note.version}`,
      }),
      content: note.content ?? "",
    };
  },

  edit: async ({ newContent, source }) => {
    if (source.type !== "note" || !isPreparedEditableNoteSource(source)) {
      throw new Error(
        "A note must be prepared with its acknowledged full row before saving.",
      );
    }
    // Lazy import — NotesAPI pulls in service utilities and Supabase
    // client glue that we don't want in the chat bundle.
    const { persistNoteUpdate } = await import("@/features/notes/service/notesService");
    return persistNoteUpdate(source.noteId, { content: newContent }, {
      expectedVersion: source.editBase.version,
      expectedOrganizationId: source.editBase.organizationId,
      expectedActorId: source.editBase.actorId,
    });
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
