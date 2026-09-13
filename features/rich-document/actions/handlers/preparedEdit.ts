import {
  NoteContextPartialSaveError,
  NotePostAcknowledgementError,
  type NoteSaveReceipt,
} from "@/features/notes/service/noteSaveErrors";
import { advancePreparedNoteSource, isPreparedEditableNoteSource } from "@/features/notes/richDocumentSource";
import type {
  ContentSource,
  PreparedContentEdit,
  RichDocumentActionContext,
} from "../../types";

export async function prepareContentEdit(
  ctx: RichDocumentActionContext,
): Promise<PreparedContentEdit> {
  if (!ctx.sourceAdapter.edit) {
    throw new Error("This content no longer has a save target.");
  }
  if (ctx.sourceAdapter.prepareEdit) {
    return ctx.sourceAdapter.prepareEdit({
      source: ctx.source,
      actionText: ctx.content,
      dispatch: ctx.dispatch,
      isAuthenticated: ctx.isAuthenticated,
    });
  }
  return { source: ctx.source, content: ctx.content };
}

function isReceipt(value: void | NoteSaveReceipt): value is NoteSaveReceipt {
  return value !== undefined && "note" in value && "databaseWrite" in value;
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
      if (!isReceipt(result)) throw new Error("The note save did not return an acknowledgement receipt.");
      source = advancePreparedNoteSource(source, result, newContent);
    }
    return source;
  } catch (error) {
    if (
      source.type === "note" && isPreparedEditableNoteSource(source) &&
      (error instanceof NoteContextPartialSaveError || error instanceof NotePostAcknowledgementError)
    ) {
      // The physical row was acknowledged. Advance only this callback owner's
      // base, retain the rejected editor, and never adopt it into Redux.
      advancePreparedNoteSource(source, error.receipt, newContent);
    }
    throw error;
  }
}

/** Returns the private base that an acknowledged rejection permits retrying from. */
export function acknowledgedPreparedSource(
  source: ContentSource,
  error: unknown,
  submittedContent?: string,
): ContentSource | null {
  if (
    source.type === "note" && isPreparedEditableNoteSource(source) &&
    (error instanceof NoteContextPartialSaveError || error instanceof NotePostAcknowledgementError)
  ) {
    return advancePreparedNoteSource(source, error.receipt, submittedContent);
  }
  return null;
}
