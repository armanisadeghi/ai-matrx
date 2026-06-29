"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { RootState } from "@/lib/redux/store";
import {
  EDITOR_TABS_KEY,
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
 *  - Diff against the previously-pushed key set so we only dispatch when
 *    the wire payload actually changes (counter for content edits is
 *    debounced via `debounceMs`, default 250ms).
 *  - Stale keys (tabs that were closed) are removed by re-publishing only
 *    the surviving keys; the slice's `setContextEntries` is additive, so
 *    we accompany it with a targeted clear of removed keys.
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
  const enabled = opts.enabled ?? true;
  const debounceMs = opts.debounceMs ?? 250;

  const entries = useAppSelector(selectEditorContextEntries);
  const disabledTabs = useAppSelector((state: RootState) =>
    conversationId
      ? state.instanceUIState?.byConversationId?.[conversationId]
          ?.editorContextDisabledTabs
      : undefined,
  );

  const previousKeysRef = useRef<Set<string>>(new Set());
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
      for (const prev of previousKeysRef.current) {
        if (prev === EDITOR_TABS_KEY) continue;
        if (!liveKeys.has(prev)) {
          dispatch(removeContextEntry({ conversationId, key: prev }));
        }
      }

      previousKeysRef.current = liveKeys;
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [conversationId, enabled, entries, disabledTabs, debounceMs, dispatch]);
}
