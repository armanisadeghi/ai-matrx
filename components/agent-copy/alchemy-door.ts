/**
 * THE ONE WRITE DOOR, bound for the app (Matrx Alchemy ALC-17).
 *
 * One `createWriteDoor` per app: it lives beside the surface writeback seam
 * (`@ai-matrx/chat/surfaces/runtime/surface-writeback` → `loadSurfaceWriteDoor`),
 * which reads the manifest registry and keeps each mounted page's handlers
 * LIVE on it for as long as the page is mounted — so an Action or a destination
 * writing to an open page reaches that page's own handler. This module hands the same
 * door to the Alchemy host (`door` port) and registers the HEADLESS handlers of
 * the destinations that work with no page open:
 *
 *   matrx-user/notes · create_notes   "Save to Notes" (and the scratch note) —
 *                                     a new note per item, in the organization
 *                                     the person is working in.
 *   matrx-user/documents · create_documents   "Save to document" — a new
 *                                     document from markdown (export-targets).
 *   matrx-user/workbooks · create_workbooks   "Save to workbook" — a new
 *                                     workbook from a table (export-targets).
 *
 * Every write returns a receipt: applied, queued, or refused with a sentence
 * and a remedy. Nothing here throws to a caller.
 */

import type { Receipt, WriteDoor, WriteHandler } from "@ai-matrx/alchemy/operate";
import type { ApprovalPort } from "@ai-matrx/alchemy/ports";
import type { TransferTarget } from "@ai-matrx/alchemy/operate";
import {
  loadSurfaceWriteDoor,
  surfaceWriteApprovals,
} from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { RootState } from "@/lib/redux/rootReducer";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { alchemyOrganizationId } from "./alchemy-organization";

export const NOTES_SURFACE_NAME = "matrx-user/notes";
export const CREATE_NOTES_TARGET = "create_notes";
export const DOCUMENTS_SURFACE_NAME = "matrx-user/documents";
export const CREATE_DOCUMENTS_TARGET = "create_documents";
export const WORKBOOKS_SURFACE_NAME = "matrx-user/workbooks";
export const CREATE_WORKBOOKS_TARGET = "create_workbooks";

function report(error: unknown, stage: string): void {
  captureError({
    source: "alchemy",
    message: `[alchemy:write ${stage}] ${error instanceof Error ? error.message : String(error)}`,
    ...(error instanceof Error ? { name: error.name, ...(error.stack ? { stack: error.stack } : {}) } : {}),
    raw: { area: "write", stage },
  });
}

/** Registers on the door once its engine has loaded; the returned function always unregisters. */
function whenLoaded(stage: string, register: (door: WriteDoor) => () => void): () => void {
  let release: (() => void) | null = null;
  let cancelled = false;
  loadSurfaceWriteDoor().then(
    (door) => {
      if (cancelled) return;
      try {
        release = register(door);
      } catch (error) {
        report(error, stage);
      }
    },
    (error) => report(error, stage),
  );
  return () => {
    cancelled = true;
    release?.();
  };
}

/** The host `door` port: the app's one door, usable before its engine has loaded. */
export function createAlchemyDoorPort(): WriteDoor {
  return {
    async write(request, signal) {
      let door: WriteDoor;
      try {
        door = await loadSurfaceWriteDoor();
      } catch (error) {
        report(error, "load");
        return {
          status: "refused",
          to: { surfaceName: request.surfaceName, target: request.target },
          reason: "failed",
          sentence: "Saving isn't available right now, so nothing was saved.",
          remedy: "Reload the page, then try again.",
        };
      }
      return door.write(request, signal);
    },
    registerHeadless: (surfaceName, target, handler) =>
      whenLoaded("register-headless", (door) => door.registerHeadless(surfaceName, target, handler)),
    registerLive: (surfaceName, target, handler) =>
      whenLoaded("register-live", (door) => door.registerLive(surfaceName, target, handler)),
  };
}

/** The host `approvals` port: the surface writeback seam's own approval flow (the inline card). */
export function createAlchemyApprovalPort(): ApprovalPort {
  return surfaceWriteApprovals;
}

// ── Headless destination handlers ────────────────────────────────────────────

/** One `create_notes` item, as `notes-editor.manifest.ts` declares it. */
interface NewNoteItem {
  title: string;
  content?: string;
  tags?: string[];
  folder?: string;
}

