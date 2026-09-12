import type { Note, NoteRow } from "../types";

export type NoteContextField = "project_id" | "task_id";

export interface NoteSaveReceipt {
  note: Note;
  databaseWrite: "saved" | "unchanged";
  succeededFields: NoteContextField[];
  failedFields: NoteContextField[];
  safeCauses: Partial<Record<NoteContextField, string>>;
  postSaveRecoveryError?: Error;
}

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

export class NoteContextPartialSaveError extends Error {
  readonly receipt: NoteSaveReceipt;
  readonly databaseWrite: "saved" | "unchanged";
  readonly actualStoredNote: Note;
  readonly succeededFields: NoteContextField[];
  readonly failedFields: NoteContextField[];
  readonly safeCauses: Partial<Record<NoteContextField, string>>;

  constructor(receipt: NoteSaveReceipt) {
    super("The note was saved, but one or more context links could not be saved.");
    this.name = "NoteContextPartialSaveError";
    this.receipt = receipt;
    this.databaseWrite = receipt.databaseWrite;
    this.actualStoredNote = receipt.note;
    this.succeededFields = receipt.succeededFields;
    this.failedFields = receipt.failedFields;
    this.safeCauses = receipt.safeCauses;
  }
}
