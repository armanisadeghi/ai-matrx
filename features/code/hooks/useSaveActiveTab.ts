"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { codeFilesActions } from "@/features/code-files/redux/slice";
import { saveFileNow } from "@/features/code-files/redux/thunks";
import { selectCodeFileById } from "@/features/code-files/redux/selectors";
import { createClient } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";
import {
  markTabSaved,
  selectActiveTab,
  selectTabById,
  setTabRemoteUpdatedAt,
} from "../redux/tabsSlice";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { codeFileIdFromTabId, isLibraryTabId } from "./useOpenLibraryFile";
import { getAdapterForTabId } from "../library-sources/registry";
import { isRemoteConflictError } from "../library-sources/types";
import { isCurrentFilesystemTab } from "../views/explorer/fileTreePaths";

export interface SaveResult {
  tabId: string;
  ok: boolean;
  error?: string;
  /** True when the save was rejected because the remote row had been
   *  updated since the tab was loaded. UI can use this to show a
   *  reload/overwrite choice instead of a generic error toast. */
  conflict?: boolean;
}

/**
 * Save the currently active editor tab. Routes by tab-id convention:
 *
 *   - `library:<codeFileId>` tabs    → `code_files` via `saveFileNow` thunk
 *   - everything else                 → the active filesystem adapter's
 *                                       `writeFile` (sandbox / mock)
 *
 * Both branches update the tab slice's dirty flag via `markTabSaved` on
 * success so the editor UI reflects reality without the caller having to.
 *
 * Returns a structured `SaveResult` (never throws) so keyboard shortcut
 * handlers and UI buttons can treat errors uniformly.
 */
export function useSaveActiveTab() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { filesystem } = useCodeWorkspace();

  return useCallback(
    async (
      tabIdOverride?: string,
      options?: { force?: boolean },
    ): Promise<SaveResult | null> => {
      const state = store.getState();
      const tab = tabIdOverride
        ? selectTabById(tabIdOverride)(state)
        : selectActiveTab(state);
      if (!tab) return null;
      if (!tab.dirty) return { tabId: tab.id, ok: true };
      const force = options?.force === true;

      // Branch 1: library tab → route to code-files thunk.
      if (isLibraryTabId(tab.id)) {
        const codeFileId = codeFileIdFromTabId(tab.id);
        if (!codeFileId) {
          return { tabId: tab.id, ok: false, error: "Invalid library tab id" };
        }
        const existing = selectCodeFileById(state, codeFileId);
        if (!existing) {
          return { tabId: tab.id, ok: false, error: "Code file not in store" };
        }
        // Sync the tab's current buffer into the code-files slice so
        // saveFileNow has the latest content and records dirty status.
        if (existing.content !== tab.content) {
          dispatch(
            codeFilesActions.setLocalContent({
              id: codeFileId,
              content: tab.content,
            }),
          );
        } else if (!existing._dirty) {
          // Content matches but the slice thinks it's clean — mark dirty
          // so saveFileNow doesn't early-return on `!rec._dirty`.
          dispatch(
            codeFilesActions.setLocalContent({
              id: codeFileId,
              content: tab.content,
            }),
          );
        }
        try {
          await dispatch(saveFileNow({ id: codeFileId })).unwrap();
          dispatch(markTabSaved({ id: tab.id, savedContent: tab.content }));
          return { tabId: tab.id, ok: true };
        } catch (err) {
          const message = extractErrorMessage(err);
          return { tabId: tab.id, ok: false, error: message };
        }
      }

      // Branch 2: library-source tab (prompt_apps, aga_apps, tool_ui_components, …)
      // → route to the registered adapter. Single source of truth: the
      // adapter writes straight back to the original row + column, with
      // an optimistic `updated_at` guard against remote overwrites.
      const sourceAdapter = getAdapterForTabId(tab.id);
      if (sourceAdapter) {
        const parsed = sourceAdapter.parseTabId(tab.id);
        if (!parsed) {
          return {
            tabId: tab.id,
            ok: false,
            error: `Malformed ${sourceAdapter.sourceId} tab id`,
          };
        }
        try {
          const supabase = createClient();
          const result = await sourceAdapter.save(supabase, {
            rowId: parsed.rowId,
            fieldId: parsed.fieldId,
            content: tab.content,
            // When `force` is set we deliberately skip the optimistic
            // concurrency guard so the user can intentionally overwrite
            // a remote-updated row.
            expectedUpdatedAt: force ? undefined : tab.remoteUpdatedAt,
          });
          dispatch(markTabSaved({ id: tab.id, savedContent: tab.content }));
          dispatch(
            setTabRemoteUpdatedAt({
              id: tab.id,
              remoteUpdatedAt: result.updatedAt,
            }),
          );
          return { tabId: tab.id, ok: true };
        } catch (err) {
          if (isRemoteConflictError(err)) {
            return {
              tabId: tab.id,
              ok: false,
              conflict: true,
              error:
                "This row was modified somewhere else after you opened it. Reload the tab to pick up the remote changes before saving.",
            };
          }
          const message = extractErrorMessage(err);
          return { tabId: tab.id, ok: false, error: message };
        }
      }

      // Branch 3: filesystem-adapter tab → writeFile to the adapter.
      if (!isCurrentFilesystemTab(tab, filesystem.id)) {
        return {
          tabId: tab.id,
          ok: false,
          error: "This file belongs to a different sandbox. Reconnect that sandbox before saving it.",
        };
      }
      if (filesystem.id.startsWith("mock")) {
        return {
          tabId: tab.id,
          ok: false,
          error: "This is a temporary mock workspace and cannot save files.",
        };
      }
      if (!filesystem.writable || !filesystem.writeFile) {
        return {
          tabId: tab.id,
          ok: false,
          error: `Filesystem "${filesystem.label}" is read-only`,
        };
      }
      try {
        await filesystem.writeFile(tab.path, tab.content);
        dispatch(markTabSaved({ id: tab.id, savedContent: tab.content }));
        return { tabId: tab.id, ok: true };
      } catch (err) {
        const message = extractErrorMessage(err);
        return { tabId: tab.id, ok: false, error: message };
      }
    },
    [dispatch, filesystem, store],
  );
}
