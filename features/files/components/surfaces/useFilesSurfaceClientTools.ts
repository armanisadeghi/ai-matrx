/**
 * features/files/components/surfaces/useFilesSurfaceClientTools.ts
 *
 * Client-tool handlers for the `matrx-user/files` surface — the ACTION half of
 * the manifest (`features/surfaces/manifests/files.manifest.ts`, `clientTools`).
 * Every call arrives through `executeSurfaceClientTool`
 * (`features/surfaces/runtime/surface-client-tools.ts`), which wraps throws in
 * a safe envelope the agent reads back verbatim and never lets one wedge the
 * tool loop.
 *
 * WHY THIS IS REGISTERED FROM FileTable / FileGrid AND NOT FROM PageShell'S
 * PROVIDER — this is the whole design, not a convenience:
 *
 *   The failure mode for a client tool is returning `ok` while the page does
 *   not visibly move. `files_reveal_row` moves the page by dispatching
 *   `setFocusedId`, which only produces a scroll if the row is actually
 *   RENDERED: FileTable/FileGrid's effect calls `ensureIndexVisible` to grow
 *   the infinite window, and FileTableRow/FileGridCell's `scrollIntoView`
 *   fires on `isFocused`. A row filtered out by the kind filter, a column
 *   filter, the search box or the section would set focus on nothing at all.
 *   Only FileTable/FileGrid hold the `buildRows` output — the exact rendered
 *   set — so only they can refuse that call instead of faking it. PageShell's
 *   `searchScopedFiles` / `searchScopedFolders` are the INPUT to `buildRows`,
 *   not its result, so registering there would reintroduce the silent no-op.
 *
 *   The two components are mutually exclusive (`viewMode === "grid" ? FileGrid
 *   : FileTable` in PageShell), so exactly one is registered at any moment.
 *   The mobile `MobileStack` and `PickerShell` render neither, so on those
 *   mounts these tools stay declared-but-unwired and
 *   `listLiveSurfaceClientTools()` correctly does not offer them — the same
 *   desktop-only posture the manifest's readiness note already records for the
 *   write half.
 *
 * THE RULE THIS FILE OBEYS (inherited from `useFilesSurfaceWriteHandlers`): a
 * handler drives the SAME path the user's own control drives, never a parallel
 * one.
 *
 *   files_reveal_row           → `setFocusedId`, the action FileTable/FileGrid
 *       already dispatch on a row click and PageShell dispatches to reveal a
 *       just-uploaded file.
 *   files_clear_column_filters → `clearColumnFilters`, the action behind the
 *       "Clear all" pill in `ActiveColumnFilters` — its only other caller.
 *
 * NEITHER TOOL TOUCHES A FILE. No create, move, rename, delete, upload or
 * download; no checkbox selection (that arms `BulkActionsBar`, and pointing at
 * a row must never pre-build a bulk mistake); no preview-pane change. Rows are
 * addressed by durable UUIDs only — never a URL, per the surface's FILE
 * DOCTRINE.
 */

"use client";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { SurfaceClientToolHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useSurfaceClientTools } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { clearColumnFilters, setFocusedId } from "@/features/files/redux/slice";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectColumnFilters,
  selectHasActiveColumnFilters,
} from "@/features/files/redux/selectors";
import type { ColumnFilters } from "@/features/files/types";
import type { RowItem } from "./desktop/row-data";

export const FILES_SURFACE_NAME = "matrx-user/files";

/**
 * The column filters that are away from their neutral default, by column id.
 * `selectHasActiveColumnFilters` stays the canonical GATE (it is what decides
 * whether the tool refuses); this list only names them back to the agent so it
 * can tell the user what it cleared.
 */
function activeColumnFilterKeys(cf: ColumnFilters): string[] {
  const keys: string[] = [];
  if (cf.name.length > 0) keys.push("name");
  if (cf.type.length > 0) keys.push("type");
  if (cf.extension.length > 0) keys.push("extension");
  if (cf.mime.length > 0) keys.push("mime");
  if (cf.path.length > 0) keys.push("path");
  if (cf.owner.length > 0) keys.push("owner");
  if (cf.modified !== "any") keys.push("modified");
  if (cf.created !== "any") keys.push("created");
  if (cf.size !== "any") keys.push("size");
  if (cf.access !== "any") keys.push("access");
  if (cf.rag.length > 0) keys.push("rag");
  return keys;
}

