"use client";

/**
 * Opener for the `dictionarySelectorWindow` overlay — the compact dictionary
 * context selector used by transcription/TTS surfaces.
 *
 * Singleton: one selector at a time. The `surfaceKey` tells it which surface's
 * per-user selection to read/write (via surface-user-state); selection flows
 * back to the parent through that shared store, not a callback.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "dictionarySelectorWindow" as const;

export interface OpenDictionarySelectorOptions {
  /** The surface whose dictionary selection this window edits. */
  surfaceKey: string;
}

export interface DictionarySelectorHandle {
  close: () => void;
}

export function useOpenDictionarySelectorWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenDictionarySelectorOptions): DictionarySelectorHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { surfaceKey: opts.surfaceKey },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}

/** Declarative form — open on mount, close on unmount. */
export function DictionarySelectorWindowController(
  props: OpenDictionarySelectorOptions,
): null {
  const open = useOpenDictionarySelectorWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.surfaceKey]);
  return null;
}
