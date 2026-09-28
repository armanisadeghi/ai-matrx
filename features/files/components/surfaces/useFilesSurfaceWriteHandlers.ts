/**
 * features/files/components/surfaces/useFilesSurfaceWriteHandlers.ts
 *
 * Write handlers for the `matrx-user/files` surface — the write half of the
 * manifest (`features/surfaces/manifests/files.manifest.ts`). PageShell mounts
 * the `SurfaceRuntimeProvider` and hands the builder returned here straight to
 * `getWriteHandlers`; nothing else calls these functions. Every call arrives
 * through `applySurfaceWrite` (`features/surfaces/runtime/surface-writeback.ts`),
 * which wraps throws in a safe envelope the agent reads back verbatim.
 *
 * THE RULE THIS FILE OBEYS: a handler drives the SAME write path the user's own
 * control drives — never a parallel one.
 *
 *   search / chips / kind / sort / view  → the same slice actions the search
 *       box, FilterChips, KindFilter, ColumnHeader and ViewModeToggle dispatch.
 *   folder / file activation             → PageShell's own `handleSelectFolder`
 *       / `handleSelectFile`, passed in, so URL sync + lazy hydration happen
 *       exactly as they do on a click.
 *   rename                               → `validateRenameInput` + the thunk
 *       RenameDialog dispatches (`renameFile` for files, `updateFolder` for
 *       folders). Same validator, same sibling-collision check, same thunk.
 *
 * Enum vocabularies are validated against the RUNTIME lists the controls
 * render from (`CHIP_FILTER_KEYS`, `KIND_FILTER_VALUES`, `VIEW_MODE_VALUES`,
 * `COLUMN_SPECS`) — never re-typed literals — so an agent can only ever reach a
 * state the user can reverse with one control that is already on screen.
 */

