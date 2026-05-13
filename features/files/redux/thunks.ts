/**
 * features/files/redux/thunks.ts
 *
 * Async orchestration for cloud files: reads via supabase-js (RLS), writes via
 * the REST API client. Every mutation follows the pattern:
 *
 *   1. Snapshot current state for rollback.
 *   2. Dispatch optimistic reducer immediately.
 *   3. Register the requestId in the ledger (for realtime echo dedup).
 *   4. Call the REST API.
 *   5. On success: markSaved, release ledger entry.
 *   6. On error: dispatch rollback, set error, release ledger entry, rethrow.
 */

"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { CloudFilesState } from "@/features/files/types";

// Minimal local types — avoids importing from store.ts (which imports this
// module via rootReducer → middleware chain), breaking the type-level cycle.
type StateWithCloudFiles = { cloudFiles: CloudFilesState };
type AppDispatch = ThunkDispatch<StateWithCloudFiles, unknown, UnknownAction>;
import { supabase } from "@/utils/supabase/client";

import * as Files from "@/features/files/api/files";
import * as Folders from "@/features/files/api/folders";
import * as Permissions from "@/features/files/api/permissions";
import * as ShareLinks from "@/features/files/api/share-links";
import * as Versions from "@/features/files/api/versions";
import { newRequestId } from "@/lib/python-client";
import { extractErrorMessage } from "@/utils/errors";
import {
  apiFileRecordToCloudFile,
  dbRowToCloudFile,
  dbRowToCloudFilePermission,
  dbRowToCloudFileVersion,
  dbRowToCloudFolder,
  dbRowToCloudShareLink,
  parseCloudTreeRows,
} from "./converters";
import { registerRequest, releaseRequest } from "./request-ledger";
import { buildTreeState } from "./tree-utils";
import { invalidate as invalidateBlobCache } from "@/features/files/hooks/blob-cache";
import {
  addFilePendingRequest,
  attachChildToFolder,
  clearUpload,
  detachChildFromFolder,
  markFileSaved,
  removeFile,
  removeFilePendingRequest,
  removeFolder,
  removePermissionForResource,
  removeShareLink,
  replaceTree,
  rollbackFileOptimisticUpdate,
  setFileError,
  setFileField,
  setFileLoading,
  setTreeStatus,
  trackUploadStart,
  updateUploadProgress,
  updateUploadStatus,
  upsertFile,
  upsertFiles,
  upsertFolder,
  upsertFolders,
  upsertPermissionsForResource,
  upsertShareLinksForResource,
  upsertVersionsForFile,
} from "./slice";
import { getFileFromState } from "./selectors";

import type {
  BulkDeleteFilesArg,
  BulkMoveFilesArg,
  BulkMoveFoldersArg,
  BulkResponse,
  CloudFile,
  CloudFileFieldSnapshot,
  CloudFilePermission,
  CloudFileVersion,
  CloudFolder,
  CloudShareLink,
  CreateShareLinkArg,
  DeactivateShareLinkArg,
  DeleteFileArg,
  GrantPermissionArg,
  MigrateGuestToUserArg,
  MigrateGuestToUserResponse,
  MoveFileArg,
  RenameFileArg,
  RestoreVersionArg,
  RevokePermissionArg,
  SignedUrlArg,
  UpdateFileMetadataArg,
  UploadFilesArg,
  Visibility,
} from "@/features/files/types";

type ThunkApi = { dispatch: AppDispatch; state: StateWithCloudFiles };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Loads the full tree for the current user via the cld_get_user_file_tree
 * RPC. Normalizes into filesById / foldersById / tree.
 */
export const loadUserFileTree = createAsyncThunk<
  void,
  { userId: string },
  ThunkApi
