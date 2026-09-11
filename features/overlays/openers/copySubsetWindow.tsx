"use client";

/**
 * Opener for the `copySubsetWindow` overlay — "Filter & sort before copying…".
 *
 * - `useOpenCopySubsetWindow()` — imperative hook. Registers the caller's
 *   rows / columns / serializer as a copy-subset SESSION (module scope,
 *   `components/agent-copy/copy-subset/session.ts`) and dispatches only the
 *   serialisable `sessionId` + `title` through Redux. Returns a handle with
 *   `close()`.
 * - `<CopySubsetWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 *
 * Rows and functions never enter `openOverlay` data: the overlaySlice guard
 * would strip the functions, and a row array is not global state.
 */

import { useContext, useEffect, useState } from "react";
import { ReactReduxContext } from "react-redux";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  registerCopySubsetSession,
  releaseCopySubsetSession,
} from "@/components/agent-copy/copy-subset/session";
import type { CopySubsetSource } from "@/components/agent-copy/copy-subset/types";

const OVERLAY_ID = "copySubsetWindow" as const;

export interface OpenCopySubsetWindowOptions<T> {
  source: CopySubsetSource<T>;
  /** Window title. Defaults to the source label. */
  title?: string;
  /** Optional stable instance id. Omit to spawn a fresh window per open. */
  instanceId?: string;
}

export interface CopySubsetWindowHandle {
  instanceId: string;
  sessionId: string;
  close: () => void;
}

export function useOpenCopySubsetWindow() {
  // MatrxDataTable can render as a standalone primitive without the app Redux
  // provider when copy actions are not configured. Keep that render path real;
  // if a caller actually invokes this app-owned overlay door without its
  // provider, fail at the interaction boundary with an actionable error.
  const reduxContext = useContext(ReactReduxContext);
  const dispatch = reduxContext?.store.dispatch;
  return function openCopySubsetWindow<T>(
    opts: OpenCopySubsetWindowOptions<T>,
  ): CopySubsetWindowHandle {
    if (!dispatch) {
      throw new Error(
        "CopySubsetWindow requires the application Redux provider before it can open.",
      );
    }
    const session = registerCopySubsetSession(opts.source);
    const instanceId = opts.instanceId ?? session.id;
    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        instanceId,
        data: {
          sessionId: session.id,
          title: opts.title ?? opts.source.label,
        },
      }),
    );
    return {
      instanceId,
      sessionId: session.id,
      close: () => {
        dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
        releaseCopySubsetSession(session.id);
      },
    };
  };
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount and
 * closes it (releasing the session) on unmount.
 */
export function CopySubsetWindowController<T>(
  props: OpenCopySubsetWindowOptions<T>,
): null {
  const open = useOpenCopySubsetWindow();
  // The source is captured ONCE at mount (an `initial*`-style seed): the
  // window works on a snapshot, and re-opening on every parent render would
  // reset the user's shaping.
  const [initial] = useState(() => props);
  useEffect(() => {
    const handle = open(initial);
    return () => handle.close();
  }, [open, initial]);
  return null;
}
