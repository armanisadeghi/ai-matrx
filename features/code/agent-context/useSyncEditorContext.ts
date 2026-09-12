"use client";

import { useEffect, useRef } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { RootState } from "@/lib/redux/store";
import {
  filterDisabledTabs,
  selectEditorContextEntries,
} from "./editorContextEntries";

/**
 * Mirror the open editor tabs into a chat instance's `instanceContext`.
 *
 * Strategy:
 *  - Read the canonical entry list from `selectEditorContextEntries`.
 *  - Drop any tabs the user has explicitly excluded for this instance via
 *    `instanceUIState.editorContextDisabledTabs`.
 *  - Debounce content updates via `debounceMs`, default 250ms.
 *  - Stale keys (tabs that were closed) are removed by re-publishing only
 *    the surviving keys; the slice's `setContextEntries` is additive, so
 *    we accompany it with a targeted clear of removed keys read from the
 *    current conversation. This also reconciles remounts and chat switches.
 *    Explicit pinned snapshots survive activation changes, but opt-out removes them.
 */
export interface UseSyncEditorContextOptions {
  /** Debounce for re-pushing edits (ms). Defaults to 250. */
  debounceMs?: number;
  /** When false, the bridge does nothing (used for feature flags). */
  enabled?: boolean;
}

export function useSyncEditorContext(
  conversationId: string | null | undefined,
  opts: UseSyncEditorContextOptions = {},
): void {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const enabled = opts.enabled ?? true;
  const debounceMs = opts.debounceMs ?? 250;

  const entries = useAppSelector(selectEditorContextEntries);
  const disabledTabs = useAppSelector((state: RootState) =>
    conversationId
      ? state.instanceUIState?.byConversationId?.[conversationId]
          ?.editorContextDisabledTabs
      : undefined,
  );

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !conversationId) return undefined;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      const filtered = filterDisabledTabs(entries, disabledTabs);
      const liveKeys = new Set<string>(filtered.map((e) => e.key));

      dispatch(
        setContextEntries({
          conversationId,
          entries: filtered.map((e) => ({
            key: e.key,
            value: e.value,
            slotMatched: false,
            type: e.type,
            label: e.label,
          })),
        }),
      );

      // Drop stale keys from previous push (tabs that were closed or
      // disabled in the popover) so `ctx_get` no longer hands the agent
      // outdated buffers.
      const current =
        store.getState().instanceContext.byConversationId[conversationId] ?? {};
      for (const key of Object.keys(current)) {
        const autoManaged =
          [
            "editor.tabs",
            "editor.activeFile",
            "editor.recentFiles",
            "editor.diagnostics",
          ].includes(key) || key.startsWith("editor.tab.");
        const excludedManual = ["editor.selection.", "editor.pinnedTab."].some(
          (prefix) =>
            key.startsWith(prefix) &&
            disabledTabs?.includes(key.slice(prefix.length)),
        );
        if ((autoManaged && !liveKeys.has(key)) || excludedManual) {
          dispatch(removeContextEntry({ conversationId, key }));
        }
      }
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [
    conversationId,
    enabled,
    entries,
    disabledTabs,
    debounceMs,
    dispatch,
    store,
  ]);
}