>("cloudFiles/loadUserFileTree", async ({ userId }, { dispatch }) => {
  dispatch(setTreeStatus({ status: "loading" }));

  // The DB has TWO overloads of this function:
  //   cld_get_user_file_tree(p_user_id uuid)
  //   cld_get_user_file_tree(p_user_id uuid, p_limit int, p_offset int,
  //                          p_include_folders boolean, p_include_deleted boolean)
  //
  // A 1-arg call (only `p_user_id`) is AMBIGUOUS — Postgres can't pick a
  // best candidate and PostgREST returns `42725: function ... is not
  // unique`. Passing one of the new params forces resolution to the
  // 5-arg overload (which is also the one we want — it returns folders
  // and the unified `{ kind, path, name, parent_id, size_bytes, ... }`
  // row shape). We pass the safest defaults explicitly here so the
  // intent is on the wire and the call is overload-stable.
  //
  // Logged for the Python team in for_python/REQUESTS.md — they should
  // drop the legacy 1-arg overload so this ambiguity can't bite again.
  const { data, error } = await supabase.rpc("cld_get_user_file_tree", {
    p_user_id: userId,
    p_limit: 5000,
    p_offset: 0,
    p_include_folders: true,
    p_include_deleted: false,
  });

  if (error) {
    dispatch(setTreeStatus({ status: "error", error: error.message }));
    throw error;
  }

  const rows = parseCloudTreeRows(data);

  // Defensive ownership filter — DO NOT REMOVE without coordinating with the
  // Python team. The 5-arg overload of `cld_get_user_file_tree` has a bug in
  // its WHERE clause for files:
  //
  //   WHERE (...)
  //     AND (
  //         f.owner_id = p_user_id
  //         OR f.visibility = 'public'        -- <-- leaks ALL public files
  //         OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
  //     )
  //
  // That `OR f.visibility = 'public'` makes EVERY public file in the system
  // appear in EVERY user's tree. A `visibility = 'public'` flag is supposed
  // to mean "anyone with the link can read" — it's NOT supposed to mean
  // "show in every user's My Files". Folders correctly scope to
  // `d.owner_id = p_user_id` in the same function; files do not.
  //
  // Until the Python team patches the RPC, we filter on the client: keep a
  // file row only if the user owns it OR has been explicitly granted a
  // permission (`effective_permission` is non-null when the row was returned
  // because of `cld_get_effective_permission`). Public-but-not-granted rows
  // are dropped — those should only surface via direct share links, not the
  // user's tree.
  //
  // Tracked in for_python/REQUESTS.md (item 0a).
  const ownedOrSharedRows = rows.filter((row) => {
    if (row.kind === "folder") return true; // already owner-scoped server-side
    if (row.owner_id === userId) return true;
    if (row.effective_permission != null) return true;
    return false;
  });

  const files: Partial<CloudFile>[] = [];
  const folders: Partial<CloudFolder>[] = [];
  for (const row of ownedOrSharedRows) {
    if (row.kind === "file") {
      files.push({
        id: row.id,
        ownerId: row.owner_id,
        filePath: row.file_path,
        fileName: row.file_name,
        parentFolderId: row.parent_folder_id,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        visibility: row.visibility,
        currentVersion: row.current_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      });
    } else {
      folders.push({
        id: row.id,
        ownerId: row.owner_id,
        folderPath: row.folder_path,
        folderName: row.folder_name,
        parentId: row.parent_id,
        visibility: row.visibility,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      });
    }
  }

  dispatch(upsertFiles(files));
  dispatch(upsertFolders(folders));

  // Build tree spine directly from the just-parsed rows. Simpler than reading
  // the normalized slice back out, and avoids any race with batched dispatch.
  const fileIds = files.map((f) => f.id!).filter(Boolean);
  const folderIds = folders.map((f) => f.id!).filter(Boolean);
  const tree = buildTreeState({
    fileIds,
    folderIds,
    filesById: Object.fromEntries(
      files.map((f) => [
        f.id!,
        {
          id: f.id!,
          ownerId: f.ownerId ?? "",
          filePath: f.filePath ?? "",
          storageUri: "",
          fileName: f.fileName ?? "",
          mimeType: f.mimeType ?? null,
          fileSize: f.fileSize ?? null,
          checksum: null,
          visibility: (f.visibility ?? "private") as Visibility,
          currentVersion: f.currentVersion ?? 1,
          parentFolderId: f.parentFolderId ?? null,
          metadata: {},
          createdAt: f.createdAt ?? "",
          updatedAt: f.updatedAt ?? "",
          deletedAt: f.deletedAt ?? null,
          // Tree-spine reconstruction is internal — public_url is only
          // populated when records arrive via the API. Default to null
          // here; surfaces that need a CDN URL fetch via useSignedUrl.
          publicUrl: null,
          source: { kind: "real" },
          _dirty: false,
          _dirtyFields: {},
          _fieldHistory: {},
          _loadedFields: {},
          _loading: false,
          _error: null,
          _pendingRequestIds: [],
        },
      ]),
    ),
    foldersById: Object.fromEntries(
      folders.map((f) => [
        f.id!,
        {
          id: f.id!,
          ownerId: f.ownerId ?? "",
          folderPath: f.folderPath ?? "",
          folderName: f.folderName ?? "",
          parentId: f.parentId ?? null,
          visibility: (f.visibility ?? "private") as Visibility,
          metadata: {},
          createdAt: f.createdAt ?? "",
          updatedAt: f.updatedAt ?? "",
          deletedAt: f.deletedAt ?? null,
          // Tree-spine reconstruction is internal — public_url is only
          // populated when records arrive via the API. Default to null
          // here; surfaces that need a CDN URL fetch via useSignedUrl.
          publicUrl: null,
          source: { kind: "real" },
          _dirty: false,
          _dirtyFields: {},
          _fieldHistory: {},
          _loadedFields: {},
          _loading: false,
          _error: null,
          _pendingRequestIds: [],
        },
      ]),
    ),
  });
  dispatch(
    replaceTree({
      rootFolderIds: tree.rootFolderIds,
      rootFileIds: tree.rootFileIds,
      childrenByFolderId: tree.childrenByFolderId,
    }),
  );
});

/**
 * Re-run the tree load. Fired by the realtime middleware when the subscription
 * reconnects after an outage — guarantees we don't miss events.
 */
export const reconcileTree = createAsyncThunk<
  void,
  { userId: string },
  ThunkApi
>("cloudFiles/reconcileTree", async ({ userId }, { dispatch }) => {
  await dispatch(loadUserFileTree({ userId })).unwrap();
});

export const loadFolderContents = createAsyncThunk<
  void,
  { folderId: string },
  ThunkApi
>("cloudFiles/loadFolderContents", async ({ folderId }, { dispatch }) => {
  // Virtual folders use their adapter's `list()` via `loadVirtualChildren`
  // — `cld_*` tables don't know about them and would 22P02 on the synthetic id.
  if (folderId.startsWith("vfs:")) return;
  const [filesRes, foldersRes] = await Promise.all([
    supabase
      .from("cld_files")
      .select("*")
      .eq("parent_folder_id", folderId)
      .is("deleted_at", null),
    supabase
      .from("cld_folders")
      .select("*")
      .eq("parent_id", folderId)
      .is("deleted_at", null),
  ]);
  if (filesRes.error) throw filesRes.error;
  if (foldersRes.error) throw foldersRes.error;

  dispatch(upsertFiles((filesRes.data ?? []).map(dbRowToCloudFile)));
  dispatch(upsertFolders((foldersRes.data ?? []).map(dbRowToCloudFolder)));

  for (const f of filesRes.data ?? []) {
    dispatch(
      attachChildToFolder({
        parentFolderId: folderId,
        kind: "file",
        id: f.id,
      }),
    );
  }
  for (const f of foldersRes.data ?? []) {
    dispatch(
      attachChildToFolder({
        parentFolderId: folderId,
        kind: "folder",
        id: f.id,
      }),
    );
  }
});

// Virtual ids look like `vfs:<adapter>:<vid>` and can't be queried against
// the real `cld_*` tables — Postgres rejects them with `22P02 invalid input
// syntax for type uuid`. The version / permission / share-link surfaces
// aren't mapped to virtual sources in v1, so these thunks short-circuit
// for synthetic ids. Consumers (FileVersionsList, useSharing) also render
// a "not supported here" empty state so the UX is clear, not silent.
function isVirtualResourceId(id: string): boolean {
  return id.startsWith("vfs:");
}

export const loadFileVersions = createAsyncThunk<
  void,
  { fileId: string },
  ThunkApi
