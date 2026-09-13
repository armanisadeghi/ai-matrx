import type { Note } from "../types";
import type { NoteContextField, NoteSaveReceipt } from "./noteSaveErrors";
import { equalNoteSnapshotValue } from "../noteSnapshotEquality";

type Physical = Pick<Note, "content" | "label" | "folder_id" | "tags" | "visibility">;
const contexts: readonly NoteContextField[] = ["project_id", "task_id"];
function dense(value: unknown): value is NoteContextField[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  const ownNames = Object.getOwnPropertyNames(value);
  if (!ownNames.every((name) => name === "length" || (/^(0|[1-9]\d*)$/.test(name) && Number(name) < value.length))) return false;
  for (let index = 0; index < value.length; index += 1) { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor || !("value" in descriptor) || !contexts.includes(descriptor.value as NoteContextField)) return false; }
  return new Set(value).size === value.length;
}
function causes(value: unknown, failed: readonly NoteContextField[]): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownNames = Object.getOwnPropertyNames(value);
  return Object.getOwnPropertySymbols(value).length === 0 && ownNames.every((field) => { const descriptor = Object.getOwnPropertyDescriptor(value, field); return descriptor !== undefined && "value" in descriptor && descriptor.enumerable && contexts.includes(field as NoteContextField) && failed.includes(field as NoteContextField) && typeof descriptor.value === "string"; });
}
export function validateNoteSaveReceipt(args: { base: { noteId: string; organizationId: string; version: number }; receipt: unknown; submittedPhysical: Partial<Physical>; submittedContext?: Partial<Pick<Note, NoteContextField>>; contextFields?: readonly NoteContextField[]; requirePhysicalWrite?: boolean }): NoteSaveReceipt {
  const receipt = args.receipt as NoteSaveReceipt;
  if (!receipt || typeof receipt !== "object" || !receipt.note || (receipt.databaseWrite !== "saved" && receipt.databaseWrite !== "unchanged") || !dense(receipt.succeededFields) || !dense(receipt.failedFields) || receipt.succeededFields.some((field) => receipt.failedFields.includes(field)) || !causes(receipt.safeCauses, receipt.failedFields)) throw new Error("The note save returned an invalid context acknowledgement receipt.");
  if (receipt.note.id !== args.base.noteId || receipt.note.organization_id !== args.base.organizationId || !Number.isSafeInteger(receipt.note.version) || receipt.note.version < 0) throw new Error("The note acknowledgement receipt does not match this editor source.");
  if ((receipt.databaseWrite === "saved" && receipt.note.version <= args.base.version) || (receipt.databaseWrite === "unchanged" && receipt.note.version !== args.base.version) || (args.requirePhysicalWrite && Object.keys(args.submittedPhysical).length && receipt.databaseWrite !== "saved")) throw new Error("The note acknowledgement receipt has an invalid revision outcome.");
  for (const key of Object.keys(args.submittedPhysical) as (keyof Physical)[]) if (!equalNoteSnapshotValue(receipt.note[key], args.submittedPhysical[key])) throw new Error("The note acknowledgement receipt does not match submitted physical fields.");
  if (args.contextFields && (receipt.succeededFields.length + receipt.failedFields.length !== args.contextFields.length || !args.contextFields.every((field) => receipt.succeededFields.includes(field) || receipt.failedFields.includes(field)))) throw new Error("The note acknowledgement receipt has an invalid context partition.");
  if (args.submittedContext) {
    const fields = Object.keys(args.submittedContext);
    if (fields.length !== receipt.succeededFields.length + receipt.failedFields.length || !fields.every((field) => contexts.includes(field as NoteContextField) && (receipt.succeededFields.includes(field as NoteContextField) || receipt.failedFields.includes(field as NoteContextField)))) throw new Error("The note acknowledgement receipt has an invalid submitted context partition.");
    for (const field of receipt.succeededFields) {
      if (!Object.hasOwn(args.submittedContext, field) || !equalNoteSnapshotValue(receipt.note[field], args.submittedContext[field])) throw new Error("The note acknowledgement receipt does not match submitted context values.");
    }
  }
  return receipt;
}
