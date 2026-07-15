"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type {
  RagAiCopyBundle,
  RagAiSectionKey,
} from "@/features/rag/components/search/ragAiCopy";

const OVERLAY_ID = "ragAiCopyWindow" as const;

export interface OpenRagAiCopyWindowOptions {
  bundle: RagAiCopyBundle;
  /** When launched from one content block, start focused on that block. */
  initialSections?: RagAiSectionKey[];
}

export interface RagAiCopyWindowHandle {
  close: () => void;
}

export function useOpenRagAiCopyWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenRagAiCopyWindowOptions): RagAiCopyWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            bundle: options.bundle,
            initialSections: options.initialSections ?? null,
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

export function RagAiCopyWindowController(
  props: OpenRagAiCopyWindowOptions,
): null {
  const open = useOpenRagAiCopyWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.bundle, props.initialSections]);
  return null;
}
