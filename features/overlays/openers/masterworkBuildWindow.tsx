"use client";

/**
 * Opener for the `masterworkBuildWindow` overlay — "Build a Masterwork" on a
 * Rulebook as a WindowPanel (never a blocking modal). Wires the page's
 * Masterworks-list refresh through the callback registry, because functions
 * can't travel through Redux.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createBuildCallbackGroup,
  type BuildWindowData,
  type BuildWindowHandlers,
} from "@/features/masterwork/build/callbacks";

const OVERLAY_ID = "masterworkBuildWindow" as const;

export interface OpenBuildWindowOptions extends BuildWindowHandlers {
  /** The Rulebook being built from. The window is meaningless without it. */
  rulebookId: string;
}

export interface BuildWindowHandle {
  close: () => void;
}

export function useOpenBuildWindow() {
  const dispatch = useAppDispatch();
  const disposersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    const disposers = disposersRef.current;
    return () => {
      for (const dispose of disposers) dispose();
      disposers.clear();
    };
  }, []);

  return useCallback(
    (opts: OpenBuildWindowOptions): BuildWindowHandle => {
      const { callbackGroupId, dispose } = createBuildCallbackGroup({
        onBuilt: opts.onBuilt,
        onWindowClose: opts.onWindowClose,
      });
      disposersRef.current.add(dispose);
      const data: BuildWindowData = {
        callbackGroupId,
        rulebookId: opts.rulebookId,
      };
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data }));
      return {
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
          dispose();
          disposersRef.current.delete(dispose);
        },
      };
    },
    [dispatch],
  );
}

export function BuildWindowController(props: OpenBuildWindowOptions): null {
  const open = useOpenBuildWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.rulebookId]);
  return null;
}
