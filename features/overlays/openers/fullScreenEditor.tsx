"use client";

/**
 * Opener for the `fullScreenEditor` overlay.
 *
 * - `useOpenFullScreenMarkdownEditorBridge()` — imperative hook. Call to open
 *   with typed options; returns a handle with a `close()` method.
 * - `<FullScreenMarkdownEditorBridgeController />` — declarative wrapper. Mount
 *   to open, unmount to close.
 *
 * CALLBACK-AWARE (2026-06-14). `onSave` is delivered through the global
 * `callbackManager` — the opener registers a callback GROUP and passes only the
 * serialisable `callbackGroupId` string through Redux. Functions NEVER travel
 * through `openOverlay` data (overlay hard rule #5). This replaced the dead
 * `onSave={undefined}` stub in OverlayController that silently broke every
 * editor save. See `features/overlays/callbacks/fullScreenEditor.ts`.
 *
 * Two save paths, mutually exclusive (the bridge prefers the callback):
 *   - Pass `onSave` → the bridge emits to your callback (you own persistence /
 *     post-save flow, e.g. the fork-vs-overwrite dialog for "Edit & resubmit").
 *   - Pass `conversationId` + `messageId` and NO `onSave` → the bridge
 *     self-handles via `editMessage` (plain "Edit content").
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createFullScreenEditorCallbackGroup,
  type FullScreenEditorHandlers,
} from "@/features/overlays/callbacks/fullScreenEditor";

const OVERLAY_ID = "fullScreenEditor" as const;

export interface OpenFullScreenMarkdownEditorBridgeOptions
  extends FullScreenEditorHandlers {
  /** Optional stable instance id. Omit to spawn a fresh instance. */
  instanceId?: string;
  content?: string;
  /** TODO: tighten to `FullScreenEditorMode` once that type is imported. */
  mode?: unknown;
  conversationId?: string;
  messageId?: string;
  /** TODO: tighten to `TabId[]` once that type is imported. */
  tabs?: unknown;
  /** TODO: tighten to `TabId` once that type is imported. */
  initialTab?: unknown;
  analysisData?: Record<string, unknown>;
  title?: string;
  description?: string;
  showSaveButton?: boolean;
  showCopyButton?: boolean;
}

export interface FullScreenMarkdownEditorBridgeHandle {
  instanceId: string;
  callbackGroupId: string | null;
  close: () => void;
}

type HandleRef = { dispose: () => void };

export function useOpenFullScreenMarkdownEditorBridge() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  // Dispose any still-open callback groups when the opener's owner unmounts,
  // so we never leak a group whose handlers close over a dead component.
  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (
      opts: OpenFullScreenMarkdownEditorBridgeOptions = {},
    ): FullScreenMarkdownEditorBridgeHandle => {
      const instanceId =
        opts.instanceId ??
        `fullScreenEditor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Register a callback group only when the caller wants to be told about
      // the save. Plain "edit content" callers pass conversationId+messageId
      // and let the bridge self-handle — no group needed.
      let callbackGroupId: string | null = null;
      let dispose = () => {};
      if (opts.onSave || opts.onEvent) {
        const group = createFullScreenEditorCallbackGroup({
          onSave: opts.onSave,
          onEvent: opts.onEvent,
        });
        callbackGroupId = group.callbackGroupId;
        dispose = group.dispose;
      }

      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            content: opts.content,
            mode: opts.mode,
            conversationId: opts.conversationId,
            messageId: opts.messageId,
            callbackGroupId,
            tabs: opts.tabs,
            initialTab: opts.initialTab,
            analysisData: opts.analysisData,
            title: opts.title,
            description: opts.description,
            showSaveButton: opts.showSaveButton,
            showCopyButton: opts.showCopyButton,
          },
        }),
      );

      const handleRef: HandleRef = { dispose };
      handlesRef.current.add(handleRef);

      return {
        instanceId,
        callbackGroupId,
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
          dispose();
          handlesRef.current.delete(handleRef);
        },
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function FullScreenMarkdownEditorBridgeController(
  props: OpenFullScreenMarkdownEditorBridgeOptions,
): null {
  const open = useOpenFullScreenMarkdownEditorBridge();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // Callback handler identity does not justify a reopen (matches the
    // image-uploader controller). Re-open only on the structural inputs.
  }, [
    open,
    props.instanceId,
    props.content,
    props.mode,
    props.conversationId,
    props.messageId,
    props.tabs,
    props.initialTab,
    props.analysisData,
    props.title,
    props.description,
    props.showSaveButton,
    props.showCopyButton,
  ]);
  return null;
}