function rowId(row: RowItem): string {
  return row.kind === "file" ? row.file.id : row.folder.id;
}

function rowName(row: RowItem): string {
  return row.kind === "file" ? row.file.fileName : row.folder.folderName;
}

export interface FilesSurfaceClientToolDeps {
  /**
   * The rows the calling component is CURRENTLY RENDERING — the `buildRows`
   * result, after section / search / chip / kind / column filtering and
   * sorting. Reveal refuses anything not in here.
   */
  rows: RowItem[];
  /** Which shell is registering, for the message the agent reads back. */
  viewLabel: "list" | "grid";
}

/**
 * Register the `matrx-user/files` client tools from whichever row shell is
 * mounted. Call once from FileTable and once from FileGrid; they never mount
 * together.
 */
export function useFilesSurfaceClientTools({
  rows,
  viewLabel,
}: FilesSurfaceClientToolDeps): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // Inline literal is fine — `useSurfaceClientTools` holds the object in a ref
  // and always calls the LATEST closure, so `rows` is never a stale snapshot.
  const handlers: SurfaceClientToolHandlers = {
    files_reveal_row: (input: unknown) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new Error(
          'files_reveal_row expects an object { "row_id": "<uuid>" }.',
        );
      }
      const { row_id: rawId } = input as { row_id?: unknown };
      if (typeof rawId !== "string" || !rawId.trim()) {
        throw new Error(
          "files_reveal_row.row_id expects a non-empty UUID string taken from " +
            "visible_files or visible_folders.",
        );
      }
      const id = rawId.trim();

      const index = rows.findIndex((row) => rowId(row) === id);
      if (index === -1) {
        // Distinguish "exists but is not on screen" from "not loaded at all" —
        // the agent's next move is different for each, and a generic failure
        // would send it guessing.
        const state = store.getState();
        const known =
          selectAllFilesMap(state)[id] ?? selectAllFoldersMap(state)[id];
        if (known) {
          throw new Error(
            `files_reveal_row refused: row ${id} exists but the ${viewLabel} is ` +
              `not currently showing it — it is in another folder or section, or ` +
              `the search box, filter chip, kind filter or a column filter is ` +
              `hiding it. Clear what is hiding it (files_clear_column_filters, ` +
              `or the search_query / chip_filter / kind_filter write targets) or ` +
              `navigate with the active_folder_id write target, then reveal it.`,
          );
        }
        throw new Error(
          `files_reveal_row refused: no row ${id} in the loaded listing. Pick an ` +
            `id from visible_files or visible_folders.`,
        );
      }

      const row = rows[index];
      // The one dispatch. FileTable/FileGrid's ensureIndexVisible effect grows
      // the window if this index is past the cap, then the row's own
      // scrollIntoView fires on isFocused.
      dispatch(setFocusedId(id));

      return {
        revealed: true,
        row_id: id,
        kind: row.kind,
        name: rowName(row),
        // 1-based, so "row 3 of 47" reads correctly when relayed to the user.
        position: index + 1,
        rows_in_view: rows.length,
        view: viewLabel,
      };
    },

    files_clear_column_filters: () => {
      const state = store.getState();
      if (!selectHasActiveColumnFilters(state)) {
        throw new Error(
          "files_clear_column_filters refused: no column filter is active, so " +
            "there is nothing to clear. If the user still cannot find what they " +
            "expect, check search_query, chip_filter and kind_filter — those are " +
            "separate controls with their own write targets.",
        );
      }
      const cleared = activeColumnFilterKeys(selectColumnFilters(state));
      dispatch(clearColumnFilters());
      return { cleared, cleared_count: cleared.length };
    },
  };

  useSurfaceClientTools(FILES_SURFACE_NAME, handlers);
}
