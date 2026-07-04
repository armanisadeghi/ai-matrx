"use client";

/**
 * Opener for the `flashcardsBlockWindow` overlay.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";

const OVERLAY_ID = "flashcardsBlockWindow" as const;

export interface OpenFlashcardsBlockWindowOptions {
  content?: string | null;
  serverData?: FlashcardsBlockData | null;
  title?: string;
  additionalDetails?: Record<string, unknown> | null;
  taskId?: string | null;
  artifactId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  blockIndex?: number | null;
}

export interface FlashcardsBlockWindowHandle {
  close: () => void;
}

export function useOpenFlashcardsBlockWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenFlashcardsBlockWindowOptions = {},
    ): FlashcardsBlockWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            content: opts.content ?? null,
            serverData: opts.serverData ?? null,
            title: opts.title ?? null,
            additionalDetails: opts.additionalDetails ?? null,
            taskId: opts.taskId ?? null,
            artifactId: opts.artifactId ?? null,
            messageId: opts.messageId ?? null,
            conversationId: opts.conversationId ?? null,
            blockIndex: opts.blockIndex ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function FlashcardsBlockWindowController(
  props: OpenFlashcardsBlockWindowOptions,
): null {
  const open = useOpenFlashcardsBlockWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.content, props.serverData, props.title]);
  return null;
}
