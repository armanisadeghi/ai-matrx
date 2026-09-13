import type {
  ContentSource,
  NoteDisplayedPhysicalSnapshot,
  NoteEditableContentSource,
  NoteIdentityContentSource,
} from "@/features/rich-document/types";
import type { Note } from "./types";
import type { NoteSaveReceipt } from "./service/noteSaveErrors";

function validVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function displayedPhysicalSnapshot(note: Note): NoteDisplayedPhysicalSnapshot {
  return {
    id: note.id,
    organization_id: note.organization_id,
    version: note.version,
    content: note.content ?? "",
    label: note.label,
    folder_name: note.folder_name,
    folder_id: note.folder_id,
    tags: note.tags,
    metadata: note.metadata,
    visibility: note.visibility,
    position: note.position,
    project_id: note.project_id,
    task_id: note.task_id,
  };
}

/** Identity-only triggers must be prepared through an authorized full-row read. */
export function noteIdentityContentSource(noteId: string, sourceId = `note:${noteId}`): NoteIdentityContentSource {
  return { type: "note", mode: "identity", noteId, sourceId };
}

/** Creates an editable source only when the displayed row and CAS base agree. */
export function noteEditableContentSource(args: {
  note: Note;
  actorId: string;
  sourceId: string;
  snapshotId: string;
  actingSelection?: string;
}): NoteEditableContentSource {
  const { note, actorId, sourceId, snapshotId, actingSelection } = args;
  if (!note.id || !note.organization_id || !actorId || !sourceId || !snapshotId || !validVersion(note.version)) {
    throw new Error("A Notes editable source requires an acknowledged note, actor, source, and revision.");
  }
  return {
    type: "note",
    mode: "editable",
    noteId: note.id,
    sourceId,
    snapshotId,
    editBase: { noteId: note.id, organizationId: note.organization_id, version: note.version, actorId },
    displayedPhysicalSnapshot: displayedPhysicalSnapshot(note),
    ...(actingSelection === undefined ? {} : { actingSelection }),
  };
}

export function isPreparedEditableNoteSource(source: ContentSource): source is NoteEditableContentSource {
  if (source.type !== "note" || source.mode !== "editable") return false;
  const { editBase, displayedPhysicalSnapshot } = source;
  return (
    editBase.noteId === source.noteId &&
    editBase.noteId === displayedPhysicalSnapshot.id &&
    editBase.organizationId === displayedPhysicalSnapshot.organization_id &&
    editBase.version === displayedPhysicalSnapshot.version &&
    Boolean(editBase.actorId) &&
    validVersion(editBase.version)
  );
}

/** Advances only the callback owner's immutable prepared base after a receipt. */
export function advancePreparedNoteSource(
  source: NoteEditableContentSource,
  receipt: NoteSaveReceipt,
): NoteEditableContentSource {
  const note = receipt.note;
  if (
    note.id !== source.noteId ||
    note.organization_id !== source.editBase.organizationId ||
    !validVersion(note.version)
  ) {
    throw new Error("The acknowledged note receipt does not match this editor source.");
  }
  return noteEditableContentSource({
    note,
    actorId: source.editBase.actorId,
    sourceId: source.sourceId,
    snapshotId: `${source.snapshotId}:${note.version}`,
  });
}
