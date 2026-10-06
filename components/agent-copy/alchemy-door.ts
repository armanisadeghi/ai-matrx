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
 *
 * Every write returns a receipt: applied, queued, or refused with a sentence
 * and a remedy. Nothing here throws to a caller.
 */

import type { Receipt, WriteDoor, WriteHandler } from "@ai-matrx/alchemy/operate";
import type { ApprovalPort } from "@ai-matrx/alchemy/ports";
import type { TransferTarget } from "@ai-matrx/kit/content-transfer";
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

/** What a headless `create_notes` write created, read by the caller through the write's signal. */
const createdNotes = new WeakMap<AbortSignal, TransferTarget[]>();

/** `matrx-user/notes · create_notes` with no page open: new notes in the working organization. */
export function createNotesHeadlessHandler(getState: () => RootState): WriteHandler {
  return async (request, signal) => {
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
    createdNotes.set(signal, created);
    return {
      status: "applied",
      sentence: created.length === 1 ? `Saved to note "${created[0].label}".` : `Saved ${created.length} notes.`,
    };
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
  createAlchemyDoorPort().registerHeadless(
    NOTES_SURFACE_NAME,
    CREATE_NOTES_TARGET,
    createNotesHeadlessHandler(() => (destinationState ?? getState)()),
  );
}

/** A person's "Save to Notes": one write through the door; the receipt and what it created. */
export async function saveNotesThroughDoor(
  items: NewNoteItem[],
): Promise<{ receipt: Receipt; created: TransferTarget[] }> {
  const controller = new AbortController();
  const receipt = await createAlchemyDoorPort().write(
    { surfaceName: NOTES_SURFACE_NAME, target: CREATE_NOTES_TARGET, value: items, by: "destination" },
    controller.signal,
  );
  return { receipt, created: createdNotes.get(controller.signal) ?? [] };
}
