"use client";

/**
 * Opener for the `findReplace` overlay (canonical `FindReplaceModal` in the
 * overlay layer).
 *
 * Callback-aware: the modal needs a LIVE DOM target and an `onReplace` handler,
 * neither of which can travel through Redux. The opener registers a callback
 * group (via `features/overlays/callbacks/findReplace`) and passes only the
 * resulting `callbackGroupId` string through `openOverlay` data — callers never
 * touch the registry. Mirrors `useOpenImageUploaderWindow`.
 *
 * - `useOpenFindReplace()` — imperative hook. Returns a handle with `close()`
 *   (closes the overlay AND disposes the callback group) and `dispose()` (drops
 *   the group without closing).
 * - `<FindReplaceController />` — declarative wrapper.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFindReplaceCallbackGroup } from "@/features/overlays/callbacks/findReplace";

const OVERLAY_ID = "findReplace" as const;

export interface OpenFindReplaceOptions {
  /** Accessor for the live textarea/input to search. Re-read at use time. */
  getTargetElement: () => HTMLTextAreaElement | HTMLInputElement | null;
  /** Optional. When present, replaces drive content through the caller. */
  onReplace?: (newText: string) => void;
  /** Optional stable instance id. Omit for the default singleton slot. */
  instanceId?: string;
}

export interface FindReplaceHandle {
  overlayId: string;
  callbackGroupId: string;
  /** Close the overlay AND dispose the callback group. */
  close: () => void;
  /** Leave the overlay open; dispose the callback group only. */
  dispose: () => void;
}

type HandleRef = {
  callbackGroupId: string;
  dispose: () => void;
};

export function useOpenFindReplace() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (opts: OpenFindReplaceOptions): FindReplaceHandle => {
      const { callbackGroupId, dispose } = createFindReplaceCallbackGroup({
        getTargetElement: opts.getTargetElement,
        onReplace: opts.onReplace,
      });

      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId: opts.instanceId,
          data: { callbackGroupId },
        }),
      );

      const handleRef: HandleRef = { callbackGroupId, dispose };
      handlesRef.current.add(handleRef);

      const close = () => {
        dispatch(
          closeOverlay({ overlayId: OVERLAY_ID, instanceId: opts.instanceId }),
        );
        dispose();
        handlesRef.current.delete(handleRef);
      };

      const detach = () => {
        dispose();
        handlesRef.current.delete(handleRef);
      };

      return {
        overlayId: OVERLAY_ID,
        callbackGroupId,
        close,
        dispose: detach,
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount, closes
 * it on unmount. Callback identity changes do NOT re-open — the handlers feed
 * the underlying group; pass stable functions (or memoize) for predictable
 * behavior.
 */
export function FindReplaceController(props: OpenFindReplaceOptions): null {
  const open = useOpenFindReplace();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // Identity is the instance id only; handler identity must NOT re-open
    // (the handlers feed the underlying callback group).
  }, [open, props.instanceId]);
  return null;
}
