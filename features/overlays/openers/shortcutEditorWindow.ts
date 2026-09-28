"use client";

/**
 * Opener for the `shortcutEditorWindow` overlay — THE shortcut editor in a
 * window. `shortcutEditorWindowAction()` is the plain action for non-React
 * callers (the rich-document action handlers); `useOpenShortcutEditorWindow()`
 * is the hook.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "shortcutEditorWindow" as const;

export interface OpenShortcutEditorWindowArgs {
  agentId: string;
  /** "new" (the default) or an existing shortcut id. */
  shortcutId?: string;
  /** A draft seed id from `putShortcutDraftSeed` (new drafts only). */
  seedId?: string | null;
}

export function shortcutEditorWindowAction(args: OpenShortcutEditorWindowArgs) {
  return openOverlay({
    overlayId: OVERLAY_ID,
    instanceId: `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    data: {
      agentId: args.agentId,
      shortcutId: args.shortcutId ?? "new",
      seedId: args.seedId ?? null,
    },
  });
}

export function useOpenShortcutEditorWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (args: OpenShortcutEditorWindowArgs) => {
      dispatch(shortcutEditorWindowAction(args));
    },
    [dispatch],
  );
}
