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

/**
 * The database row was acknowledged, but the initiating editor can no longer
 * safely claim a clean save. The receipt is retained so its private prepared
 * base can advance without installing it into a replacement actor's buffer.
 */
export class NotePostAcknowledgementError extends Error {
  readonly receipt: NoteSaveReceipt;
  readonly actorId: string;
  readonly kind: "actor-changed-after-ack" | "post-save-recovery";
  readonly sourceId?: string;
  readonly snapshotId?: string;

  constructor(args: {
    receipt: NoteSaveReceipt;
    actorId: string;
    kind: "actor-changed-after-ack" | "post-save-recovery";
    sourceId?: string;
    snapshotId?: string;
    cause: Error;
  }) {
    super("The note was acknowledged, but the editor must remain open to recover.", {
      cause: args.cause,
    });
    this.name = "NotePostAcknowledgementError";
    this.receipt = args.receipt;
    this.actorId = args.actorId;
    this.kind = args.kind;
    this.sourceId = args.sourceId;
    this.snapshotId = args.snapshotId;
  }
}
