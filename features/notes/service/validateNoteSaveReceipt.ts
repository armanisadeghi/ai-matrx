import type { Note } from "../types";
import type { NoteContextField, NoteSaveReceipt } from "./noteSaveErrors";
import { equalNoteSnapshotValue } from "../noteSnapshotEquality";

type Physical = Pick<Note, "content" | "label" | "folder_id" | "tags" | "visibility">;
const contexts: readonly NoteContextField[] = ["project_id", "task_id"];
function dense(value: unknown): value is NoteContextField[] {
  return Array.isArray(value) && Object.getOwnPropertySymbols(value).length === 0 && Object.getOwnPropertyNames(value).every((key) => key === "length" || (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)) && value.every((field, index) => { const d = Object.getOwnPropertyDescriptor(value, String(index)); return !!d && "value" in d && contexts.includes(field as NoteContextField); }) && new Set(value).size === value.length;
}
function causes(value: unknown, failed: readonly NoteContextField[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(([key, val]) => contexts.includes(key as NoteContextField) && failed.includes(key as NoteContextField) && typeof val === "string");
}
export function validateNoteSaveReceipt(args: { base: { noteId: string; organizationId: string; version: number }; receipt: unknown; submittedPhysical: Partial<Physical>; contextFields?: readonly NoteContextField[]; requirePhysicalWrite?: boolean }): NoteSaveReceipt {
  const receipt = args.receipt as NoteSaveReceipt;
  if (!receipt || typeof receipt !== "object" || !receipt.note || (receipt.databaseWrite !== "saved" && receipt.databaseWrite !== "unchanged") || !dense(receipt.succeededFields) || !dense(receipt.failedFields) || receipt.succeededFields.some((field) => receipt.failedFields.includes(field)) || !causes(receipt.safeCauses, receipt.failedFields)) throw new Error("The note save returned an invalid acknowledgement receipt.");
  if (receipt.note.id !== args.base.noteId || receipt.note.organization_id !== args.base.organizationId || !Number.isSafeInteger(receipt.note.version) || receipt.note.version < 0) throw new Error("The note acknowledgement receipt belongs to a different note.");
  if ((receipt.databaseWrite === "saved" && receipt.note.version <= args.base.version) || (receipt.databaseWrite === "unchanged" && receipt.note.version !== args.base.version) || (args.requirePhysicalWrite && Object.keys(args.submittedPhysical).length && receipt.databaseWrite !== "saved")) throw new Error("The note acknowledgement receipt has an invalid revision outcome.");
  for (const key of Object.keys(args.submittedPhysical) as (keyof Physical)[]) if (!equalNoteSnapshotValue(receipt.note[key], args.submittedPhysical[key])) throw new Error("The note acknowledgement receipt did not preserve submitted physical fields.");
  if (args.contextFields && (receipt.succeededFields.length + receipt.failedFields.length !== args.contextFields.length || !args.contextFields.every((field) => receipt.succeededFields.includes(field) || receipt.failedFields.includes(field)))) throw new Error("The note acknowledgement receipt has an invalid context partition.");
  return receipt;
}
