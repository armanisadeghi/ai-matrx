/**
 * features/files/redux/working-copy.ts
 *
 * A text file being edited is a record on THE one working-copy primitive
 * (`lib/working-copy/workingCopyKind.ts`, kind `file`): its text, base text,
 * version, dirty and save status live in Redux
 * (`workingCopies["file:<id>"]`), one entry per file, and every editor view of
 * the file — a board tile, the Files page, a canvas tab — is a view of it.
 * `fileWorkingCopy.flush(id, "manual")` is the Save button; the last view
 * leaving (unmount, a sleeping tile, a switch to another file) saves an unsaved
 * copy once. A save is the file's NEXT VERSION, so files do not autosave on a
 * timer (`autosave: false`).
 *
 * Also keeps unsaved text across a reload: on `pagehide` the editor stores a
 * dirty copy in sessionStorage (`storeFileDraft`); the next load of that file
 * in this tab offers it back as the working copy (`readFileDraft`) until it is
 * saved or discarded. The draft records the version (and text) it was typed
 * on: if the file has a newer version by then, adopting it is a CONFLICT —
 * the person chooses, nothing is written over the newer version.
 *
 * A failed save is retried by the primitive (backoff, reconnect) — the edit is
 * never left unwritten because no view was open; a permission or conflict
 * failure waits for the person (Save retries, Discard drops).
 */

import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import { announceWorkingCopyConflict, dismissWorkingCopyConflict } from "@/lib/working-copy/announce";
import { defineWorkingCopyKind, type WorkingCopyKind } from "@/lib/working-copy/workingCopyKind";
import { getWorkingCopy, type WithWorkingCopies } from "@/lib/working-copy/workingCopySlice";
import type { CloudFilesState } from "@/features/files/types";
import { saveFileNewVersion } from "./thunks";

type Dispatch = ThunkDispatch<{ cloudFiles: CloudFilesState }, unknown, UnknownAction>;

export const fileWorkingCopy: WorkingCopyKind<never> = defineWorkingCopyKind({
  entity: "file",
  autosave: false,
  delay: () => 0,
  async save({ id, key, entry, reason, store }) {
    const text = entry.value;
    if (text === undefined) return { savedAt: null };
    // A save is the NEXT VERSION of this same file — never an upload (an
    // upload of a taken name becomes "name (1).ext", a second file).
    const result = await (store.dispatch as unknown as Dispatch)(
      saveFileNewVersion({
        fileId: id,
        content: text,
        changeSummary: reason === "manual" ? "Edited in place" : "Edited in place (auto-save)",
      }),
    ).unwrap();
    const after = getWorkingCopy(store.getState() as WithWorkingCopies, key);
    if (!after || after.value === text) clearFileDraft(id);
    return { value: text, version: result.versionNumber };
  },
  onSaveFailed(_id, message, reason, failure) {
    // No editor may be on screen to show a failed save nobody clicked: say it
    // once per streak (the primitive retries), and again when it is final.
    if (reason === "manual") return;
    if (failure.permanent) {
      toast.error("Couldn't save your file edits", { description: message });
    } else if (failure.attempts === 1) {
      toast.error("Couldn't save your file edits — retrying", { description: message });
    }
  },
  onConflict: (id, conflict) => announceWorkingCopyConflict(fileWorkingCopy, id, "File", conflict),
  onConflictResolved: (id) => dismissWorkingCopyConflict(fileWorkingCopy, id),
});

// ---------------------------------------------------------------------------
// Unsaved text across a reload (sessionStorage, this tab only)
// ---------------------------------------------------------------------------

const DRAFT_PREFIX = "matrx:file-working-copy:";

export interface StoredFileDraft {
  text: string;
  /** The stored version the text was typed on. */
  baseVersion: number | null;
  /** The text it was typed on (lets a conflict with a newer version merge). */
  base?: string | null;
}

export function storeFileDraft(fileId: string, draft: StoredFileDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_PREFIX + fileId, JSON.stringify(draft));
  } catch (err) {
    // Storage blocked or full: the pagehide save still runs; say it here.
    console.warn("[file working copy] could not keep unsaved text for reload", err);
  }
}

export function readFileDraft(fileId: string): StoredFileDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_PREFIX + fileId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { text?: unknown }).text === "string"
    ) {
      const baseVersion = (parsed as { baseVersion?: unknown }).baseVersion;
      const base = (parsed as { base?: unknown }).base;
      return {
        text: (parsed as { text: string }).text,
        baseVersion: typeof baseVersion === "number" ? baseVersion : null,
        base: typeof base === "string" ? base : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearFileDraft(fileId: string): void {
  try {
    window.sessionStorage.removeItem(DRAFT_PREFIX + fileId);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
