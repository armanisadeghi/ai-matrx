import {
  NoteContextPartialSaveError,
  NotePostAcknowledgementError,
  type NoteSaveReceipt,
} from "@/features/notes/service/noteSaveErrors";
import { advancePreparedNoteSource, isPreparedEditableNoteSource } from "@/features/notes/richDocumentSource";
import type {
  ContentSource,
  NoteEditableContentSource,
  PreparedContentEdit,
  RichDocumentActionContext,
} from "../../types";
import { toast } from "@/lib/toast";

export async function prepareContentEdit(
  ctx: RichDocumentActionContext,
): Promise<PreparedContentEdit> {
  if (!ctx.sourceAdapter.edit) {
    throw new Error("This content no longer has a save target.");
  }
  if (ctx.sourceAdapter.prepareEdit) {
    const toastId = toast.loading("Preparing the latest note for editing…");
    try {
      return await ctx.sourceAdapter.prepareEdit({
        source: ctx.source,
        actionText: ctx.content,
        dispatch: ctx.dispatch,
        isAuthenticated: ctx.isAuthenticated,
      });
    } finally {
      toast.dismiss(toastId);
    }
  }
  return { source: ctx.source, content: ctx.content };
}

function validContextField(field: unknown): field is "project_id" | "task_id" {
  return field === "project_id" || field === "task_id";
}

function isDenseUniqueContextFields(fields: unknown): fields is ("project_id" | "task_id")[] {
  if (!Array.isArray(fields) || Object.getOwnPropertySymbols(fields).length > 0) return false;
  const ownNames = Object.getOwnPropertyNames(fields);
  if (!ownNames.every((name) => name === "length" || /^(0|[1-9]\d*)$/.test(name) && Number(name) < fields.length)) return false;
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(fields, String(index));
    if (!descriptor || !("value" in descriptor) || !validContextField(descriptor.value)) return false;
  }
  return new Set(fields).size === fields.length;
}

function isSafeCauseRecord(value: unknown, failedFields: readonly ("project_id" | "task_id")[]): value is Partial<Record<"project_id" | "task_id", string>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownNames = Object.getOwnPropertyNames(value);
  return Object.getOwnPropertySymbols(value).length === 0
    && ownNames.every((field) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      return descriptor !== undefined
        && "value" in descriptor
        && descriptor.enumerable
        && validContextField(field)
        && failedFields.includes(field as "project_id" | "task_id")
        && typeof descriptor.value === "string";
    });
}

function validateNoteReceipt(
  source: NoteEditableContentSource,
  result: void | NoteSaveReceipt,
  submittedContent: string,
): NoteSaveReceipt {
  if (!result || typeof result !== "object" || !("note" in result) || !("databaseWrite" in result)) {
    throw new Error("The note save did not return an acknowledgement receipt.");
  }
  const receipt = result as NoteSaveReceipt;
  if (
    (receipt.databaseWrite !== "saved" && receipt.databaseWrite !== "unchanged") ||
    !isDenseUniqueContextFields(receipt.succeededFields) ||
    !isDenseUniqueContextFields(receipt.failedFields) ||
    receipt.succeededFields.some((field) => receipt.failedFields.includes(field)) ||
    !isSafeCauseRecord(receipt.safeCauses, receipt.failedFields)
  ) {
    throw new Error("The note save returned an invalid context acknowledgement receipt.");
  }
  const settled = advancePreparedNoteSource(source, receipt, submittedContent);
  if (
    (receipt.databaseWrite === "saved" && settled.editBase.version <= source.editBase.version) ||
    (receipt.databaseWrite === "unchanged" && settled.editBase.version !== source.editBase.version)
  ) {
    throw new Error("The note acknowledgement receipt has an invalid revision outcome.");
  }
  return receipt;
}

function requireSubmittedContent(submittedContent: unknown): asserts submittedContent is string {
  if (typeof submittedContent !== "string") {
    throw new Error("An acknowledged note receipt requires the submitted content.");
  }
}

function advanceAcknowledgedErrorSource(
  source: NoteEditableContentSource,
  error: NoteContextPartialSaveError | NotePostAcknowledgementError,
  submittedContent: string,
): NoteEditableContentSource {
  requireSubmittedContent(submittedContent);
  if (error instanceof NotePostAcknowledgementError && (
    error.actorId !== source.editBase.actorId ||
    error.sourceId !== source.sourceId ||
    error.snapshotId !== source.snapshotId
  )) {
    throw new Error("The post-acknowledgement receipt belongs to a different Notes editor.");
  }
  const receipt = validateNoteReceipt(source, error.receipt, submittedContent);
  return advancePreparedNoteSource(source, receipt, submittedContent);
}

/** Callback-local settlement; it deliberately never writes another editor's Redux buffer. */
export async function savePreparedContentEdit(args: {
  ctx: RichDocumentActionContext;
  source: ContentSource;
  newContent: string;
}): Promise<ContentSource> {
  const { ctx, newContent } = args;
  const edit = ctx.sourceAdapter.edit;
  if (!edit) throw new Error("This content no longer has a save target.");
  let source = args.source;
  try {
    const result = await edit({ newContent, source, dispatch: ctx.dispatch });
    if (source.type === "note") {
      if (!isPreparedEditableNoteSource(source)) throw new Error("The note save source was not prepared.");
      const receipt = validateNoteReceipt(source, result, newContent);
      if (receipt.failedFields.length > 0) {
        throw new NoteContextPartialSaveError(receipt);
      }
      if (receipt.postSaveRecoveryError) {
        throw new NotePostAcknowledgementError({
          receipt,
          actorId: source.editBase.actorId,
          kind: "post-save-recovery",
          sourceId: source.sourceId,
          snapshotId: source.snapshotId,
          cause: receipt.postSaveRecoveryError,
        });
      }
      source = advancePreparedNoteSource(source, receipt, newContent);
    }
    return source;
  } catch (error) {
    if (
      source.type === "note" && isPreparedEditableNoteSource(source) &&
      (error instanceof NoteContextPartialSaveError || error instanceof NotePostAcknowledgementError)
    ) {
      // The physical row was acknowledged. Advance only this callback owner's
      // base, retain the rejected editor, and never adopt it into Redux.
      advanceAcknowledgedErrorSource(source, error, newContent);
    }
    throw error;
  }
}

/** Returns the private base that an acknowledged rejection permits retrying from. */
export function acknowledgedPreparedSource(
  source: ContentSource,
  error: unknown,
  submittedContent: string,
): ContentSource | null {
  requireSubmittedContent(submittedContent);
  if (
    source.type === "note" && isPreparedEditableNoteSource(source) &&
    (error instanceof NoteContextPartialSaveError || error instanceof NotePostAcknowledgementError)
  ) {
    return advanceAcknowledgedErrorSource(source, error, submittedContent);
  }
  return null;
}
