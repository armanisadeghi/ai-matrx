"use client";

/**
 * Opener for the `structuredValueWindow` overlay — one floating, non-blocking
 * window showing ONE structured value through the platform's canonical
 * structured renderer (`StructuredValueView`).
 *
 * Reach for it from any surface that can only show a structure in a space too
 * small to read it: a table cell, a compact row, a chip. The window is the
 * "read it properly, beside what I'm doing" door — never a modal, because the
 * reader's next move is usually to compare it with the thing underneath.
 *
 * Multi-instance: each call opens its own window unless the caller passes a
 * stable `instanceId` (pass one when re-opening the SAME structure should
 * reuse its window rather than stack a duplicate).
 */

import { useCallback } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "structuredValueWindow" as const;

export interface OpenStructuredValueWindowOptions {
  /** Any JSON value. It travels through Redux, so it must be serializable. */
  value: unknown;
  /** What the structure IS, in the reader's words (e.g. the column name). */
  title?: string | null;
  /** Where it came from — e.g. "Row 4 · seo.serp_opportunity". */
  subtitle?: string | null;
  /** Stable id when re-opening the same structure should reuse its window. */
  instanceId?: string;
}

export interface StructuredValueWindowHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenStructuredValueWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenStructuredValueWindowOptions): StructuredValueWindowHandle => {
      const instanceId =
        opts.instanceId ??
        `structured-value-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            windowInstanceId: instanceId,
            value: opts.value,
            title: opts.title ?? null,
            subtitle: opts.subtitle ?? null,
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
