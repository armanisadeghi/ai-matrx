import type { Note, NoteRow } from "../types";

export type NoteContextField = "project_id" | "task_id";

export class NoteUpdateConflictError extends Error {
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly actualStoredNote: NoteRow;

  constructor(args: {
    expectedVersion: number;
    actualStoredNote: NoteRow;
  }) {
    super("This note changed elsewhere. Refresh it before saving your changes.");
    this.name = "NoteUpdateConflictError";
    this.expectedVersion = args.expectedVersion;
    this.currentVersion = args.actualStoredNote.version;
    this.actualStoredNote = args.actualStoredNote;
  }
}

export class NoteContextLinkPartialError extends Error {
  readonly succeededFields: NoteContextField[];
  readonly failedFields: NoteContextField[];
  readonly safeCauses: Partial<Record<NoteContextField, string>>;

  constructor(args: {
    succeededFields: NoteContextField[];
    failedFields: NoteContextField[];
    safeCauses: Partial<Record<NoteContextField, string>>;
  }) {
    super("The note was saved, but one or more context links could not be saved.");
    this.name = "NoteContextLinkPartialError";
    this.succeededFields = args.succeededFields;
    this.failedFields = args.failedFields;
    this.safeCauses = args.safeCauses;
  }
}

export class NoteContextPartialSaveError extends Error {
  readonly databaseWrite: "saved" | "unchanged";
  readonly actualStoredNote: Note;
  readonly succeededFields: NoteContextField[];
  readonly failedFields: NoteContextField[];
  readonly safeCauses: Partial<Record<NoteContextField, string>>;

  constructor(args: {
    databaseWrite: "saved" | "unchanged";
    actualStoredNote: Note;
    succeededFields: NoteContextField[];
    failedFields: NoteContextField[];
    safeCauses: Partial<Record<NoteContextField, string>>;
  }) {
    super("The note was saved, but one or more context links could not be saved.");
    this.name = "NoteContextPartialSaveError";
    this.databaseWrite = args.databaseWrite;
    this.actualStoredNote = args.actualStoredNote;
    this.succeededFields = args.succeededFields;
    this.failedFields = args.failedFields;
    this.safeCauses = args.safeCauses;
  }
}
