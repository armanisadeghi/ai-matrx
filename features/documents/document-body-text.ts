/**
 * The BODY TEXT of a Univer document, as agents read and write it (PURE).
 *
 * `matrx-user/documents` declares the body as a value (`document_body_text`)
 * and a write target (`document_body`). Univer owns the document model, so
 * both go through a small port the editor hands up (`DocumentEditor`
 * `onBodyPort`): the read is the body's data stream as plain text, and a write
 * is ONE changed span, applied through Univer's own facade (`deleteRange` /
 * `insertText`, which run `InsertTextCommand` on the command service). That
 * keeps every agent edit on the one editing path a keystroke takes: undo,
 * autosave snapshots, History and collab all see it, and formatting outside
 * the changed span is left exactly as it was.
 *
 * Univer's data stream encodes a paragraph end as `\r`, a section break as
 * `\n`, and custom blocks / tables with control characters below U+0020. The
 * plain text maps a paragraph end to `\n` and leaves the other control tokens
 * out; `offsets` maps each text position back to its data-stream index so a
 * change found in the text lands at the right place in the stream.
 */

import type { SurfaceWriteHandlerEntry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

/**
 * A product bound, not a database one (snapshots are jsonb): a body an agent
 * sends larger than this is almost certainly a mistake (a whole file pasted
 * twice), and past it the approval card stops being readable.
 */
export const DOCUMENT_BODY_MAX_LENGTH = 200_000;

/** What the editor lends the surface. Each call resolves the live document. */
export interface DocumentBodyPort {
  /** The main body's Univer data stream (ends with `\r\n`). */
  getDataStream: () => string;
  /** The live document snapshot (body with its text runs), for reading the formatting back out. */
  getSnapshot?: () => unknown;
  /** Delete `[start, end)` of the data stream; false when Univer refused. */
  deleteRange: (start: number, end: number) => boolean;
  /** Insert plain text (a `\n` starts a new paragraph) at a stream index. */
  insertText: (at: number, text: string) => boolean;
}

export interface BodyText {
  text: string;
  /** `offsets[i]` = the stream index of text position `i`; length is text.length + 1. */
  offsets: number[];
}

const PARAGRAPH = "\r";
const SECTION = "\n";

/** The body's plain text and where each character sits in the stream. */
export function bodyTextOf(dataStream: string): BodyText {
  let text = "";
  const offsets: number[] = [];
  for (let i = 0; i < dataStream.length; i++) {
    const ch = dataStream[i];
    if (ch === PARAGRAPH) {
      text += "\n";
      offsets.push(i);
      continue;
    }
    if (ch === SECTION) continue;
    if (ch !== "\t" && ch.charCodeAt(0) < 0x20) continue;
    text += ch;
    offsets.push(i);
  }
  // Every body ends with its last paragraph mark: it is not text a person
  // typed, and it can never be deleted (Univer protects it). Text that ends
  // there inserts before it.
  if (text.endsWith("\n")) {
    const end = offsets[offsets.length - 1];
    text = text.slice(0, -1);
    offsets.pop();
    offsets.push(end);
  } else {
    offsets.push(dataStream.length);
  }
  return { text, offsets };
}

export interface BodyEdit {
  /** Stream range to remove (may be empty). */
  start: number;
  end: number;
  /** Plain text to insert at `start` (may be empty). */
  insert: string;
}

/**
 * The ONE span that turns the current body into `next`: the longest common
 * prefix and suffix stay untouched (with their formatting), only the middle
 * changes. Null when nothing differs.
 */
export function planBodyEdit(current: BodyText, next: string): BodyEdit | null {
  const a = current.text;
  const b = next;
  if (a === b) return null;
  let prefix = 0;
  const max = Math.min(a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const removeTo = a.length - suffix;
  return {
    start: current.offsets[prefix],
    end: current.offsets[removeTo],
    insert: b.slice(prefix, b.length - suffix),
  };
}

/** Apply `next` as the whole body text through the port. */
export function writeBodyText(
  port: DocumentBodyPort,
  next: string,
): { changed: boolean; removed: number; inserted: number } {
  const current = bodyTextOf(port.getDataStream());
  const edit = planBodyEdit(current, next);
  if (!edit) return { changed: false, removed: 0, inserted: 0 };
  if (edit.end > edit.start && !port.deleteRange(edit.start, edit.end)) {
    throw new Error(
      "The editor refused to remove the old text (the document may be read-only right now). Nothing was changed.",
    );
  }
  if (edit.insert.length > 0 && !port.insertText(edit.start, edit.insert)) {
    throw new Error(
      edit.end > edit.start
        ? "The editor removed the old text but refused the new text. Press Undo in the document to bring the old text back, then try again."
        : "The editor refused the new text (the document may be read-only right now). Nothing was changed.",
    );
  }
  return {
    changed: true,
    removed: edit.end - edit.start,
    inserted: edit.insert.length,
  };
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/** Shape check for an agent-sent body; throws a sentence the agent can act on. */
export function validateDocumentBody(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `document_body must be the document's whole text as a plain string (or an anchored edit {command, old_str, new_str}) — received ${describeValue(
        value,
      )}. Read document_body_text, change it, and send the full new text.`,
    );
  }
  if (value.length > DOCUMENT_BODY_MAX_LENGTH) {
    throw new Error(
      `document_body must be ${DOCUMENT_BODY_MAX_LENGTH} characters or fewer (received ${value.length}). Nothing was changed.`,
    );
  }
  return value.replace(/\r\n?/g, "\n");
}

/**
 * The `document_body` write handler. `getPort` answers the live editor's port
 * (null until Univer has mounted the document); `assertWritable` throws when
 * the record is not loaded or the person may only view it.
 */
export function documentBodyWriteHandler(deps: {
  getPort: () => DocumentBodyPort | null;
  assertWritable: (whatItBlocks: string) => void;
}): SurfaceWriteHandlerEntry {
  return {
    validate: (value) => {
      validateDocumentBody(value);
    },
    apply: (value) => {
      const next = validateDocumentBody(value);
      deps.assertWritable("its text cannot be changed");
      const port = deps.getPort();
      if (!port) {
        throw new Error(
          "The document editor has not finished opening yet. Nothing was changed; try again in a moment.",
        );
      }
      const result = writeBodyText(port, next);
      if (!result.changed) {
        return { summary: "The document already has exactly this text; nothing changed." };
      }
      return {
        summary: `Changed the document's text in the editor (removed ${result.removed} characters, inserted ${result.inserted}); the editor saves it within a few seconds, and Undo in the document reverses it.`,
        data: { removed: result.removed, inserted: result.inserted },
      };
    },
  };
}
