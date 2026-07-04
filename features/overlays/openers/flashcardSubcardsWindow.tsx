"use client";

/**
 * Opener for the `flashcardSubcardsWindow` overlay.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { FlashcardSubcard } from "@/components/mardown-display/blocks/flashcards/flashcard-subcards";

const OVERLAY_ID = "flashcardSubcardsWindow" as const;

export interface OpenFlashcardSubcardsWindowOptions {
  subcards?: FlashcardSubcard[];
  title?: string;
  parentFront?: string;
}

export interface FlashcardSubcardsWindowHandle {
  close: () => void;
}

export function useOpenFlashcardSubcardsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenFlashcardSubcardsWindowOptions = {},
    ): FlashcardSubcardsWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            subcards: opts.subcards ?? [],
            title: opts.title ?? null,
            parentFront: opts.parentFront ?? null,
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

export function FlashcardSubcardsWindowController(
  props: OpenFlashcardSubcardsWindowOptions,
): null {
  const open = useOpenFlashcardSubcardsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.subcards, props.title, props.parentFront]);
  return null;
}
