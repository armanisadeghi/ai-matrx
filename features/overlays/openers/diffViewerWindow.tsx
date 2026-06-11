"use client";

/**
 * Opener for the `diffViewerWindow` overlay (canonical diff core in a
 * movable WindowPanel).
 *
 * - `useOpenDiffViewerWindow()` — imperative hook. Returns a handle with
 *   `instanceId` and `close()`. Multi-instance: each call spawns a fresh
 *   window (pass a stable `instanceId` to reuse one).
 * - `<DiffViewerWindowController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { DiffEngine } from "@/components/diff/DiffViewer";

const OVERLAY_ID = "diffViewerWindow" as const;

export interface OpenDiffViewerWindowOptions {
  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  title?: string | null;
  engine?: DiffEngine;
  language?: string;
  defaultView?: "split" | "inline";
  /** Stable instance id. Omit for a fresh window each call. */
  instanceId?: string;
}

export interface DiffViewerWindowHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenDiffViewerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenDiffViewerWindowOptions): DiffViewerWindowHandle => {
      const instanceId = opts.instanceId ?? `${OVERLAY_ID}-${Date.now()}`;
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            windowInstanceId: instanceId,
            original: opts.original,
            modified: opts.modified,
            originalLabel: opts.originalLabel ?? "Original",
            modifiedLabel: opts.modifiedLabel ?? "Modified",
            title: opts.title ?? null,
            engine: opts.engine ?? "auto",
            language: opts.language ?? null,
            defaultView: opts.defaultView ?? "split",
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

export function DiffViewerWindowController(
  props: OpenDiffViewerWindowOptions,
): null {
  const open = useOpenDiffViewerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.instanceId, props.original, props.modified]);
  return null;
}
