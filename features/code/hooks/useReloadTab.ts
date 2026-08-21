"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import { replaceTabContent, selectTabById } from "../redux/tabsSlice";
import { getAdapterForTabId } from "../library-sources/registry";
import { extractErrorMessage } from "@/utils/errors";

export interface ReloadResult {
  tabId: string;
  ok: boolean;
  error?: string;
  /** The previous local buffer (so the UI can offer to copy it to the
   *  clipboard before discarding). Only set when the reload succeeded. */
  previousContent?: string;
}

/**
 * Reload a library-source-backed tab from its underlying Supabase row.
 * Replaces the tab's buffer with the remote content and refreshes the
 * `remoteUpdatedAt` watermark so the next save will succeed.
 *
 * Returns the previous local buffer so the conflict-resolution toast can
 * copy it to the clipboard before discarding.
 */
export function useReloadTab() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useCallback(
    async (tabId: string): Promise<ReloadResult> => {
      const state = store.getState();
      const tab = selectTabById(tabId)(state);
      if (!tab) {
        // access-errors: ok — in-memory Redux tab lookup, no record read
        return { tabId, ok: false, error: "Tab not found" };
      }
      const adapter = getAdapterForTabId(tabId);
      if (!adapter) {
        return {
          tabId,
          ok: false,
          error: "Reload is only supported for library-source-backed tabs",
        };
      }
      const parsed = adapter.parseTabId(tabId);
      if (!parsed) {
        return {
          tabId,
          ok: false,
          error: `Malformed ${adapter.sourceId} tab id`,
        };
      }
      try {
        const supabase = createClient();
        const loaded = await adapter.load(
          supabase,
          parsed.rowId,
          parsed.fieldId,
        );
        const previousContent = tab.content;
        dispatch(
          replaceTabContent({
            id: tabId,
            content: loaded.content,
            remoteUpdatedAt: loaded.updatedAt,
          }),
        );
        return { tabId, ok: true, previousContent };
      } catch (err) {
        const message = extractErrorMessage(err);
        return { tabId, ok: false, error: message };
      }
    },
    [dispatch, store],
  );
}
