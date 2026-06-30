/**
 * features/files/redux/virtual-thunks.ts
 *
 * Thunks for the virtual-source side of cloud-files. Three groups:
 *
 *   1. **Bootstrap** — `attachVirtualRoots` mounts one synthetic root folder
 *      per registered adapter when `/files` first renders.
 *
 *   2. **Hydration** — `loadVirtualChildren({ adapterId, parentVirtualId })`
 *      lazy-loads an adapter folder's children on first expand. Adapter
 *      `list()` runs, results convert to `Partial<CloudFile>` /
 *      `Partial<CloudFolder>` with synthetic ids and `source.kind = "virtual"`,
 *      then dispatch through the same `upsertFiles` / `upsertFolders` /
 *      `attachChildToFolder` reducers as real records.
 *
 *   3. **Source-aware mutations** — `renameAny`, `moveAny`, `deleteAny`,
 *      `writeAny`, `readAny`. Each branches on the record's `source.kind`:
 *      real → existing thunks; virtual → adapter dispatch via `getVirtualSource`.
 *
 * Existing components (`FileTreeRow`, `FileTable`, `FilePreview`, …) read
 * from `filesById` / `foldersById` and don't care about origin. The branching
 * is contained to this file and the adapter calls inside it.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch } from "@/lib/redux/store";
import type { CloudFilesState } from "@/features/files/types";
import { supabase } from "@/utils/supabase/client";

type StateWithCloudFiles = {
  cloudFiles: CloudFilesState;
  userAuth?: { id?: string | null };
};
import {
  getVirtualSource,
  listVirtualSources,
} from "@/features/files/virtual-sources/registry";
import {
  isSyntheticId,
  makeRootSyntheticId,
  makeSyntheticId,
  parseSyntheticId,
  VIRTUAL_ROOT_VID,
} from "@/features/files/virtual-sources/path";
import type {
  VirtualNode,
  VirtualSourceAdapter,
} from "@/features/files/virtual-sources/types";
import type {
  CloudFile,
  CloudFolder,
} from "@/features/files/types";
import {
  attachChildToFolder,
  attachVirtualRoot,
  detachChildFromFolder,
  markFolderFullyLoaded,
  removeFile,
  removeFolder,
  upsertFile,
  upsertFiles,
  upsertFolder,
  upsertFolders,
} from "./slice";
import {
  deleteFile as deleteFileThunk,
  deleteFolder as deleteFolderThunk,
  moveFile as moveFileThunk,
  renameFile as renameFileThunk,
  updateFolder as updateFolderThunk,
  uploadFiles as uploadFilesThunk,
} from "./thunks";

type ThunkApi = { dispatch: AppDispatch; state: StateWithCloudFiles };

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Mount a synthetic root folder for every registered adapter. Idempotent —
 * safe to call multiple times. Fired once on `/files` mount.
 */
