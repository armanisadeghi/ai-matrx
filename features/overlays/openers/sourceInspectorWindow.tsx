"use client";

/**
 * Opener for the `sourceInspectorWindow` overlay.
 *
 * - `useOpenSourceInspectorWindow()` — imperative hook. Call with a citation
 *   (source kind/id + chunk + page) to open the inspector; returns a handle
 *   with `close()`.
 * - `<SourceInspectorWindowController />` — declarative mount-to-open wrapper.
 *
 * The data is all primitives (+ a number[]), so it travels through Redux
 * cleanly — no callback registry needed.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "sourceInspectorWindow" as const;

export interface OpenSourceInspectorWindowOptions {
  /** "cld_file" | "library_doc" | "note" | "code_file" | "transcript" | "scraped" */
  sourceKind: string;
  /** cld_file → file_id; library_doc → processed_document_id; else opaque. */
  sourceId: string;
  chunkId?: string | null;
  pageNumber?: number | null;
  pageNumbers?: number[] | null;
  snippet?: string | null;
  fileName?: string | null;
  score?: number | null;
  query?: string | null;
  /** Canonical citation deep-link for the "Open source" new-tab action. */
  href?: string | null;
}

export interface SourceInspectorWindowHandle {
  close: () => void;
}

export function useOpenSourceInspectorWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSourceInspectorWindowOptions): SourceInspectorWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            sourceKind: opts.sourceKind,
            sourceId: opts.sourceId,
            chunkId: opts.chunkId ?? null,
            pageNumber: opts.pageNumber ?? null,
            pageNumbers: opts.pageNumbers ?? null,
            snippet: opts.snippet ?? null,
            fileName: opts.fileName ?? null,
            score: opts.score ?? null,
            query: opts.query ?? null,
            href: opts.href ?? null,
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

/**
 * Declarative form. Renders nothing; opens the overlay on mount, closes on
 * unmount.
 */
export function SourceInspectorWindowController(
  props: OpenSourceInspectorWindowOptions,
): null {
  const open = useOpenSourceInspectorWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // Re-open when the cited source/page changes.
  }, [open, props.sourceId, props.chunkId, props.pageNumber]);
  return null;
}
