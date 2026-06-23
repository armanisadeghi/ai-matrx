"use client";

/**
 * Opener for the `notesWindow` overlay.
 *
 * - `useOpenNotesWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<NotesWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "notesWindow" as const;

export interface OpenNotesWindowOptions {
  /** Optional stable instance id. Omit to spawn a fresh instance. */
  instanceId?: string;
  title?: string;
  windowInstanceId?: string;
  /**
   * Optional note id to open directly. When set, the window opens that note in
   * an active tab (fetching its content) instead of just showing the list.
   */
  initialNoteId?: string;
}

export interface NotesWindowHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenNotesWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenNotesWindowOptions = {}): NotesWindowHandle => {
      const instanceId =
        opts.instanceId ??
        `notesWindow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            title: opts.title,
            windowInstanceId: opts.windowInstanceId,
            initialNoteId: opts.initialNoteId,
          },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
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
export function NotesWindowController(props: OpenNotesWindowOptions): null {
  const open = useOpenNotesWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.title, props.windowInstanceId, props.initialNoteId]);
  return null;
}