export const attachVirtualRoots = createAsyncThunk<void, void, ThunkApi>(
  "cloudFiles/attachVirtualRoots",
  async (_arg, { dispatch }) => {
    for (const adapter of listVirtualSources()) {
      dispatch(
        attachVirtualRoot({
          adapterId: adapter.sourceId,
          rootId: makeRootSyntheticId(adapter.sourceId),
          label: adapter.label,
        }),
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

interface LoadVirtualChildrenArg {
  adapterId: string;
  /** null when listing the adapter's root. */
  parentVirtualId: string | null;
}

/**
 * Convert a `VirtualNode` to a `Partial<CloudFile>` / `Partial<CloudFolder>`
 * — synthetic id, `source.kind: "virtual"`, fields from the node mapped onto
 * the cloud-files domain shape.
 */
function nodeToFilePartial(
  adapterId: string,
  parentSyntheticId: string,
  node: VirtualNode,
): Partial<CloudFile> {
  return {
    id: makeSyntheticId(adapterId, node.id),
    fileName: node.name,
    filePath: node.name, // used only for display; virtual paths aren't S3 keys
    storageUri: "",
    mimeType: node.mimeType ?? null,
    fileSize: node.size ?? null,
    parentFolderId: parentSyntheticId,
    visibility: "private",
    currentVersion: 1,
    metadata: node.metadata ?? {},
    createdAt: "",
    updatedAt: node.updatedAt ?? "",
    deletedAt: null,
    source: {
      kind: "virtual",
      adapterId,
      virtualId: node.id,
    },
  };
}

function nodeToFolderPartial(
  adapterId: string,
  parentSyntheticId: string,
  node: VirtualNode,
): Partial<CloudFolder> {
  return {
    id: makeSyntheticId(adapterId, node.id),
    folderName: node.name,
    folderPath: node.name,
    parentId: parentSyntheticId,
    visibility: "private",
    metadata: node.metadata ?? {},
    createdAt: "",
    updatedAt: node.updatedAt ?? "",
    deletedAt: null,
    source: {
      kind: "virtual",
      adapterId,
      virtualId: node.id,
    },
  };
}

export const loadVirtualChildren = createAsyncThunk<
  void,
  LoadVirtualChildrenArg,
  ThunkApi
>("cloudFiles/loadVirtualChildren", async (arg, { dispatch, getState }) => {
  const adapter = getVirtualSource(arg.adapterId);
  if (!adapter) return;
  const userId = getState().userAuth?.id ?? "";
  const parentVid =
    arg.parentVirtualId === null || arg.parentVirtualId === VIRTUAL_ROOT_VID
      ? null
      : arg.parentVirtualId;
  const parentSyntheticId = makeSyntheticId(
    arg.adapterId,
    arg.parentVirtualId ?? VIRTUAL_ROOT_VID,
  );

  const nodes = await adapter.list(supabase, userId, { parentId: parentVid });

  const files: Partial<CloudFile>[] = [];
  const folders: Partial<CloudFolder>[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") {
      folders.push(nodeToFolderPartial(arg.adapterId, parentSyntheticId, node));
    } else {
      files.push(nodeToFilePartial(arg.adapterId, parentSyntheticId, node));
    }
  }

  if (files.length > 0) dispatch(upsertFiles(files));
  if (folders.length > 0) dispatch(upsertFolders(folders));

  for (const folder of folders) {
    dispatch(
      attachChildToFolder({
        parentFolderId: parentSyntheticId,
        kind: "folder",
        id: folder.id!,
      }),
    );
  }
  for (const file of files) {
    dispatch(
      attachChildToFolder({
        parentFolderId: parentSyntheticId,
        kind: "file",
        id: file.id!,
      }),
    );
  }

  dispatch(markFolderFullyLoaded({ folderId: parentSyntheticId }));
});

// ---------------------------------------------------------------------------
// Source-aware mutation router
// ---------------------------------------------------------------------------

/** Look up the adapter + virtual id for a synthetic id. Throws when not virtual. */
function resolveVirtual(syntheticId: string): {
  adapter: VirtualSourceAdapter;
  virtualId: string;
  fieldId?: string;
} {
  const parsed = parseSyntheticId(syntheticId);
  if (!parsed) {
    throw new Error(`Not a virtual id: ${syntheticId}`);
  }
  const adapter = getVirtualSource(parsed.sourceId);
  if (!adapter) {
    throw new Error(`Unknown virtual source: ${parsed.sourceId}`);
  }
  return {
    adapter,
    virtualId: parsed.virtualId,
    fieldId: parsed.fieldId,
  };
}

interface RenameAnyArg {
  id: string;
  newName: string;
}

export const renameAny = createAsyncThunk<void, RenameAnyArg, ThunkApi>(
  "cloudFiles/renameAny",
  async ({ id, newName }, { dispatch, getState }) => {
    if (!isSyntheticId(id)) {
      // Real cloud-file → existing thunk owns rename semantics.
      await dispatch(renameFileThunk({ fileId: id, newName })).unwrap();
      return;
    }
    const { adapter, virtualId } = resolveVirtual(id);
    const userId = getState().userAuth?.id ?? "";
    const result = await adapter.rename(supabase, userId, {
      id: virtualId,
      newName,
    });
    // Reflect locally — the row in `filesById` is keyed by synthetic id, so
    // we patch `fileName` (or `folderName` for folders) and `updatedAt`.
    const state = getState().cloudFiles;
    if (state.filesById[id]) {
      dispatch(upsertFile({ id, fileName: newName, updatedAt: result.updatedAt }));
    } else if (state.foldersById[id]) {
      dispatch(
        upsertFolder({ id, folderName: newName, updatedAt: result.updatedAt }),
      );
    }
  },
);

interface MoveAnyArg {
  id: string;
  newParentId: string | null;
}

export const moveAny = createAsyncThunk<void, MoveAnyArg, ThunkApi>(
  "cloudFiles/moveAny",
  async ({ id, newParentId }, { dispatch, getState }) => {
    if (!isSyntheticId(id)) {
      await dispatch(
        moveFileThunk({ fileId: id, newParentFolderId: newParentId }),
      ).unwrap();
      return;
    }
    const { adapter, virtualId } = resolveVirtual(id);
    if (!adapter.move) {
      throw new Error(`Adapter ${adapter.sourceId} does not support move`);
    }
    const userId = getState().userAuth?.id ?? "";
    const newParentVirtualId =
      newParentId && isSyntheticId(newParentId)
        ? (parseSyntheticId(newParentId)?.virtualId ?? null)
        : null;
    const result = await adapter.move(supabase, userId, {
      id: virtualId,
      newParentId: newParentVirtualId,
    });
    // Tree relinking: detach from old parent, attach under new.
    const state = getState().cloudFiles;
    const fileRecord = state.filesById[id];
    const folderRecord = state.foldersById[id];
    const record = fileRecord ?? folderRecord;
    if (!record) return;
    const kind = fileRecord ? "file" : "folder";
    const oldParent = fileRecord
      ? fileRecord.parentFolderId
      : (folderRecord?.parentId ?? null);
    if (oldParent !== null && oldParent !== newParentId) {
      dispatch(detachChildFromFolder({ parentFolderId: oldParent, kind, id }));
    }
    dispatch(
      attachChildToFolder({
        parentFolderId: newParentId,
        kind,
        id,
      }),
    );
    if (kind === "file") {
      dispatch(
        upsertFile({
          id,
          parentFolderId: newParentId,
          updatedAt: result.updatedAt,
        }),
      );
    } else {
      dispatch(
        upsertFolder({
          id,
          parentId: newParentId,
          updatedAt: result.updatedAt,
        }),
      );
    }
  },
);

interface DeleteAnyArg {
  id: string;
  hard?: boolean;
}

export const deleteAny = createAsyncThunk<void, DeleteAnyArg, ThunkApi>(
  "cloudFiles/deleteAny",
  async ({ id, hard }, { dispatch, getState }) => {
    if (!isSyntheticId(id)) {
      // Real records: default branch on file vs folder.
      const state = getState().cloudFiles;
      if (state.filesById[id]) {
        await dispatch(
          deleteFileThunk({ fileId: id, hardDelete: hard ?? false }),
        ).unwrap();
      } else if (state.foldersById[id]) {
        await dispatch(deleteFolderThunk({ folderId: id })).unwrap();
      }
      return;
    }
    const { adapter, virtualId } = resolveVirtual(id);
    const userId = getState().userAuth?.id ?? "";
    await adapter.delete(supabase, userId, virtualId, hard ?? false);
    const state = getState().cloudFiles;
    const fileRecord = state.filesById[id];
    const folderRecord = state.foldersById[id];
    const record = fileRecord ?? folderRecord;
    if (!record) return;
    const kind = fileRecord ? "file" : "folder";
    const parent = fileRecord
      ? fileRecord.parentFolderId
      : (folderRecord?.parentId ?? null);
    if (parent !== null) {
      dispatch(detachChildFromFolder({ parentFolderId: parent, kind, id }));
    }
    if (kind === "file") dispatch(removeFile({ id }));
    else dispatch(removeFolder({ id }));
  },
);

interface WriteAnyArg {
  id: string;
  content: string;
  expectedUpdatedAt?: string;
}

/**
 * Write content to a file. For real cloud-files this re-uploads as a new
 * version; for virtual files it dispatches to the adapter's `write()` which
 * updates the underlying Postgres column.
 */
export const writeAny = createAsyncThunk<void, WriteAnyArg, ThunkApi>(
  "cloudFiles/writeAny",
  async ({ id, content, expectedUpdatedAt }, { dispatch, getState }) => {
    if (!isSyntheticId(id)) {
      // Real cloud-file edit-in-place uses uploadFiles to create a new
      // version. Mirrors the existing CloudFileEditor save flow.
      const state = getState().cloudFiles;
      const record = state.filesById[id];
      if (!record) throw new Error(`File not found: ${id}`);
      const reUploaded = new File(
        [new Blob([content], { type: record.mimeType ?? "text/plain" })],
        record.fileName,
        { type: record.mimeType ?? "text/plain" },
      );
      await dispatch(
        uploadFilesThunk({
          files: [reUploaded],
          parentFolderId: record.parentFolderId,
          visibility: record.visibility,
          changeSummary: "Edited in place",
        }),
      ).unwrap();
      return;
    }
    const { adapter, virtualId, fieldId } = resolveVirtual(id);
    const userId = getState().userAuth?.id ?? "";
    const result = await adapter.write(supabase, userId, {
      id: virtualId,
      fieldId,
      content,
      expectedUpdatedAt,
    });
    dispatch(upsertFile({ id, updatedAt: result.updatedAt }));
  },
);

/**
 * Read content for any file. Returns the text content and language for use in
 * editors/previewers. Real files go through the cloud-files signed-URL +
 * blob-fetch path; virtual files dispatch to adapter.read().
 */
export const readAny = createAsyncThunk<
  { content: string; language: string; mimeType: string; name: string },
  { id: string },
  ThunkApi
>("cloudFiles/readAny", async ({ id }, { getState }) => {
  if (!isSyntheticId(id)) {
    // Real files don't go through this thunk — callers use `useFileBlob`
    // directly. We expose a stub for completeness so the API is symmetrical.
    throw new Error(
      "readAny is for virtual files; use useFileBlob for real cloud-files",
    );
  }
  const { adapter, virtualId, fieldId } = resolveVirtual(id);
  const userId = getState().userAuth?.id ?? "";
  const content = await adapter.read(supabase, userId, virtualId, fieldId);
  return {
    content: content.content,
    language: content.language,
    mimeType: content.mimeType,
    name: content.name,
  };
});