>("cloudFiles/loadFileVersions", async ({ fileId }, { dispatch }) => {
  if (isVirtualResourceId(fileId)) return;
  const { data, error } = await supabase
    .from("cld_file_versions")
    .select("*")
    .eq("file_id", fileId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  const versions: CloudFileVersion[] = (data ?? []).map(
    dbRowToCloudFileVersion,
  );
  dispatch(upsertVersionsForFile({ fileId, versions }));
});

export const loadPermissions = createAsyncThunk<
  void,
  { resourceId: string },
  ThunkApi
>("cloudFiles/loadPermissions", async ({ resourceId }, { dispatch }) => {
  if (isVirtualResourceId(resourceId)) return;
  const { data, error } = await supabase
    .from("cld_file_permissions")
    .select("*")
    .eq("resource_id", resourceId);
  if (error) throw error;
  const permissions: CloudFilePermission[] = (data ?? []).map(
    dbRowToCloudFilePermission,
  );
  dispatch(upsertPermissionsForResource({ resourceId, permissions }));
});

export const loadShareLinks = createAsyncThunk<
  void,
  { resourceId: string },
  ThunkApi
>("cloudFiles/loadShareLinks", async ({ resourceId }, { dispatch }) => {
  if (isVirtualResourceId(resourceId)) return;
  const { data, error } = await supabase
    .from("cld_share_links")
    .select("*")
    .eq("resource_id", resourceId)
    .eq("is_active", true);
  if (error) throw error;
  const shareLinks: CloudShareLink[] = (data ?? []).map(dbRowToCloudShareLink);
  dispatch(upsertShareLinksForResource({ resourceId, shareLinks }));
});

// ---------------------------------------------------------------------------
// Writes — folders
// ---------------------------------------------------------------------------
//
// NOTE: The Python backend doesn't expose dedicated folder-CRUD endpoints
// per the current contract (see PYTHON_TEAM_COMMS.md). Folders are cheap,
// rows-only entities with RLS, so we write directly via supabase-js. If the
// Python team ships a REST endpoint later, these thunks can be swapped to
// hit it without changing callers.

/**
 * Create a folder via the Python REST contract. We hit `POST /folders` with
 * the explicit `{ folder_name, parent_id }` form because callers already
 * resolve the parent id from the tree. The path-style form (`folder_path`)
 * is preferred for upload-time auto-create, which `uploadFiles` handles.
 *
 * Architecturally important: this thunk no longer touches `cld_folders` from
 * the browser. Folder writes were the single biggest source of RLS recursion
 * regressions; routing them through the backend (which uses SECURITY DEFINER
 * helpers) makes the path uniform with file uploads.
 */
export const createFolder = createAsyncThunk<
  string,
  import("@/features/files/types").CreateFolderArg,
  ThunkApi
>("cloudFiles/createFolder", async (arg, { dispatch, getState }) => {
  const folderName = arg.folderName.trim();
  if (!folderName) {
    throw new Error("Folder name cannot be empty.");
  }
  if (/[/\\]/.test(folderName)) {
    throw new Error("Folder names cannot contain '/' or '\\'.");
  }
  // Reject NUL + ASCII control characters. These can be paste-injected
  // and confuse downstream object stores or any layer that materialises
  // the path on disk. Mirrors the rule in `validateRenameInput`.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(folderName)) {
    throw new Error("Folder names cannot contain control characters.");
  }
  if (folderName.endsWith(".")) {
    throw new Error("Folder names cannot end with '.'.");
  }
  // Sibling collision check — case-insensitive. Without this the thunk
  // happily issues `POST /folders` with a duplicate name and the backend
  // either returns a confusing UNIQUE-constraint error or (worse) silently
  // creates a sibling that's indistinguishable from the existing one.
  {
    const state = getState().cloudFiles;
    const lowered = folderName.toLowerCase();
    const collision = Object.values(state.foldersById).some(
      (f) =>
        !!f &&
        !f.deletedAt &&
        (f.parentId ?? null) === (arg.parentId ?? null) &&
        f.folderName.toLowerCase() === lowered,
    );
    if (collision) {
      throw new Error(
        `A folder named '${folderName}' already exists in this location.`,
      );
    }
  }

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "folder-create",
    resourceId: null,
    resourceType: "folder",
  });

  // Always use path-style: the backend rejects `{folder_name, parent_id}`
  // with `validation_error` (both at root with parent_id=null AND nested
  // with a parent uuid). Path-style creation is idempotent and creates
  // any missing intermediate segments. For nested creation we resolve the
  // parent's path from local state and append the new segment.
  let folderPath = folderName;
  if (arg.parentId !== null) {
    const parent = getState().cloudFiles.foldersById[arg.parentId];
    if (!parent) {
      throw new Error(
        `Cannot create folder: parent folder ${arg.parentId} not found in local state.`,
      );
    }
    folderPath = `${parent.folderPath}/${folderName}`;
  }
  const body = {
    folder_path: folderPath,
    visibility: arg.visibility ?? "private",
    metadata: arg.metadata ?? null,
  };

  try {
    const { data: row } = await Folders.createFolder(body, { requestId });

    const folder = dbRowToCloudFolder(row);
    dispatch(upsertFolder(folder));
    dispatch(
      attachChildToFolder({
        parentFolderId: folder.parentId,
        kind: "folder",
        id: folder.id,
      }),
    );
    return folder.id;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      const e = err as {
        status?: number | null;
        code?: string;
        detail?: string;
        userMessage?: string;
        details?: unknown;
      };
      // Surface the full backend response so we can fix the contract drift
      // rather than show a generic "request failed" toast.
      console.error("[createFolder] backend error", {
        status: e.status ?? null,
        code: e.code,
        detail: e.detail,
        userMessage: e.userMessage,
        details: e.details,
        sentBody: body,
      });
    }
    throw err;
  } finally {
    releaseRequest(requestId);
  }
});

/**
 * Update folder properties — rename, move (`parentId`), change visibility,
 * patch metadata. Optimistic: applies the patch locally before the REST call
 * and rolls back on failure.
 */
export const updateFolder = createAsyncThunk<
  void,
  import("@/features/files/types").UpdateFolderArg,
  ThunkApi
>("cloudFiles/updateFolder", async (arg, { dispatch, getState }) => {
  const state = getState();
  const folder = state.cloudFiles.foldersById[arg.folderId];
  if (!folder) throw new Error(`Folder not found: ${arg.folderId}`);

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "folder-update",
    resourceId: arg.folderId,
    resourceType: "folder",
  });

  // Optimistic: apply the patch locally.
  const patch = arg.patch;
  const optimistic: CloudFolder = {
    ...folder,
    ...(patch.folderName !== undefined ? { folderName: patch.folderName } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
  };
  dispatch(upsertFolder(optimistic));

  // Track move in tree state — detach from old parent, attach under new.
  if (patch.parentId !== undefined && patch.parentId !== folder.parentId) {
    dispatch(
      detachChildFromFolder({
        parentFolderId: folder.parentId,
        kind: "folder",
        id: folder.id,
      }),
    );
    dispatch(
      attachChildToFolder({
        parentFolderId: patch.parentId,
        kind: "folder",
        id: folder.id,
      }),
    );
  }

  try {
    const { data: row } = await Folders.patchFolder(
      arg.folderId,
      {
        folder_name: patch.folderName,
        parent_id: patch.parentId,
        visibility: patch.visibility,
        metadata: patch.metadata ?? null,
      },
      { requestId },
    );
    dispatch(upsertFolder(dbRowToCloudFolder(row)));
  } catch (err) {
    // Roll back to the pre-edit folder state and tree links.
    dispatch(upsertFolder(folder));
    if (patch.parentId !== undefined && patch.parentId !== folder.parentId) {
      dispatch(
        detachChildFromFolder({
          parentFolderId: patch.parentId,
          kind: "folder",
          id: folder.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: folder.parentId,
          kind: "folder",
          id: folder.id,
        }),
      );
    }
    throw err;
  } finally {
    releaseRequest(requestId);
  }
});