function readNewNoteItems(value: unknown): NewNoteItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Saving notes needs a list of notes, each with a title.");
  }
  return value.map((entry) => {
    const item = entry as Record<string, unknown> | null;
    if (item && typeof item === "object" && "copy_of" in item) {
      throw new Error("Copying a note needs the Notes page open.");
    }
    if (!item || typeof item.title !== "string" || !item.title.trim()) {
      throw new Error("Every note needs a title.");
    }
    return {
      title: item.title.trim(),
      ...(typeof item.content === "string" ? { content: item.content } : {}),
      ...(Array.isArray(item.tags) ? { tags: item.tags.filter((t): t is string => typeof t === "string") } : {}),
      ...(typeof item.folder === "string" && item.folder.trim() ? { folder: item.folder.trim() } : {}),
    };
  });
}

/** `matrx-user/notes · create_notes` with no page open: new notes in the working organization. */
export function createNotesHeadlessHandler(getState: () => RootState): WriteHandler {
  return async (request) => {
    const items = readNewNoteItems(request.value);
    const state = getState();
    const organizationId = alchemyOrganizationId(state);
    if (!selectUserId(state) || !organizationId) {
      throw new Error("Sign in and select an organization to save notes.");
    }
    const { NotesAPI } = await import("@/features/notes/service/notesApi");
    const created: TransferTarget[] = [];
    for (const item of items) {
      const note = await NotesAPI.create({
        label: item.title,
        content: item.content ?? "",
        ...(item.folder ? { folder_name: item.folder } : {}),
        tags: item.tags ?? [],
        organization_id: organizationId,
      });
      created.push({ kind: "note", id: note.id, label: note.label, href: `/notes/${note.id}` });
    }
    return {
      status: "applied",
      sentence: created.length === 1 ? `Saved to note "${created[0].label}".` : `Saved ${created.length} notes.`,
      result: { notes: created.map((note) => ({ id: note.id, name: note.label })) },
    };
  };
}

/** One `create_documents` value, as `documents.manifest.ts` declares it. */
export interface NewDocument {
  markdown: string;
  name?: string;
}

/** One `create_workbooks` value, as `workbooks.manifest.ts` declares it (export-targets' `TableInput`). */
export interface NewWorkbook {
  name: string;
  headers: string[];
  rows: string[][];
}

/** What a create handler reports: the created record, and — when it was created but not filled — why. */
interface CreatedRecord {
  id: string;
  href: string;
  name: string;
  error?: string;
}

function workingOrganization(state: RootState, what: string): string {
  const organizationId = alchemyOrganizationId(state);
  if (!selectUserId(state) || !organizationId) {
    throw new Error(`Sign in and select an organization to save ${what}.`);
  }
  return organizationId;
}

function readNewDocument(value: unknown): NewDocument {
  const doc = value as Record<string, unknown> | null;
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || typeof doc.markdown !== "string") {
    throw new Error("Saving a document needs its markdown.");
  }
  return { markdown: doc.markdown, ...(typeof doc.name === "string" ? { name: doc.name } : {}) };
}

function readNewWorkbook(value: unknown): NewWorkbook {
  const table = value as Record<string, unknown> | null;
  const strings = (list: unknown): list is string[] => Array.isArray(list) && list.every((cell) => typeof cell === "string");
  if (!table || typeof table !== "object" || !strings(table.headers) || !Array.isArray(table.rows) || !table.rows.every(strings)) {
    throw new Error("A workbook requires tabular content: headers and rows of text.");
  }
  return { name: typeof table.name === "string" ? table.name : "", headers: table.headers, rows: table.rows as string[][] };
}

/**
 * A created record as the handler's result. Created but not filled (its
 * content failed to save) is still a created record: the receipt carries its
 * link and the reason, so the person opens it instead of making another copy.
 */
function createdResult(
  pushed: { ok: boolean; id?: string; href?: string; error?: string },
  name: string,
  kind: "document" | "workbook",
): { status: "applied"; sentence: string; result: { id: string; href: string; name: string; error?: string } } {
  if (!pushed.id || !pushed.href) throw new Error(pushed.error ?? `The ${kind} could not be created.`);
  return {
    status: "applied",
    sentence: pushed.ok ? `Saved as ${kind} "${name}".` : (pushed.error ?? `The ${kind} was created but not filled.`),
    result: { id: pushed.id, href: pushed.href, name, ...(pushed.ok ? {} : { error: pushed.error ?? `The ${kind} was created but not filled.` }) },
  };
}