"use client";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  setActiveFileId,
  setActiveFolderId,
  setChipFilter,
  setKindFilter,
  setSearchQuery,
  setSort,
  setViewMode,
} from "@/features/files/redux/slice";
import {
  renameFile as renameFileThunk,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import {
  selectActiveFileId,
  selectActiveFolderId,
  selectActiveUploads,
  selectAllFilesMap,
  selectAllFoldersMap,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import type { ChipFilter, KindFilter, SortBy, SortDirection, ViewMode } from "@/features/files/types";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import {
  splitNameAndExtension,
  validateRenameInput,
} from "@/features/files/components/core/RenameDialog/RenameDialog";
import { CHIP_FILTER_KEYS } from "./desktop/FilterChips";
import { KIND_FILTER_VALUES } from "./desktop/KindFilter";
import { VIEW_MODE_VALUES } from "./desktop/ViewModeToggle";
import { COLUMN_SPECS } from "./desktop/columns";

/**
 * Sort keys the file table's own column headers can actually produce, read off
 * `COLUMN_SPECS` (the specs that render the headers). Columns with
 * `sortKey: null` are not sortable by click and are not offered to agents.
 */
const SORTABLE_KEYS: ReadonlyArray<SortBy> = Object.values(COLUMN_SPECS)
  .map((spec) => spec.sortKey)
  .filter((key): key is SortBy => key !== null);

const SORT_DIRECTIONS: ReadonlyArray<SortDirection> = ["asc", "desc"];

/** `null` / `""` both mean "clear" for the nullable id and chip targets. */
function asNullableString(value: unknown, target: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${target} expects a string, or null to clear.`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface FilesSurfaceWriteDeps {
  /** PageShell's own folder-activation path (URL sync + lazy hydration). */
  selectFolder: (folderId: string) => void;
  /** PageShell's own file-activation path (opens the preview pane). */
  selectFile: (fileId: string) => void;
}

export function useFilesSurfaceWriteHandlers({
  selectFolder,
  selectFile,
}: FilesSurfaceWriteDeps): () => SurfaceWriteHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  /**
   * Rename guard. The tree must be fully loaded before a rename, because the
   * sibling-collision half of `validateRenameInput` is only as good as the
   * rows in the store — renaming against a half-loaded tree can silently
   * create the duplicate name the dialog exists to prevent. An in-flight
   * upload can add a colliding sibling mid-run, so that blocks too. Both
   * refuse LOUDLY rather than writing anyway.
   */
  function assertRenameAllowed(target: string): void {
    const state = store.getState();
    const treeStatus = selectTreeStatus(state);
    if (treeStatus !== "loaded") {
      throw new Error(
        `${target} refused: the files tree is "${treeStatus}", not "loaded". ` +
          `Renaming against an incomplete listing can miss a name collision. ` +
          `Wait for the listing to finish and try again.`,
      );
    }
    if (selectActiveUploads(state).length > 0) {
      throw new Error(
        `${target} refused: an upload is in progress. A file landing mid-rename ` +
          `can collide with the new name. Wait for the upload to finish.`,
      );
    }
  }

  /** Sibling names in the same parent, excluding the resource itself — the
   * exact list RenameDialog builds for its collision check. */
  function siblingNamesFor(parentId: string | null, resourceId: string): string[] {
    const state = store.getState();
    const filesById = selectAllFilesMap(state);
    const foldersById = selectAllFoldersMap(state);
    const out: string[] = [];
    for (const f of Object.values(filesById)) {
      if (!f || f.id === resourceId || f.deletedAt) continue;
      if ((f.parentFolderId ?? null) === parentId) out.push(f.fileName);
    }
    for (const fo of Object.values(foldersById)) {
      if (!fo || fo.id === resourceId || fo.deletedAt) continue;
      if ((fo.parentId ?? null) === parentId) out.push(fo.folderName);
    }
    return out;
  }

  // Fresh closures per call — the `getWriteHandlers` contract. Every handler
  // reads live state from the store at apply time, never from a render-time
  // snapshot that may be stale by the time the user hits Apply.
  return () => ({
    // ── Rename (entity — persists through the canonical thunk) ────────────
    active_file_name: async (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("active_file_name expects a non-empty string.");
      }
      assertRenameAllowed("active_file_name");
      const state = store.getState();
      const fileId = selectActiveFileId(state);
      if (!fileId) {
        throw new Error(
          "active_file_name refused: no file is open in the preview pane. " +
            "Open the file first (active_file_id) and try again.",
        );
      }
      if (isSyntheticId(fileId)) {
        throw new Error(
          "active_file_name refused: this row is a virtual-source record, not a " +
            "cloud file. Rename it in the feature that owns it.",
        );
      }
      const file = selectAllFilesMap(state)[fileId];
      if (!file) {
        throw new Error(
          `active_file_name refused: file ${fileId} is not in the loaded listing.`,
        );
      }
      const [, originalExt] = splitNameAndExtension(file.fileName);
      const result = validateRenameInput(value, file.fileName, {
        kind: "file",
        originalExt,
        siblingNames: siblingNamesFor(file.parentFolderId ?? null, fileId),
      });
      if (result.ok === false) {
        throw new Error(`active_file_name rejected (${result.code}): ${result.error}`);
      }
      await dispatch(
        renameFileThunk({ fileId, newName: result.value }),
      ).unwrap();
    },

    active_folder_name: async (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("active_folder_name expects a non-empty string.");
      }
      assertRenameAllowed("active_folder_name");
      const state = store.getState();
      const folderId = selectActiveFolderId(state);
      if (!folderId) {
        throw new Error(
          "active_folder_name refused: the user is at the section root, so there " +
            "is no active folder to rename. Open a folder first (active_folder_id).",
        );
      }
      if (isSyntheticId(folderId)) {
        throw new Error(
          "active_folder_name refused: this is a virtual-source folder, not a " +
            "cloud folder. Rename it in the feature that owns it.",
        );
      }
      const folder = selectAllFoldersMap(state)[folderId];
      if (!folder) {
        throw new Error(
          `active_folder_name refused: folder ${folderId} is not in the loaded listing.`,
        );
      }
      const result = validateRenameInput(value, folder.folderName, {
        kind: "folder",
        siblingNames: siblingNamesFor(folder.parentId ?? null, folderId),
      });
      if (result.ok === false) {
        throw new Error(
          `active_folder_name rejected (${result.code}): ${result.error}`,
        );
      }
      await dispatch(
        updateFolderThunk({
          folderId,
          patch: { folderName: result.value },
        }),
      ).unwrap();
    },

    // ── List query and view (ui — ephemeral, client-only) ─────────────────
    search_query: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error(
          'search_query expects a string ("" clears the search box).',
        );
      }
      dispatch(setSearchQuery(value));
    },

    chip_filter: (value: unknown) => {
      const next = asNullableString(value, "chip_filter");
      if (next !== null && !CHIP_FILTER_KEYS.includes(next as ChipFilter)) {
        throw new Error(
          `chip_filter expects one of: ${CHIP_FILTER_KEYS.join(" | ")}, or null to clear.`,
        );
      }
      dispatch(setChipFilter(next as ChipFilter | null));
    },

    kind_filter: (value: unknown) => {
      if (
        typeof value !== "string" ||
        !KIND_FILTER_VALUES.includes(value as KindFilter)
      ) {
        throw new Error(
          `kind_filter expects one of: ${KIND_FILTER_VALUES.join(" | ")}.`,
        );
      }
      dispatch(setKindFilter(value as KindFilter));
    },

    list_sort: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          "list_sort expects an object { sort_by, sort_direction }.",
        );
      }
      const { sort_by: sortBy, sort_direction: sortDir } = value as {
        sort_by?: unknown;
        sort_direction?: unknown;
      };
      if (typeof sortBy !== "string" || !SORTABLE_KEYS.includes(sortBy as SortBy)) {
        throw new Error(
          `list_sort.sort_by expects one of: ${SORTABLE_KEYS.join(" | ")}.`,
        );
      }
      if (
        typeof sortDir !== "string" ||
        !SORT_DIRECTIONS.includes(sortDir as SortDirection)
      ) {
        throw new Error(
          `list_sort.sort_direction expects one of: ${SORT_DIRECTIONS.join(" | ")}.`,
        );
      }
      dispatch(
        setSort({
          sortBy: sortBy as SortBy,
          sortDir: sortDir as SortDirection,
        }),
      );
    },

    view_mode: (value: unknown) => {
      if (
        typeof value !== "string" ||
        !VIEW_MODE_VALUES.includes(value as ViewMode)
      ) {
        throw new Error(
          `view_mode expects one of: ${VIEW_MODE_VALUES.join(" | ")}.`,
        );
      }
      dispatch(setViewMode(value as ViewMode));
    },

    // ── Navigation (ui — moves the user, so it asks) ──────────────────────
    active_folder_id: (value: unknown) => {
      const folderId = asNullableString(value, "active_folder_id");
      if (folderId === null) {
        dispatch(setActiveFolderId(null));
        return;
      }
      const folder = selectAllFoldersMap(store.getState())[folderId];
      if (!folder) {
        throw new Error(
          `active_folder_id refused: no folder ${folderId} in the loaded listing. ` +
            "Pick an id from visible_folders, or pass null to return to the section root.",
        );
      }
      if (folder.deletedAt) {
        throw new Error(
          `active_folder_id refused: folder "${folder.folderName}" is deleted.`,
        );
      }
      selectFolder(folderId);
    },

    active_file_id: (value: unknown) => {
      const fileId = asNullableString(value, "active_file_id");
      if (fileId === null) {
        dispatch(setActiveFileId(null));
        return;
      }
      const file = selectAllFilesMap(store.getState())[fileId];
      if (!file) {
        throw new Error(
          `active_file_id refused: no file ${fileId} in the loaded listing. ` +
            "Pick an id from visible_files, or pass null to close the preview pane.",
        );
      }
      if (file.deletedAt) {
        throw new Error(
          `active_file_id refused: file "${file.fileName}" is deleted.`,
        );
      }
      selectFile(fileId);
    },
  });
}