export const deleteFolder = createAsyncThunk<
  void,
  import("@/features/files/types").DeleteFolderArg,
  ThunkApi
>("cloudFiles/deleteFolder", async (arg, { dispatch, getState }) => {
  const state = getState();
  const folder = state.cloudFiles.foldersById[arg.folderId];
  if (!folder) return;

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "folder-delete",
    resourceId: arg.folderId,
    resourceType: "folder",
  });

  try {
    await Folders.deleteFolder(
      arg.folderId,
      { hardDelete: arg.hardDelete },
      { requestId },
    );
    dispatch(removeFolder({ id: arg.folderId }));
  } finally {
    releaseRequest(requestId);
  }
});

/**
 * Ensure every segment of `folderPath` exists; create any that don't.
 * Returns the leaf folder's id. Used for convention-based uploads like
 * "save all pasted images under /Images".
 */
export const ensureFolderPath = createAsyncThunk<
  string,
  import("@/features/files/types").EnsureFolderPathArg,
  ThunkApi
>("cloudFiles/ensureFolderPath", async (arg, { dispatch, getState }) => {
  const segments = arg.folderPath
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new Error("folderPath cannot be empty.");
  }

  let parentId: string | null = null;
  let accumulatedPath = "";

  for (const segment of segments) {
    accumulatedPath = accumulatedPath
      ? `${accumulatedPath}/${segment}`
      : segment;

    // Check live state first — the realtime subscription keeps it current.
    const state = getState();
    const existing = Object.values(state.cloudFiles.foldersById).find(
      (f) =>
        f.folderPath === accumulatedPath &&
        !f.deletedAt &&
        (parentId == null ? f.parentId == null : f.parentId === parentId),
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }

    // Not in local state — fall back to a DB lookup (another device may have
    // created it). This is the path that also handles races on first use.
    const { data: existingRow } = await supabase
      .from("cld_folders")
      .select("*")
      .eq("folder_path", accumulatedPath)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingRow) {
      const existingFolder = dbRowToCloudFolder(existingRow);
      dispatch(upsertFolder(existingFolder));
      parentId = existingFolder.id;
      continue;
    }

    // Still missing — create it.
    parentId = await dispatch(
      createFolder({
        folderName: segment,
        parentId,
        visibility: arg.visibility ?? "private",
      }),
    ).unwrap();
  }

  if (!parentId) throw new Error("Unreachable: ensureFolderPath");
  return parentId;
});

// ---------------------------------------------------------------------------
// Writes — uploads (multi-file with progress)
// ---------------------------------------------------------------------------

export const uploadFiles = createAsyncThunk<
  { uploaded: string[]; failed: Array<{ name: string; error: string }> },
  UploadFilesArg,
  ThunkApi
