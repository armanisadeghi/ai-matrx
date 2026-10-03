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
 * saved or discarded.
 */

import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import { defineWorkingCopyKind } from "@/lib/working-copy/workingCopyKind";
import { getWorkingCopy, type WithWorkingCopies } from "@/lib/working-copy/workingCopySlice";
import type { CloudFilesState } from "@/features/files/types";
import { saveFileNewVersion } from "./thunks";

type Dispatch = ThunkDispatch<{ cloudFiles: CloudFilesState }, unknown, UnknownAction>;

export const fileWorkingCopy = defineWorkingCopyKind({
  entity: "file",
  autosave: false,
  delay: () => 0,
  async save({ id, key, entry, reason, store }) {
    const text = entry.value;
    if (text === undefined) return { savedAt: null };
    // A flush nobody clicked (hide, unmount) does not retry a save that just
    // failed — the person sees the error on screen and retries with Save.
    if (reason !== "manual" && entry.saveError) throw new Error(entry.saveError);
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
  onSaveFailed(_id, message, reason) {
    // No editor may be on screen to show a failed save nobody clicked.
    if (reason !== "manual") toast.error("Couldn't save your last edits", { description: message });
  },
});

// ---------------------------------------------------------------------------
// Unsaved text across a reload (sessionStorage, this tab only)
// ---------------------------------------------------------------------------

const DRAFT_PREFIX = "matrx:file-working-copy:";

export interface StoredFileDraft {
  text: string;
  baseVersion: number | null;
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
      return {
        text: (parsed as { text: string }).text,
        baseVersion: typeof baseVersion === "number" ? baseVersion : null,
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
