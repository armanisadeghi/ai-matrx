import type {
  ContentSource,
  NoteDisplayedPhysicalSnapshot,
  NoteEditableContentSource,
  NoteIdentityContentSource,
} from "@/features/rich-document/types";
import type { Note } from "./types";
import type { NoteSaveReceipt } from "./service/noteSaveErrors";
import type { NoteRecord } from "./redux/notes.types";

function validVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSerializableJson(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.keys(value).length === value.length && value.every((item) => isSerializableJson(item, seen));
  }
  if (typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).every((item) => isSerializableJson(item, seen));
}

function freezeSerializable<T>(value: T): T {
  const copy = structuredClone(value);
  if (!isSerializableJson(copy)) {
    throw new Error("A Notes edit source must contain only serializable physical fields.");
  }
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
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
    tags: freezeSerializable(note.tags),
    metadata: freezeSerializable(note.metadata),
    visibility: note.visibility,
    position: note.position,
    project_id: note.project_id,
    task_id: note.task_id,
  };
}

/**
 * The Redux editor must obtain its base from a separately retained full
 * acknowledgement. `_fieldHistory` and the displayed record are never bases.
 */
export function captureNoteEditSourceFromRecord(args: {
  record: NoteRecord;
  displayedNote: Note;
  actorId: string;
  sourceId: string;
  snapshotId: string;
  actingSelection?: string;
}): NoteEditableContentSource {
  if (!args.record._acknowledgedPhysicalSnapshot) {
    throw new Error("This note has no acknowledged full snapshot. Reload it before editing.");
  }
  return captureNoteEditSource({
    acknowledgedNote: args.record._acknowledgedPhysicalSnapshot,
    displayedNote: args.displayedNote,
    actorId: args.actorId,
    sourceId: args.sourceId,
    snapshotId: args.snapshotId,
    ...(args.actingSelection === undefined ? {} : { actingSelection: args.actingSelection }),
  });
}

/** Identity-only triggers must be prepared through an authorized full-row read. */
export function noteIdentityContentSource(noteId: string, sourceId = `note:${noteId}`): NoteIdentityContentSource {
  return { type: "note", mode: "identity", noteId, sourceId };
}

/** Creates an editable source only when the displayed row and CAS base agree. */
export function captureNoteEditSource(args: {
  /** The exact acknowledged row/revision; never replace this with dirty text. */
  acknowledgedNote: Note;
  /** The complete physical fields currently displayed by this editor. */
  displayedNote: Note;
  actorId: string;
  sourceId: string;
  snapshotId: string;
  actingSelection?: string;
}): NoteEditableContentSource {
  const { acknowledgedNote, displayedNote, actorId, sourceId, snapshotId, actingSelection } = args;
  if (
    !acknowledgedNote.id ||
    !acknowledgedNote.organization_id ||
    acknowledgedNote.id !== displayedNote.id ||
    acknowledgedNote.organization_id !== displayedNote.organization_id ||
    !actorId || !sourceId || !snapshotId || !validVersion(acknowledgedNote.version)
  ) {
    throw new Error("A Notes editable source requires an acknowledged note, actor, source, and revision.");
  }
  return freezeSerializable({
    type: "note",
    mode: "editable",
    noteId: acknowledgedNote.id,
    sourceId,
    snapshotId,
    editBase: {
      noteId: acknowledgedNote.id,
      organizationId: acknowledgedNote.organization_id,
      version: acknowledgedNote.version,
      actorId,
    },
    acknowledgedPhysicalSnapshot: displayedPhysicalSnapshot(acknowledgedNote),
    displayedPhysicalSnapshot: displayedPhysicalSnapshot(displayedNote),
    ...(actingSelection === undefined ? {} : { actingSelection }),
  });
}

/** Compatibility name for callers that currently display their acknowledged row. */
export function noteEditableContentSource(args: {
  note: Note;
  actorId: string;
  sourceId: string;
  snapshotId: string;
  actingSelection?: string;
}): NoteEditableContentSource {
  return captureNoteEditSource({
    acknowledgedNote: args.note,
    displayedNote: args.note,
    actorId: args.actorId,
    sourceId: args.sourceId,
    snapshotId: args.snapshotId,
    ...(args.actingSelection === undefined ? {} : { actingSelection: args.actingSelection }),
  });
}

export function isPreparedEditableNoteSource(source: ContentSource): source is NoteEditableContentSource {
  if (!source || typeof source !== "object" || source.type !== "note" || source.mode !== "editable") return false;
  const { editBase, displayedPhysicalSnapshot, acknowledgedPhysicalSnapshot } = source;
  if (
    !editBase || typeof editBase !== "object" ||
    !displayedPhysicalSnapshot || typeof displayedPhysicalSnapshot !== "object" ||
    !acknowledgedPhysicalSnapshot || typeof acknowledgedPhysicalSnapshot !== "object"
  ) return false;
  return (
    editBase.noteId === source.noteId &&
    editBase.noteId === displayedPhysicalSnapshot.id &&
    editBase.organizationId === displayedPhysicalSnapshot.organization_id &&
    editBase.noteId === acknowledgedPhysicalSnapshot.id &&
    editBase.organizationId === acknowledgedPhysicalSnapshot.organization_id &&
    editBase.version === acknowledgedPhysicalSnapshot.version &&
    editBase.version === displayedPhysicalSnapshot.version &&
    Boolean(editBase.actorId) && Boolean(source.sourceId) && Boolean(source.snapshotId) &&
    isSerializableJson(acknowledgedPhysicalSnapshot.tags) &&
    isSerializableJson(acknowledgedPhysicalSnapshot.metadata) &&
    isSerializableJson(source.displayedPhysicalSnapshot.tags) &&
    isSerializableJson(source.displayedPhysicalSnapshot.metadata) &&
    validVersion(editBase.version)
  );
}

/** Advances only the callback owner's immutable prepared base after a receipt. */
export function advancePreparedNoteSource(
  source: NoteEditableContentSource,
  receipt: NoteSaveReceipt,
  submittedContent?: string,
): NoteEditableContentSource {
  const note = receipt.note;
  if (
    note.id !== source.noteId ||
    note.organization_id !== source.editBase.organizationId ||
    !validVersion(note.version)
    || (submittedContent !== undefined && note.content !== submittedContent)
  ) {
    throw new Error("The acknowledged note receipt does not match this editor source.");
  }
  return captureNoteEditSource({
    acknowledgedNote: note,
    displayedNote: note,
    actorId: source.editBase.actorId,
    sourceId: source.sourceId,
    snapshotId: `${source.snapshotId}:${note.version}`,
  });
}