>("cloudFiles/uploadFiles", async (arg, { dispatch, getState }) => {
  const concurrency = Math.max(1, arg.concurrency ?? 3);
  const uploaded: string[] = [];
  // Track REAL error per file (not just filename). Without this, every
  // upload failure surfaces to callers as the file's name rather than the
  // backend's actual error code/message — which is what made the Phase
  // 11 migration look "broken" when really we just couldn't see why.
  const failed: Array<{ name: string; error: string }> = [];

  // Resolve logical path prefix.
  //
  // Order of preference:
  //   1. `folderPath` arg — passed directly (the Python backend
  //      auto-creates the hierarchy server-side; the browser never has to
  //      query `cld_folders` via supabase-js, which avoids the
  //      well-known RLS recursion bug on `cld_file_permissions`).
  //   2. `parentFolderId` — look up the folder in slice state (works when
  //      the folder is already loaded from the tree RPC or realtime).
  //   3. Empty prefix — file lands at root.
  const state = getState();
  let prefix = "";
  if (arg.folderPath) {
    prefix = `${arg.folderPath.replace(/^\/+|\/+$/g, "")}/`;
  } else if (arg.parentFolderId) {
    const parentFolder = state.cloudFiles.foldersById[arg.parentFolderId];
    if (parentFolder) {
      prefix = `${parentFolder.folderPath}/`;
    }
  }

  // ─── Collision handling ───────────────────────────────────────────────
  //
  // Build a case-insensitive set of file names already present in the
  // destination. Used by `uniqueName` below to auto-rename uploads that
  // collide ("report.pdf" → "report (1).pdf"). Without this, the backend
  // either silently overwrites or version-bumps the existing file —
  // neither matches user expectations from Drive / Dropbox where a
  // duplicate upload becomes "report (1).pdf" by default.
  //
  // We only consider files in the SAME parent folder. The lookup is by
  // path-prefix because virtual folders may not have stable ids in
  // local state at upload time (e.g. `folderPath` arg with no
  // pre-loaded folder row).
  const existingNames = (() => {
    const out = new Set<string>();
    const targetPrefix = prefix; // captured outside; matches "<path>/<name>"
    for (const f of Object.values(state.cloudFiles.filesById)) {
      if (!f) continue;
      if (f.deletedAt) continue;
      // Match by storage path under the prefix. `f.filePath` is the
      // backend's canonical path including the file name.
      if (!f.filePath) continue;
      const normalized = f.filePath.replace(/^\/+/, "");
      if (!normalized.startsWith(targetPrefix)) continue;
      const tail = normalized.slice(targetPrefix.length);
      // Skip files nested deeper than this folder.
      if (tail.includes("/")) continue;
      if (tail) out.add(tail.toLowerCase());
    }
    return out;
  })();

  /**
   * Pick the next non-colliding name, mutating the queue:
   *   "report.pdf" → "report.pdf"           (no collision)
   *   "report.pdf" → "report (1).pdf"       (one collision)
   *   "report.pdf" → "report (2).pdf"       (two collisions)
   *   ".env"       → ".env (1)"             (hidden file: suffix only)
   *
   * Reserves the chosen name in `existingNames` so back-to-back uploads
   * of the same source file (drop the same File twice) don't collide
   * with each other.
   */
  function uniqueName(originalName: string): string {
    const lowered = originalName.toLowerCase();
    if (!existingNames.has(lowered)) {
      existingNames.add(lowered);
      return originalName;
    }
    const dot = originalName.lastIndexOf(".");
    const isHidden = originalName.startsWith(".");
    const stem =
      dot > 0 && !isHidden ? originalName.slice(0, dot) : originalName;
    const ext = dot > 0 && !isHidden ? originalName.slice(dot) : "";
    for (let i = 1; i < 1000; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!existingNames.has(candidate.toLowerCase())) {
        existingNames.add(candidate.toLowerCase());
        return candidate;
      }
    }
    // 1000 collisions — fall back to original name and let the backend
    // version-bump. Practically never reached.
    return originalName;
  }

  // ─── Per-file overrides from the duplicate-upload dialog ────────────
  //
  // When a user picks "Overwrite" on a duplicate, the dialog passes the
  // existing file's exact name back as a `filenameOverrides[index]`
  // entry. We honour the override verbatim — the auto " (1)" rename
  // would defeat the point. When they pick "Skip", the dialog adds the
  // index to `skipIndices` and we drop that file from the queue.
  const overrides = arg.filenameOverrides ?? {};
  const skipSet = new Set(arg.skipIndices ?? []);

  // Reserve override target names in `existingNames` BEFORE the loop
  // runs, so two overrides into the same path can't both win and so
  // a file with no override doesn't accidentally collide-rename onto
  // an override target.
  for (const [, name] of Object.entries(overrides)) {
    if (typeof name === "string") existingNames.add(name.toLowerCase());
  }

  // Build the queue as [originalIndex, file] pairs so workers can
  // look up overrides by index regardless of dequeue order.
  const queue: Array<{ index: number; file: File }> = arg.files
    .map((file, index) => ({ index, file }))
    .filter(({ index }) => !skipSet.has(index));

  async function worker(): Promise<void> {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      const { file, index } = next;
      const requestId = newRequestId();
      // Override (from duplicate dialog "Overwrite") wins. Otherwise
      // the auto " (1)" rename runs. We track the display name
      // separately from the original file.name so progress + telemetry
      // continue to use what the user dragged in.
      const overrideName = overrides[index];
      const targetName =
        typeof overrideName === "string" && overrideName
          ? overrideName
          : uniqueName(file.name);
      dispatch(
        trackUploadStart({
          requestId,
          fileName: targetName,
          fileSize: file.size,
          parentFolderId: arg.parentFolderId,
        }),
      );
      registerRequest({
        requestId,
        kind: "upload",
        resourceId: null,
        resourceType: "file",
      });
      try {
        const { data } = await Files.uploadFileWithProgress(
          {
            file,
            filePath: `${prefix}${targetName}`,
            visibility: arg.visibility ?? "private",
            shareWith: arg.shareWith,
            shareLevel: arg.shareLevel,
            changeSummary: arg.changeSummary,
            metadata: arg.metadata,
          },
          (ev) =>
            dispatch(
              updateUploadProgress({
                requestId,
                bytesUploaded: ev.loaded,
              }),
            ),
          {
            requestId,
            // Idempotency key — same value across automatic retries of the
            // same intended upload. The backend stores it in
            // `metadata._idempotency_key` so retries don't create duplicate
            // version rows. We reuse `requestId` because it's generated
            // once per intended upload, before any retry.
            idempotencyKey: requestId,
          },
        );
        // Upsert file into slice from response.
        dispatch(
          upsertFile(
            apiFileRecordToCloudFile({
              id: data.file_id,
              owner_id: "",
              file_path: data.file_path,
              storage_uri: data.storage_uri,
              file_name: data.file_path.split("/").pop() ?? targetName,
              mime_type: file.type || null,
              file_size: data.file_size,
              checksum: data.checksum,
              visibility: arg.visibility ?? "private",
              current_version: data.version_number,
              parent_folder_id: arg.parentFolderId ?? null,
              metadata: arg.metadata ?? {},
              created_at: null,
              updated_at: null,
              deleted_at: null,
            }),
          ),
        );
        // If this upload replaced an existing file (same logical path,
        // backend bumped current_version), the cached blob for the
        // original version is now stale. Invalidate so the next preview
        // open re-fetches the latest bytes.
        invalidateBlobCache(data.file_id);
        dispatch(
          attachChildToFolder({
            parentFolderId: arg.parentFolderId,
            kind: "file",
            id: data.file_id,
          }),
        );
        dispatch(
          updateUploadStatus({
            requestId,
            status: "success",
            fileId: data.file_id,
          }),
        );
        uploaded.push(data.file_id);
      } catch (err) {
        const message = extractErrorMessage(err);
        dispatch(
          updateUploadStatus({
            requestId,
            status: "error",
            error: message,
          }),
        );
        failed.push({ name: file.name, error: message });
      } finally {
        releaseRequest(requestId);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arg.files.length) }, () =>
      worker(),
    ),
  );

  return { uploaded, failed };
});

export const clearUploadEntry = createAsyncThunk<
  void,
  { requestId: string },
  ThunkApi
>("cloudFiles/clearUpload", async ({ requestId }, { dispatch }) => {
  dispatch(clearUpload({ requestId }));
});

// ---------------------------------------------------------------------------
// Writes — optimistic metadata updates
// ---------------------------------------------------------------------------

export const renameFile = createAsyncThunk<void, RenameFileArg, ThunkApi>(
  "cloudFiles/rename",
  async ({ fileId, newName }, { dispatch, getState }) => {
    const record = getFileFromState(getState(), fileId);
    if (!record) throw new Error(`File not found: ${fileId}`);

    const requestId = newRequestId();
    const snapshot: CloudFileFieldSnapshot = {
      fileName: record.fileName,
      filePath: record.filePath,
    };

    // Compute new file path (replace final segment).
    const pathParts = record.filePath.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join("/");

    dispatch(setFileField({ id: fileId, field: "fileName", value: newName }));
    dispatch(setFileField({ id: fileId, field: "filePath", value: newPath }));
    dispatch(addFilePendingRequest({ id: fileId, requestId }));
    registerRequest({
      requestId,
      kind: "rename",
      resourceId: fileId,
      resourceType: "file",
    });

    try {
      // Use the dedicated rename endpoint — it accepts a full new path,
      // auto-creates parent folders if any segment is missing, and lets
      // the backend handle the file_path / storage_uri update atomically.
      const { data } = await Files.renameFile(
        fileId,
        { new_path: newPath },
        { requestId },
      );
      dispatch(upsertFile(apiFileRecordToCloudFile(data)));
      dispatch(markFileSaved({ id: fileId }));
    } catch (err) {
      dispatch(rollbackFileOptimisticUpdate({ id: fileId, snapshot }));
      const msg = extractErrorMessage(err);
      dispatch(setFileError({ id: fileId, error: msg }));
      throw err;
    } finally {
      dispatch(removeFilePendingRequest({ id: fileId, requestId }));
      releaseRequest(requestId);
    }
  },
);

