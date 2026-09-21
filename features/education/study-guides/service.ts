import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { hydrateNoteContextLinks } from "@/features/notes/service/noteContextAssociations";
import { associationsService } from "@/features/scopes/service/associationsService";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import type { Note, NoteListItem } from "@/features/notes/types";

export interface StudyTerm {
  id: string;
  setId: string;
  term: string;
  definition: string;
}

export interface StudyAnnotationAnchor {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
}

export interface StudyAnnotationInput {
  noteId: string;
  noteTitle: string;
  quote: string;
  comment?: string;
  kind: "highlight" | "note";
  organizationId: string;
  anchor?: StudyAnnotationAnchor;
  /** Retry a failed association without creating a second note. */
  existingAnnotationId?: string;
}

export class StudyAnnotationLinkError extends Error {
  constructor(public readonly note: Note, cause: unknown) {
    super("Your note was saved in Study annotations, but could not be linked to this guide. Retry to finish linking it.", { cause });
    this.name = "StudyAnnotationLinkError";
  }
}

/** Personal library; a guide's direct URL still uses the normal RLS record door. */
export async function loadStudyGuideIndex(): Promise<NoteListItem[]> {
  const userId = requireUserId();
  const rows = await readAllRows(
    ({ from, to }) => supabase.schema("workbench").from("notes")
      .select("id,created_by,label,folder_name,folder_id,tags,updated_at,position,organization_id,visibility,version", { count: "exact" })
      .eq("created_by", userId).is("deleted_at", null)
      .is("metadata->studyAnnotation", null)
      .order("updated_at", { ascending: false }).order("id").range(from, to),
    { label: "workbench.notes study guides" },
  );
  return hydrateNoteContextLinks(rows);
}

export const loadStudyGuide = (noteId: string): Promise<Note | null> => NotesAPI.getById(noteId, { failureMode: "throw" });

export async function loadStudyAnnotations(noteId: string): Promise<Note[]> {
  const userId = requireUserId();
  const result = await associationsService.listForEntity("note", noteId);
  if (!result.ok) throw new Error("Could not load your linked notes.", { cause: result.error });
  const ids = result.data.edges.filter((edge) =>
    edge.direction === "incoming" && edge.otherType === "note" && edge.role === "source",
  ).map((edge) => edge.otherId);
  if (!ids.length) return [];
  // Page the note read, and bound URL length independently of the result count.
  const rows: Note[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = await readAllRows(
      ({ from, to }) => supabase.schema("workbench").from("notes").select("*", { count: "exact" })
        .in("id", ids.slice(offset, offset + 100)).eq("created_by", userId)
        .is("deleted_at", null).not("metadata->studyAnnotation", "is", null)
        .order("created_at", { ascending: false }).order("id").range(from, to),
      { label: "workbench.notes study annotations" },
    );
    rows.push(...await hydrateNoteContextLinks(batch));
  }
  return rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id));
}

export async function saveStudyAnnotation(input: StudyAnnotationInput): Promise<Note> {
  if (!input.organizationId.trim()) {
    throw new OrganizationContextError(
      "organization_context_required",
      "Select an organization before sending this request.",
    );
  }
  if (!input.quote.trim()) throw new Error("Select a passage first.");
  const userId = requireUserId();
  const note = input.existingAnnotationId
    ? await NotesAPI.getById(input.existingAnnotationId, { failureMode: "throw" })
    : await NotesAPI.create({
      label: `${input.kind === "highlight" ? "Highlight" : "Note"}: ${input.noteTitle}`,
      content: input.comment?.trim() || input.quote,
      organization_id: input.organizationId,
      folder_name: "Study annotations",
      visibility: "personal",
      metadata: {
        studyAnnotation: {
          kind: input.kind,
          quote: input.quote,
          anchor: input.anchor ?? null,
        },
      },
    });
  if (!note || note.created_by !== userId) throw new Error("The saved note is no longer available.");
  if (input.existingAnnotationId) {
    const metadata = note.metadata;
    const annotation = metadata && typeof metadata === "object" && !Array.isArray(metadata) && "studyAnnotation" in metadata
      ? metadata.studyAnnotation : null;
    if (note.organization_id !== input.organizationId || !annotation || typeof annotation !== "object"
      || Array.isArray(annotation) || !("kind" in annotation) || !("quote" in annotation)
      || annotation.kind !== input.kind || annotation.quote !== input.quote) {
      throw new Error("The saved annotation no longer matches this passage. Select the passage again.");
    }
  }
  try {
    const linked = await associationsService.add({
      sourceType: "note", sourceId: note.id,
      targetType: "note", targetId: input.noteId,
      orgId: input.organizationId, role: "source",
      label: note.label,
    });
    if (!linked.ok) throw linked.error;
  } catch (error) {
    throw new StudyAnnotationLinkError(note, error);
  }
  return note;
}

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
