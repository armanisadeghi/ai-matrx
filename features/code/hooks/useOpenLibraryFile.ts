"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { loadCodeFileFull } from "@/features/code-files/redux/thunks";
import { selectCodeFileById } from "@/features/code-files/redux/selectors";
import { openTab, setActiveTab } from "../redux/tabsSlice";
import { languageFromFilename } from "../styles/file-icon";
import { recordUnavailable } from "@/lib/records/recordUnavailable";

/** Tab id prefix for files backed by the `code_files` table.
 *  Tabs with this prefix are routed to `saveFileNow` on save. */
export const LIBRARY_TAB_PREFIX = "library:";

export function libraryTabId(codeFileId: string): string {
  return `${LIBRARY_TAB_PREFIX}${codeFileId}`;
}

export function isLibraryTabId(id: string): boolean {
  return id.startsWith(LIBRARY_TAB_PREFIX);
}

export function codeFileIdFromTabId(id: string): string | null {
  if (!isLibraryTabId(id)) return null;
  return id.slice(LIBRARY_TAB_PREFIX.length);
}

/**
 * Open a `code_files` row as an editor tab. If the content hasn't been loaded
 * yet, hydrate it from the API (transparently pulling from S3 when offloaded).
 * If the tab already exists, just focus it.
 */
export function useOpenLibraryFile() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useCallback(
    async (codeFileId: string): Promise<void> => {
      const tabId = libraryTabId(codeFileId);

      // Short-circuit: tab already open → focus.
      const { codeTabs } = store.getState();
      if (codeTabs?.byId?.[tabId]) {
        dispatch(setActiveTab(tabId));
        return;
      }

      // Ensure full content is loaded (hydrates S3 files transparently).
      await dispatch(loadCodeFileFull({ id: codeFileId })).unwrap();
      const record = selectCodeFileById(store.getState(), codeFileId);
      if (!record) {
        throw recordUnavailable({
          entity: "code file",
          reason: "unknown",
          recordId: codeFileId,
          token: "code_file",
        });
      }

      const language =
        record.language && record.language !== "plaintext"
          ? record.language
          : languageFromFilename(record.name);

      dispatch(
        openTab({
          id: tabId,
          path: `library:/${record.name}`,
          name: record.name,
          language,
          content: record.content ?? "",
          pristineContent: record.content ?? "",
        }),
      );
    },
    [dispatch, store],
  );
}
