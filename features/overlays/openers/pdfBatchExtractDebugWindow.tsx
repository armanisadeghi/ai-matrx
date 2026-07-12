"use client";

/**
 * Opener for the `pdfBatchExtractDebugWindow` overlay.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "pdfBatchExtractDebugWindow" as const;

export interface OpenPdfBatchExtractDebugWindowOptions {
  initialSessionId?: string | null;
}

export interface PdfBatchExtractDebugWindowHandle {
  close: () => void;
}

export function useOpenPdfBatchExtractDebugWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenPdfBatchExtractDebugWindowOptions = {},
    ): PdfBatchExtractDebugWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            initialSessionId: opts.initialSessionId ?? null,
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

export function PdfBatchExtractDebugWindowController(
  props: OpenPdfBatchExtractDebugWindowOptions,
): null {
  const open = useOpenPdfBatchExtractDebugWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialSessionId]);
  return null;
}
