import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { listEducationNotes } from "@/features/education/notes/education-notes";
import { associationsService } from "@/features/scopes/service/associationsService";
import type { Note, NoteListItem } from "@/features/notes/types";

export interface StudyTerm {
  id: string;
  setId: string;
  term: string;
  definition: string;
}

/**
 * Personal study-guide library: my notes marked for Education (the one
 * Education selector). An ordinary draft or chat save is a note, not a guide,
 * so it never lists here. A guide's direct URL still opens ANY note I can read
 * through the normal RLS record door (the Notes action bar links it).
 */
export const loadStudyGuideIndex = (): Promise<NoteListItem[]> => listEducationNotes({ owner: "mine" });

export const loadStudyGuide = (noteId: string): Promise<Note | null> => NotesAPI.getById(noteId, { failureMode: "throw" });

/** The same canonical membership edges used by Flashcard Studio. */
export async function loadStudyTerms(noteId: string): Promise<StudyTerm[]> {
  const links = await associationsService.listForEntity("note", noteId);
  if (!links.ok) throw new Error("Could not load associated flashcards.", { cause: links.error });
  const sets = [...new Set(links.data.edges.filter((edge) => edge.otherType === "fc_set").map((edge) => edge.otherId))];
  const terms = new Map<string, StudyTerm>();
  for (const setId of sets) {
    const members = await associationsService.listForTargetsVisible("fc_set", [setId]);
    if (!members.ok) throw new Error("Could not load the flashcard set.", { cause: members.error });
    const edges = members.data.edges.filter((edge) => edge.sourceType === "fc_card" && edge.role === "member")
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
    const ids = edges.map((edge) => edge.sourceId);
    for (let offset = 0; offset < ids.length; offset += 100) {
      const rows = await readAllRows(
        ({ from, to }) => supabase.schema("education").from("fc_card").select("id,front,back", { count: "exact" })
          .in("id", ids.slice(offset, offset + 100)).is("deleted_at", null)
          .order("id").range(from, to),
        { label: "education.fc_card study terms" },
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of ids.slice(offset, offset + 100)) {
        const card = byId.get(id);
        if (card) terms.set(id, { id, setId, term: card.front, definition: card.back ?? "" });
      }
    }
  }
  return [...terms.values()];
}
