/**
 * features/files/redux/mutation-toast-middleware.ts
 *
 * Centralised user-facing error feedback for Cloud Files mutations (P0-4).
 *
 * Why this exists
 * ───────────────
 * Every file/folder mutation thunk already rolls back its optimistic update
 * and rethrows on failure — but the ~15 call sites (FileContextMenu,
 * BulkActionsBar, useFileActions, the canonical mutation hooks, …) `.unwrap()`
 * without a catch, so failures were SILENT: a rename that 403s just snapped
 * back with no explanation; a delete that failed left no trace. In an
 * enterprise file manager that is the single biggest "feels broken" driver.
 *
 * Rather than touch every call site (and every thunk's catch/finally shape),
 * we listen once, here, for the `<prefix>/rejected` action that RTK's
 * `createAsyncThunk` ALWAYS dispatches when a thunk throws — even when the
 * caller's `.unwrap()` rethrows. One middleware → 100% coverage, no thunk
 * edits, UI concern kept out of the thunk bodies.
 *
 * Reads (loadUserFileTree, loadPermissions, …) are intentionally excluded —
 * we only shout about MUTATIONS the user just attempted. Aborted/conditioned
 * dispatches (RTK `meta.aborted` / `meta.condition`) are skipped so a
 * superseded request never toasts.
 */

import type { Middleware } from "@reduxjs/toolkit";
import { toast } from "sonner";

/**
 * Mutation thunk names (the segment between `cloudFiles/` and `/rejected`).
 * Keep in sync with features/files/redux/thunks.ts + virtual-thunks.ts. A
 * missing entry only means "no toast for that op" — never a crash.
 */
const MUTATION_THUNK_NAMES = new Set<string>([
  // files
  "renameFile",
  "moveFile",
  "deleteFile",
  "restoreFile",
  "updateFileMetadata",
  "restoreVersion",
  // (uploadFiles is intentionally excluded — uploads surface per-file errors
  //  inline in the UploadProgressList, so a toast would double up.)
  // folders
  "createFolder",
  "updateFolder",
  "deleteFolder",
  // bulk
  "bulkDeleteFiles",
  "bulkMoveFiles",
  "bulkMoveFolders",
  // permissions + sharing
  "grantPermission",
  "revokePermission",
  "createShareLink",
  "deactivateShareLink",
  // virtual sources (notes/code/etc. surfaced as files)
  "renameAny",
  "moveAny",
  "deleteAny",
  "writeAny",
]);

/**
 * Toast title per thunk name. Phrased so it reads on its own; the specific
 * error goes in the toast description.
 */
const TITLE: Record<string, string> = {
  renameFile: "Couldn't rename",
  renameAny: "Couldn't rename",
  moveFile: "Couldn't move",
  moveAny: "Couldn't move",
  deleteFile: "Couldn't delete",
  deleteAny: "Couldn't delete",
  restoreFile: "Couldn't restore",
  updateFileMetadata: "Couldn't update file",
  restoreVersion: "Couldn't restore that version",
  uploadFiles: "Upload failed",
  createFolder: "Couldn't create folder",
  updateFolder: "Couldn't update folder",
  deleteFolder: "Couldn't delete folder",
  bulkDeleteFiles: "Couldn't delete some items",
  bulkMoveFiles: "Couldn't move some items",
  bulkMoveFolders: "Couldn't move some folders",
  grantPermission: "Couldn't share",
  revokePermission: "Couldn't update sharing",
  createShareLink: "Couldn't create share link",
  deactivateShareLink: "Couldn't revoke share link",
  writeAny: "Couldn't save",
};

interface RejectedAction {
  type: string;
  error?: { name?: string; message?: string };
  meta?: { aborted?: boolean; condition?: boolean; rejectedWithValue?: boolean };
  payload?: unknown;
}

function parseThunk(type: string, phase: "rejected" | "fulfilled"): string | null {
  // `cloudFiles/renameFile/rejected` → `renameFile`
  const m = new RegExp(`^cloudFiles/([^/]+)/${phase}$`).exec(type);
  return m ? m[1] : null;
}

/**
 * P3-11: success toasts ONLY for actions whose result the user can't see
 * directly (a link/permission/version change has no visible row update).
 * Visible actions (rename shows the new name, move/delete change the list)
 * stay silent — a toast for those is noise.
 */
const SUCCESS_TITLE: Record<string, string> = {
  createShareLink: "Share link created",
  deactivateShareLink: "Share link revoked",
  grantPermission: "Sharing updated",
  revokePermission: "Sharing updated",
  restoreVersion: "Version restored",
};

function messageFrom(action: RejectedAction): string {
  // Prefer a rejectWithValue string payload, then the serialized error.
  if (typeof action.payload === "string" && action.payload.trim()) {
    return action.payload.trim();
  }
  const msg = action.error?.message?.trim();
  if (msg && msg.toLowerCase() !== "rejected") return msg;
  return "Something went wrong.";
}

export const cloudFilesMutationToastMiddleware: Middleware =
  () => (next) => (action) => {
    const result = next(action);

    const a = action as RejectedAction;
    if (typeof a?.type !== "string") return result;

    if (a.type.endsWith("/rejected")) {
      const name = parseThunk(a.type, "rejected");
      if (!name || !MUTATION_THUNK_NAMES.has(name)) return result;
      // Skip superseded / conditioned dispatches — not real failures.
      if (a.meta?.aborted || a.meta?.condition) return result;
      if (a.error?.name === "AbortError" || a.error?.name === "ConditionError") {
        return result;
      }
      toast.error(TITLE[name] ?? "Something went wrong", {
        description: messageFrom(a),
      });
      return result;
    }

    if (a.type.endsWith("/fulfilled")) {
      const name = parseThunk(a.type, "fulfilled");
      if (name && SUCCESS_TITLE[name]) {
        toast.success(SUCCESS_TITLE[name]);
      }
      return result;
    }

    return result;
  };
