/**
 * features/files/redux/working-copy.ts
 *
 * The ONE save path for a text file's working copy (`CloudFilesState.
 * workingCopies`, reducers in ./slice.ts). Every editor view of a file — a
 * board tile, the Files page, a canvas tab — saves through
 * `saveFileWorkingCopy`, so two views never race two uploads and a flush on
 * hide / unmount / pagehide is one save, not one per view.
 *
 * Also keeps unsaved text across a reload: on `pagehide` the editor stores a
 * dirty copy in sessionStorage (`storeFileDraft`); the next load of that file
 * in this tab offers it back as the working copy (`readFileDraft`) until it is
 * saved or discarded.
 */

import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { extractErrorMessage } from "@/utils/errors";
import { toast } from "@/lib/toast";
import type { CloudFilesState } from "@/features/files/types";
import { saveFileNewVersion } from "./thunks";
import { getFileWorkingCopyFromState } from "./selectors";
import {
  workingCopySaved,
  workingCopySaveFailed,
  workingCopySaveStarted,
} from "./slice";

type StateWithCloudFiles = { cloudFiles: CloudFilesState };
type Dispatch = ThunkDispatch<StateWithCloudFiles, unknown, UnknownAction>;

export type WorkingCopySaveOutcome = "saved" | "clean" | "skipped" | "failed";

export interface SaveFileWorkingCopyArg {
  fileId: string;
  changeSummary?: string;
  /**
   * A flush nobody clicked (hide, unmount, pagehide): it does not retry a
   * save that just failed, and says so in a toast since no editor may be on
   * screen to show the error.
   */
  auto?: boolean;
}

/** One save per file at a time; a second request waits, then saves what is left. */
const inflightSaves = new Map<string, Promise<WorkingCopySaveOutcome>>();

export function saveFileWorkingCopy(arg: SaveFileWorkingCopyArg) {
  return async (
    dispatch: Dispatch,
    getState: () => StateWithCloudFiles,
  ): Promise<WorkingCopySaveOutcome> => {
    const { fileId, auto = false } = arg;
    const running = inflightSaves.get(fileId);
    if (running) {
      await running;
      // Anything typed while that save ran is still unsaved — save it now
      // (a no-op when nothing changed).
      return dispatch(saveFileWorkingCopy(arg));
    }
    const copy = getFileWorkingCopyFromState(getState(), fileId);
    if (!copy || copy.text === copy.baseText) return "clean";
    if (auto && copy.saveError) return "skipped";

    const text = copy.text;
    dispatch(workingCopySaveStarted({ fileId }));
    const save = (async (): Promise<WorkingCopySaveOutcome> => {
      try {
        // A save is the NEXT VERSION of this same file — never an upload
        // (an upload of a taken name becomes "name (1).ext", a second file).
        const result = await dispatch(
          saveFileNewVersion({
            fileId,
            content: text,
            changeSummary:
              arg.changeSummary ??
              (auto ? "Edited in place (auto-save)" : "Edited in place"),
          }),
        ).unwrap();
        dispatch(
          workingCopySaved({
            fileId,
            text,
            version: result.versionNumber,
            savedAt: Date.now(),
          }),
        );
        const after = getFileWorkingCopyFromState(getState(), fileId);
        if (!after || after.text === after.baseText) clearFileDraft(fileId);
        return "saved";
      } catch (err) {
        const message = extractErrorMessage(err);
        dispatch(workingCopySaveFailed({ fileId, error: message }));
        if (auto) {
          toast.error("Couldn't save your last edits", { description: message });
        }
        return "failed";
      }
    })();
    inflightSaves.set(fileId, save);
    try {
      return await save;
    } finally {
      if (inflightSaves.get(fileId) === save) inflightSaves.delete(fileId);
    }
  };
}

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
