"use client";

/**
 * Opener for the `htmlPreview` overlay.
 *
 * - `useOpenHtmlPreviewBridge()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<HtmlPreviewBridgeController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Callback-aware (D33): `onSave` never travels through Redux. The opener
 * registers a callback GROUP via `createFullScreenEditorCallbackGroup` (the
 * same channel the full-screen editor uses) and passes only the serialisable
 * `callbackGroupId` string through `openOverlay` data. `HtmlPreviewBridge`
 * emits the save on that group; the handler fires in the caller's context.
 * With no `onSave`, chat-message callers still get the bridge's `editMessage`
 * self-handle via `conversationId` + `messageId`.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";

const OVERLAY_ID = "htmlPreview" as const;

export interface OpenHtmlPreviewBridgeOptions {
  /** Optional stable instance id. Omit to spawn a fresh instance. */
  instanceId?: string;
  content: string;
  messageId?: string;
  conversationId?: string;
  title?: string;
  description?: string;
  /**
   * Save handler — receives the edited markdown. Routed through the callback
   * registry (never Redux). When provided, the bridge shows a Save button
   * (unless `showSaveButton` explicitly overrides) and the caller owns the
   * save outcome, taking precedence over the chat-message self-handle path.
   */
  onSave?: (markdownContent: string) => void | Promise<void>;
  showSaveButton?: boolean;
  isAgentSystem?: boolean;
}

export interface HtmlPreviewBridgeHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenHtmlPreviewBridge() {
  const dispatch = useAppDispatch();
  // Track live callback groups so a caller unmount can't leak them
  // (the save path self-disposes via `removeAfterTrigger`; this covers
  // close-without-save).
  const disposersRef = useRef<Set<() => void>>(new Set());
  useEffect(() => {
    const disposers = disposersRef.current;
    return () => {
      for (const dispose of disposers) dispose();
      disposers.clear();
    };
  }, []);

  return useCallback(
    (opts: OpenHtmlPreviewBridgeOptions): HtmlPreviewBridgeHandle => {
      const instanceId = opts.instanceId ?? `htmlPreview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let callbackGroupId: string | null = null;
      let dispose: (() => void) | null = null;
      if (opts.onSave) {
        const onSave = opts.onSave;
        const group = createFullScreenEditorCallbackGroup({
          onSave: (content) => void onSave(content),
        });
        callbackGroupId = group.callbackGroupId;
        dispose = () => {
          group.dispose();
          if (dispose) disposersRef.current.delete(dispose);
        };
        disposersRef.current.add(dispose);
      }

      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            content: opts.content,
            messageId: opts.messageId,
            conversationId: opts.conversationId,
            title: opts.title,
            description: opts.description,
            callbackGroupId,
            showSaveButton: opts.showSaveButton ?? (opts.onSave ? true : undefined),
            isAgentSystem: opts.isAgentSystem,
          },
        }),
      );
      return {
        instanceId,
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
          dispose?.();
        },
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function HtmlPreviewBridgeController(props: OpenHtmlPreviewBridgeOptions): null {
  const open = useOpenHtmlPreviewBridge();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.content, props.messageId, props.conversationId, props.title, props.description, props.onSave, props.showSaveButton, props.isAgentSystem]);
  return null;
}
