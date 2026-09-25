"use client";

/**
 * Opener for the `feedbackDialog` overlay.
 *
 * - `useOpenFeedbackWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<FeedbackWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "feedbackDialog" as const;

/**
 * What the report is ABOUT, when the person opened it from a specific thing —
 * e.g. a selected passage of a document ("Report an issue" in the annotation
 * toolbar). Shown read-only in the window and filed as `metadata.report_subject`.
 */
export interface FeedbackSubject {
  kind: "text_passage";
  /** Registered token + id of the record the passage belongs to. */
  sourceToken: string;
  sourceId: string;
  sourceTitle: string;
  /** The exact selected text. */
  quote: string;
  /** The passage identity (a text_anchor payload), so the report points at the exact spot. */
  anchor?: Record<string, unknown> | null;
  /** In-app path back to the source. */
  href?: string;
}

export interface OpenFeedbackWindowOptions {
  title?: string;
  subject?: FeedbackSubject;
}

export interface FeedbackWindowHandle {
  close: () => void;
}

export function useOpenFeedbackWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenFeedbackWindowOptions = {}): FeedbackWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
            subject: opts.subject,
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
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function FeedbackWindowController(props: OpenFeedbackWindowOptions): null {
  const open = useOpenFeedbackWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.title]);
  return null;
}