export const moveFile = createAsyncThunk<void, MoveFileArg, ThunkApi>(
  "cloudFiles/move",
  async ({ fileId, newParentFolderId }, { dispatch, getState }) => {
    const record = getFileFromState(getState(), fileId);
    if (!record) throw new Error(`File not found: ${fileId}`);
    const oldParentId = record.parentFolderId;
    const requestId = newRequestId();
    const snapshot: CloudFileFieldSnapshot = {
      parentFolderId: oldParentId,
    };

    dispatch(
      setFileField({
        id: fileId,
        field: "parentFolderId",
        value: newParentFolderId,
      }),
    );
    dispatch(
      detachChildFromFolder({
        parentFolderId: oldParentId,
        kind: "file",
        id: fileId,
      }),
    );
    dispatch(
      attachChildToFolder({
        parentFolderId: newParentFolderId,
        kind: "file",
        id: fileId,
      }),
    );
    dispatch(addFilePendingRequest({ id: fileId, requestId }));
    registerRequest({
      requestId,
      kind: "move",
      resourceId: fileId,
      resourceType: "file",
    });

    try {
      // Move = rename to a new full logical path. The backend's rename
      // endpoint auto-creates missing parent folders, so we just compute
      // `<targetFolderPath>/<filename>` (or `<filename>` for root) and
      // hand it over.
      const targetFolder =
        newParentFolderId === null
          ? null
          : (getState().cloudFiles.foldersById[newParentFolderId] ?? null);
      const targetPrefix = targetFolder ? `${targetFolder.folderPath}/` : "";
      const newPath = `${targetPrefix}${record.fileName}`;

      const { data } = await Files.renameFile(
        fileId,
        { new_path: newPath },
        { requestId },
      );
      dispatch(upsertFile(apiFileRecordToCloudFile(data)));
      dispatch(markFileSaved({ id: fileId }));
    } catch (err) {
      // Rollback tree membership + field.
      dispatch(
        detachChildFromFolder({
          parentFolderId: newParentFolderId,
          kind: "file",
          id: fileId,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: oldParentId,
          kind: "file",
          id: fileId,
        }),
      );
      dispatch(rollbackFileOptimisticUpdate({ id: fileId, snapshot }));
      const msg = extractErrorMessage(err);
      dispatch(setFileError({ id: fileId, error: msg }));
      throw err;
    } finally {
      dispatch(removeFilePendingRequest({ id: fileId, requestId }));
      releaseRequest(requestId);
    }
  },
);

export const updateFileMetadata = createAsyncThunk<
  void,
  UpdateFileMetadataArg,
  ThunkApi
>(
  "cloudFiles/updateMetadata",
  async ({ fileId, patch }, { dispatch, getState }) => {
    const record = getFileFromState(getState(), fileId);
    if (!record) throw new Error(`File not found: ${fileId}`);

    const requestId = newRequestId();
    const snapshot: CloudFileFieldSnapshot = {
      visibility: record.visibility,
      metadata: record.metadata,
    };

    if (patch.visibility !== undefined) {
      dispatch(
        setFileField({
          id: fileId,
          field: "visibility",
          value: patch.visibility,
        }),
      );
    }
    if (patch.metadata !== undefined) {
      dispatch(
        setFileField({
          id: fileId,
          field: "metadata",
          value: patch.metadata,
        }),
      );
    }
    dispatch(addFilePendingRequest({ id: fileId, requestId }));
    registerRequest({
      requestId,
      kind: "update",
      resourceId: fileId,
      resourceType: "file",
    });

    try {
      const { data } = await Files.patchFile(
        fileId,
        {
          visibility: patch.visibility,
          metadata: patch.metadata,
        },
        { requestId },
      );
      dispatch(upsertFile(apiFileRecordToCloudFile(data)));
      dispatch(markFileSaved({ id: fileId }));
    } catch (err) {
      dispatch(rollbackFileOptimisticUpdate({ id: fileId, snapshot }));
      const msg = extractErrorMessage(err);
      dispatch(setFileError({ id: fileId, error: msg }));
      throw err;
    } finally {
      dispatch(removeFilePendingRequest({ id: fileId, requestId }));
      releaseRequest(requestId);
    }
  },
);

// ---------------------------------------------------------------------------
// Writes — delete
// ---------------------------------------------------------------------------

export const deleteFile = createAsyncThunk<void, DeleteFileArg, ThunkApi>(
  "cloudFiles/delete",
  async ({ fileId, hardDelete }, { dispatch, getState }) => {
    const record = getFileFromState(getState(), fileId);
    if (!record) return; // nothing to do
    const parentFolderId = record.parentFolderId;
    const requestId = newRequestId();

    // Optimistic remove.
    dispatch(removeFile({ id: fileId }));
    dispatch(
      detachChildFromFolder({
        parentFolderId,
        kind: "file",
        id: fileId,
      }),
    );
    // Drop the cached blob bytes — the file is gone, no point holding
    // memory for something the user can't open anymore (and if the
    // delete is rolled back on error, the next open will re-fetch).
    invalidateBlobCache(fileId);
    registerRequest({
      requestId,
      kind: "delete",
      resourceId: fileId,
      resourceType: "file",
    });

    try {
      await Files.deleteFile(fileId, { hardDelete }, { requestId });
    } catch (err) {
      // Rollback — reinsert the record and reattach to its parent.
      dispatch(upsertFile(record));
      dispatch(
        attachChildToFolder({
          parentFolderId,
          kind: "file",
          id: fileId,
        }),
      );
      throw err;
    } finally {
      releaseRequest(requestId);
    }
  },
);

// ---------------------------------------------------------------------------
// Writes — versions
// ---------------------------------------------------------------------------

export const restoreVersion = createAsyncThunk<
  void,
  RestoreVersionArg,
  ThunkApi
>(
  "cloudFiles/restoreVersion",
  async ({ fileId, versionNumber }, { dispatch }) => {
    if (isVirtualResourceId(fileId)) return;
    dispatch(setFileLoading({ id: fileId, loading: true }));
    const requestId = newRequestId();
    registerRequest({
      requestId,
      kind: "restore-version",
      resourceId: fileId,
      resourceType: "file",
    });
    try {
      const { data } = await Versions.restoreVersion(fileId, versionNumber, {
        requestId,
      });
      dispatch(upsertFile(apiFileRecordToCloudFile(data)));
      // The current bytes just changed — drop any cached blob so the
      // next preview reads the restored version, not the in-memory
      // copy of the version that was active before restore.
      invalidateBlobCache(fileId);
      // Reload version list to pick up the new synthetic version row.
      await dispatch(loadFileVersions({ fileId })).unwrap();
    } finally {
      dispatch(setFileLoading({ id: fileId, loading: false }));
      releaseRequest(requestId);
    }
  },
);

// ---------------------------------------------------------------------------
// Writes — permissions
// ---------------------------------------------------------------------------

export const grantPermission = createAsyncThunk<
  void,
  GrantPermissionArg,
  ThunkApi