/** `matrx-user/documents · create_documents` with no page open: a new document in the working organization. */
export function createDocumentsHeadlessHandler(getState: () => RootState): WriteHandler {
  return async (request) => {
    const doc = readNewDocument(request.value);
    const organizationId = workingOrganization(getState(), "a document");
    const { pushMarkdownToDocument } = await import("@/features/data-tables/export-targets");
    const pushed = await pushMarkdownToDocument(doc.markdown, doc.name, organizationId);
    return createdResult(pushed, doc.name?.trim() || "Document", "document");
  };
}

/** `matrx-user/workbooks · create_workbooks` with no page open: a new workbook in the working organization. */
export function createWorkbooksHeadlessHandler(getState: () => RootState): WriteHandler {
  return async (request) => {
    const table = readNewWorkbook(request.value);
    const organizationId = workingOrganization(getState(), "a workbook");
    const { pushTableToWorkbook } = await import("@/features/data-tables/export-targets");
    const pushed = await pushTableToWorkbook(table, organizationId);
    return createdResult(pushed, table.name.trim() || "Table", "workbook");
  };
}

let destinationState: (() => RootState) | null = null;

/**
 * Registers the destinations' headless handlers on the app's door — once per
 * app; a later call only points them at the newer store.
 */
export function registerHeadlessDestinations(getState: () => RootState): void {
  const first = destinationState === null;
  destinationState = getState;
  if (!first) return;
  const current = () => (destinationState ?? getState)();
  const port = createAlchemyDoorPort();
  port.registerHeadless(NOTES_SURFACE_NAME, CREATE_NOTES_TARGET, createNotesHeadlessHandler(current));
  port.registerHeadless(DOCUMENTS_SURFACE_NAME, CREATE_DOCUMENTS_TARGET, createDocumentsHeadlessHandler(current));
  port.registerHeadless(WORKBOOKS_SURFACE_NAME, CREATE_WORKBOOKS_TARGET, createWorkbooksHeadlessHandler(current));
}

/** The notes a `create_notes` handler reported (`{ notes: [{ id, name }] }`) as links; none reported = none. */
function createdNotesOf(result: unknown): TransferTarget[] {
  const notes = result && typeof result === "object" ? (result as { notes?: unknown }).notes : undefined;
  if (!Array.isArray(notes)) return [];
  return notes.flatMap((entry) => {
    const note = entry as { id?: unknown; name?: unknown } | null;
    if (!note || typeof note.id !== "string" || !note.id) return [];
    const label = typeof note.name === "string" && note.name ? note.name : "Note";
    return [{ kind: "note", id: note.id, label, href: `/notes/${note.id}` }];
  });
}

/** A person's "Save to Notes": one write through the door; the receipt and what it created. */
export async function saveNotesThroughDoor(
  items: NewNoteItem[],
): Promise<{ receipt: Receipt; created: TransferTarget[] }> {
  const receipt = await createAlchemyDoorPort().write(
    { surfaceName: NOTES_SURFACE_NAME, target: CREATE_NOTES_TARGET, value: items, by: "destination" },
    new AbortController().signal,
  );
  return { receipt, created: receipt.status === "applied" ? createdNotesOf(receipt.result) : [] };
}

/** The record a `create_documents` / `create_workbooks` handler reported; none reported = null. */
function createdRecordOf(result: unknown): CreatedRecord | null {
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (!record || typeof record.id !== "string" || !record.id || typeof record.href !== "string" || !record.href) return null;
  return {
    id: record.id,
    href: record.href,
    name: typeof record.name === "string" ? record.name : "",
    ...(typeof record.error === "string" ? { error: record.error } : {}),
  };
}

/** A person's "Save to document": one write through the door; the receipt and the document it created. */
export async function saveDocumentThroughDoor(
  doc: NewDocument,
): Promise<{ receipt: Receipt; created: CreatedRecord | null }> {
  const receipt = await createAlchemyDoorPort().write(
    { surfaceName: DOCUMENTS_SURFACE_NAME, target: CREATE_DOCUMENTS_TARGET, value: doc, by: "destination" },
    new AbortController().signal,
  );
  return { receipt, created: receipt.status === "applied" ? createdRecordOf(receipt.result) : null };
}

/** A person's "Save to workbook": one write through the door; the receipt and the workbook it created. */
export async function saveWorkbookThroughDoor(
  table: NewWorkbook,
): Promise<{ receipt: Receipt; created: CreatedRecord | null }> {
  const receipt = await createAlchemyDoorPort().write(
    { surfaceName: WORKBOOKS_SURFACE_NAME, target: CREATE_WORKBOOKS_TARGET, value: table, by: "destination" },
    new AbortController().signal,
  );
  return { receipt, created: receipt.status === "applied" ? createdRecordOf(receipt.result) : null };
}
