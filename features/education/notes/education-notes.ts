// features/education/notes/education-notes.ts
//
// THE ONE ANSWER TO "which notes belong to Education?"
//
// Notes are platform notes (workbench.notes) — the Notes app lists every one of
// them. Education lists ONLY the notes explicitly marked for it: the ones in the
// Study Notes folder. Both writers stamp that mark (the converter's
// notesGenerator here and aidream's graph_actions/education/persist.py), a note
// created from an Education surface is created there, and a person puts any
// other note into Education from the Notes app with "Move to Folder" → Study
// Notes. A plain draft, chat save or quick note is a note, never Education
// material.
//
// Every Education surface that lists notes reads through here — the Smart Notes
// home and the study-guide library in the client, and the Education Library RPC
// (`public.edu_library_scope_rows`, which carries the same predicate in SQL,
// migrations/edu_library_notes_education_only.sql). The guard
// `__tests__/education-notes.test.ts` fails if a plain note reaches an
// Education list, or if an Education file lists notes around this module.

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { scopeToOwner } from "@/lib/list-scope";
import { hydrateNoteContextLinks } from "@/features/notes/service/noteContextAssociations";
import type { NoteListItem } from "@/features/notes/types";
import { STUDY_NOTES_FOLDER } from "./study-notes-folder";

/** The folder a note must be in to belong to Education. */
export const EDUCATION_NOTES_FOLDER = STUDY_NOTES_FOLDER;

/** True only for a note explicitly marked for Education. */
export function isEducationNote(note: { folder_name: string | null | undefined }): boolean {
  return note.folder_name === EDUCATION_NOTES_FOLDER;
}

/** The create fields that mark a note created from an Education surface. */
export const EDUCATION_NOTE_CREATE_FIELDS = { folder_name: EDUCATION_NOTES_FOLDER } as const;

const EDUCATION_NOTE_LIST_COLUMNS =
  "id,created_by,label,folder_name,folder_id,tags,updated_at,position,organization_id,visibility,version";

export interface ListEducationNotesOptions {
  /**
   * `mine` — only notes I created (the personal study-guide library).
   * `default` — the note token's registry list scope, exactly as the Notes app
   * list decides it (the Smart Notes home, which filters visibility itself).
   */
  owner?: "mine" | "default";
}

/** Every live note marked for Education that this person may list, newest first. */
export async function listEducationNotes(
  options: ListEducationNotesOptions = {},
): Promise<NoteListItem[]> {
  const userId = requireUserId();
  const ownerOnly = options.owner === "mine" ? true : await scopeToOwner("note");
  const rows = await readAllRows(
    ({ from, to }) => {
      let query = supabase
        .schema("workbench")
        .from("notes")
        .select(EDUCATION_NOTE_LIST_COLUMNS, { count: "exact" })
        .is("deleted_at", null)
        .eq("folder_name", EDUCATION_NOTES_FOLDER);
      if (ownerOnly) query = query.eq("created_by", userId);
      return query.order("updated_at", { ascending: false }).order("id").range(from, to);
    },
    { label: "workbench.notes education notes" },
  );
  // Belt to the query's braces: whatever a future query change returns, a
  // note that is not marked for Education never reaches an Education list.
  return hydrateNoteContextLinks(rows.filter(isEducationNote)) as Promise<NoteListItem[]>;
}