>("cloudFiles/grantPermission", async (arg, { dispatch }) => {
  if (isVirtualResourceId(arg.resourceId)) {
    throw new Error("Sharing isn't available for this source yet.");
  }
  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "grant-permission",
    resourceId: arg.resourceId,
    resourceType: arg.resourceType,
  });
  try {
    const body = {
      grantee_id: arg.granteeId,
      level: arg.level,
      grantee_type: arg.granteeType ?? "user",
      expires_at: arg.expiresAt ?? null,
    };
    const { data } =
      arg.resourceType === "folder"
        ? await Permissions.grantFolderPermission(arg.resourceId, body, {
            requestId,
          })
        : await Permissions.grantFilePermission(arg.resourceId, body, {
            requestId,
          });
    dispatch(
      upsertPermissionsForResource({
        resourceId: arg.resourceId,
        permissions: [dbRowToCloudFilePermission(data)],
      }),
    );
    // Full refresh to keep the list authoritative.
    await dispatch(loadPermissions({ resourceId: arg.resourceId })).unwrap();
  } finally {
    releaseRequest(requestId);
  }
});

export const revokePermission = createAsyncThunk<
  void,
  RevokePermissionArg,
  ThunkApi
>("cloudFiles/revokePermission", async (arg, { dispatch }) => {
  if (isVirtualResourceId(arg.resourceId)) {
    throw new Error("Sharing isn't available for this source yet.");
  }
  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "revoke-permission",
    resourceId: arg.resourceId,
    resourceType: arg.resourceType,
  });
  try {
    if (arg.resourceType === "folder") {
      await Permissions.revokeFolderPermission(
        arg.resourceId,
        arg.granteeId,
        { granteeType: arg.granteeType ?? "user" },
        { requestId },
      );
    } else {
      await Permissions.revokeFilePermission(
        arg.resourceId,
        arg.granteeId,
        { granteeType: arg.granteeType ?? "user" },
        { requestId },
      );
    }
    dispatch(
      removePermissionForResource({
        resourceId: arg.resourceId,
        granteeId: arg.granteeId,
        granteeType: arg.granteeType ?? "user",
      }),
    );
  } finally {
    releaseRequest(requestId);
  }
});

// ---------------------------------------------------------------------------
// Writes — share links
// ---------------------------------------------------------------------------

export const createShareLink = createAsyncThunk<
  CloudShareLink,
  CreateShareLinkArg,
  ThunkApi
>("cloudFiles/createShareLink", async (arg, { dispatch }) => {
  if (isVirtualResourceId(arg.resourceId)) {
    throw new Error("Share links aren't available for this source yet.");
  }
  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "create-share-link",
    resourceId: arg.resourceId,
    resourceType: arg.resourceType,
  });
  try {
    const body = {
      permission_level: arg.permissionLevel,
      expires_at: arg.expiresAt ?? null,
      max_uses: arg.maxUses ?? null,
    };
    const { data } =
      arg.resourceType === "folder"
        ? await ShareLinks.createFolderShareLink(arg.resourceId, body, {
            requestId,
          })
        : await ShareLinks.createFileShareLink(arg.resourceId, body, {
            requestId,
          });
    const link = dbRowToCloudShareLink(data);
    await dispatch(loadShareLinks({ resourceId: arg.resourceId })).unwrap();
    return link;
  } finally {
    releaseRequest(requestId);
  }
});

export const deactivateShareLink = createAsyncThunk<
  void,
  DeactivateShareLinkArg,
  ThunkApi
>("cloudFiles/deactivateShareLink", async ({ shareToken }, { dispatch }) => {
  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "deactivate-share-link",
    resourceId: null,
    resourceType: null,
  });
  try {
    await ShareLinks.deactivateShareLink(shareToken, { requestId });
    dispatch(removeShareLink({ shareToken }));
  } finally {
    releaseRequest(requestId);
  }
});

// ---------------------------------------------------------------------------
// Utility — getSignedUrl (no slice state change; caller stores the URL).
// ---------------------------------------------------------------------------

export const getSignedUrl = createAsyncThunk<
  { url: string; expiresIn: number },
  SignedUrlArg,
  ThunkApi
>("cloudFiles/getSignedUrl", async ({ fileId, expiresIn }) => {
  if (isVirtualResourceId(fileId)) {
    // Virtual files don't have S3 bytes — there's no signed URL. Callers
    // already hide the buttons that surface signed URLs (Download, Copy
    // link, Open in new tab) for virtual rows; this guards the API path
    // for any remaining callers.
    throw new Error("Signed URLs aren't available for virtual sources");
  }
  const { data } = await Files.getSignedUrl(fileId, { expiresIn });
  return { url: data.url, expiresIn: data.expires_in };
});

// ---------------------------------------------------------------------------
// Bulk operations (Python P-7)
// ---------------------------------------------------------------------------
//
// Each bulk thunk applies the optimistic local change up front, then makes a
// single REST round-trip. The backend returns a per-item succeeded/failed
// envelope; we re-apply the failed entries by re-upserting their pre-change
// state from a snapshot taken before the optimistic update.

/**
 * Soft-delete (or hard-delete) many files in one round-trip.
 *
 * Returns the standard `BulkResponse` envelope so the caller can decide
 * how to surface partial failures (toast vs. row-level error chips).
 * Successful ids are removed from the local store immediately for
 * snappy UI; failed ids are restored from the pre-change snapshot.
 */
export const bulkDeleteFiles = createAsyncThunk<
  BulkResponse,
  BulkDeleteFilesArg,
  ThunkApi
>("cloudFiles/bulkDeleteFiles", async (arg, { dispatch, getState }) => {
  if (arg.fileIds.length === 0) {
    return { results: [], succeeded: 0, failed: 0 };
  }

  // Snapshot pre-change records for rollback on per-item failures.
  const state = getState();
  const snapshots = new Map<string, CloudFile>();
  for (const id of arg.fileIds) {
    const file = state.cloudFiles.filesById[id];
    if (file) snapshots.set(id, file);
  }

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "bulk-delete-files",
    resourceId: null,
    resourceType: "file",
  });

  // Optimistic: remove all targets from the local store and drop their
  // cached blobs (deletion makes the cache entry useless and keeping
  // bytes around for soft-deleted items wastes the LRU budget).
  for (const id of arg.fileIds) {
    dispatch(removeFile({ id }));
    invalidateBlobCache(id);
  }

  try {
    const { data } = await Files.bulkDeleteFiles(
      { file_ids: arg.fileIds, hard_delete: arg.hardDelete },
      { requestId },
    );
    const result: BulkResponse = data ?? {
      results: arg.fileIds.map((id) => ({ id, ok: true, error: null })),
      succeeded: arg.fileIds.length,
      failed: 0,
    };

    // Roll back any items the backend reports as failed.
    for (const r of result.results) {
      if (r.ok) continue;
      const snap = snapshots.get(r.id);
      if (snap) dispatch(upsertFile(snap));
    }
    return result;
  } catch (err) {
    // Whole-call failure — restore everything we removed.
    for (const snap of snapshots.values()) dispatch(upsertFile(snap));
    throw err;
  } finally {
    releaseRequest(requestId);
  }
});

/**
 * Move many files to a new parent folder in one round-trip. Pass `null` to
 * move to root.
 */
export const bulkMoveFiles = createAsyncThunk<
  BulkResponse,
  BulkMoveFilesArg,
  ThunkApi
>("cloudFiles/bulkMoveFiles", async (arg, { dispatch, getState }) => {
  if (arg.fileIds.length === 0) {
    return { results: [], succeeded: 0, failed: 0 };
  }

  const state = getState();
  const snapshots = new Map<string, CloudFile>();
  for (const id of arg.fileIds) {
    const file = state.cloudFiles.filesById[id];
    if (file) snapshots.set(id, file);
  }

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "bulk-move-files",
    resourceId: null,
    resourceType: "file",
  });

  // Optimistic: re-parent + retract from old parent / attach to new in tree.
  for (const [id, file] of snapshots) {
    if (file.parentFolderId === arg.newParentFolderId) continue;
    dispatch(
      detachChildFromFolder({
        parentFolderId: file.parentFolderId,
        kind: "file",
        id,
      }),
    );
    dispatch(
      attachChildToFolder({
        parentFolderId: arg.newParentFolderId,
        kind: "file",
        id,
      }),
    );
    dispatch(upsertFile({ ...file, parentFolderId: arg.newParentFolderId }));
  }

  try {
    const { data } = await Files.bulkMoveFiles(
      {
        file_ids: arg.fileIds,
        new_parent_folder_id: arg.newParentFolderId,
      },
      { requestId },
    );

    // Roll back per-item failures.
    for (const r of data.results) {
      if (r.ok) continue;
      const snap = snapshots.get(r.id);
      if (!snap || snap.parentFolderId === arg.newParentFolderId) continue;
      dispatch(
        detachChildFromFolder({
          parentFolderId: arg.newParentFolderId,
          kind: "file",
          id: snap.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: snap.parentFolderId,
          kind: "file",
          id: snap.id,
        }),
      );
      dispatch(upsertFile(snap));
    }
    return data;
  } catch (err) {
    // Whole-call failure — restore everything.
    for (const snap of snapshots.values()) {
      if (snap.parentFolderId === arg.newParentFolderId) continue;
      dispatch(
        detachChildFromFolder({
          parentFolderId: arg.newParentFolderId,
          kind: "file",
          id: snap.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: snap.parentFolderId,
          kind: "file",
          id: snap.id,
        }),
      );
      dispatch(upsertFile(snap));
    }
    throw err;
  } finally {
    releaseRequest(requestId);
  }
});

/**
 * Move many folders to a new parent in one round-trip. Pass `null` to move
 * to root. The backend cascades `folder_path` updates to descendants.
 */
export const bulkMoveFolders = createAsyncThunk<
  BulkResponse,
  BulkMoveFoldersArg,
  ThunkApi
>("cloudFiles/bulkMoveFolders", async (arg, { dispatch, getState }) => {
  if (arg.folderIds.length === 0) {
    return { results: [], succeeded: 0, failed: 0 };
  }

  const state = getState();
  const snapshots = new Map<string, CloudFolder>();
  for (const id of arg.folderIds) {
    const folder = state.cloudFiles.foldersById[id];
    if (folder) snapshots.set(id, folder);
  }

  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "bulk-move-folders",
    resourceId: null,
    resourceType: "folder",
  });

  // Optimistic: rewire each folder under the new parent.
  for (const [id, folder] of snapshots) {
    if (folder.parentId === arg.newParentId) continue;
    dispatch(
      detachChildFromFolder({
        parentFolderId: folder.parentId,
        kind: "folder",
        id,
      }),
    );
    dispatch(
      attachChildToFolder({
        parentFolderId: arg.newParentId,
        kind: "folder",
        id,
      }),
    );
    dispatch(upsertFolder({ ...folder, parentId: arg.newParentId }));
  }

  try {
    const { data } = await Folders.bulkMoveFolders(
      { folder_ids: arg.folderIds, new_parent_id: arg.newParentId },
      { requestId },
    );

    // Roll back per-item failures.
    for (const r of data.results) {
      if (r.ok) continue;
      const snap = snapshots.get(r.id);
      if (!snap || snap.parentId === arg.newParentId) continue;
      dispatch(
        detachChildFromFolder({
          parentFolderId: arg.newParentId,
          kind: "folder",
          id: snap.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: snap.parentId,
          kind: "folder",
          id: snap.id,
        }),
      );
      dispatch(upsertFolder(snap));
    }
    return data;
  } catch (err) {
    for (const snap of snapshots.values()) {
      if (snap.parentId === arg.newParentId) continue;
      dispatch(
        detachChildFromFolder({
          parentFolderId: arg.newParentId,
          kind: "folder",
          id: snap.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: snap.parentId,
          kind: "folder",
          id: snap.id,
        }),
      );
      dispatch(upsertFolder(snap));
    }
    throw err;
  } finally {
    releaseRequest(requestId);
  }
});

// ---------------------------------------------------------------------------
// Guest → user migration
// ---------------------------------------------------------------------------

/**
 * Claim every file/folder owned by a guest fingerprint for the currently
 * authenticated user. Call this once on first sign-in/sign-up after a guest
 * session — the request is authed as the new user and carries the OLD
 * fingerprint via header + body.
 *
 * After the call returns, the caller should re-load the user file tree
 * (`loadUserFileTree({ userId })`) so the previously-guest-owned items
 * appear in the user's tree.
 */
export const migrateGuestToUser = createAsyncThunk<
  MigrateGuestToUserResponse,
  MigrateGuestToUserArg,
  ThunkApi
>("cloudFiles/migrateGuestToUser", async (arg) => {
  if (!arg.guestFingerprint) {
    throw new Error("guestFingerprint is required");
  }
  if (!arg.newUserId) {
    throw new Error("newUserId is required");
  }
  const requestId = newRequestId();
  registerRequest({
    requestId,
    kind: "migrate-guest",
    resourceId: null,
    resourceType: null,
  });

  try {
    // Body carries the AUTHED user's id (server cross-checks against the
    // JWT subject). Fingerprint goes in the X-Guest-Fingerprint header
    // — it's the server-bound proof of guest identity.
    const { data } = await Files.migrateGuestToUser(
      {
        new_user_id: arg.newUserId,
        guest_id: arg.guestId,
      },
      { requestId, guestFingerprint: arg.guestFingerprint },
    );
    return data;
  } finally {
    releaseRequest(requestId);
  }
});
