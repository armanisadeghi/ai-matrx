"use client";

/**
 * Opener for the `detailWindow` overlay — the Detail primitive's WINDOW
 * presentation (`lib/detail`). Prefer `useOpenDetail()` from `lib/detail`,
 * which honours the person's presentation setting; this opener is the raw
 * window door the host binds behind it.
 *
 * - `useOpenDetailWindow()` — imperative hook; returns a handle with `close()`.
 * - `<DetailWindowController />` — declarative wrapper. Mount to open, unmount to close.
 *
 * Singleton: opening another record retargets the same window (Notion peek).
 */

import { useCallback, useEffect } from "react";
import { dispatchThunk, useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData } from "@/lib/detail/types";
import { openDetailSingleton } from "@/features/window-panels/detail/openDetailSingleton";

const OVERLAY_ID = "detailWindow" as const;

export type OpenDetailWindowOptions = DetailInstanceData;

export interface DetailWindowHandle {
  close: () => void;
}

export function useOpenDetailWindow() {
  const dispatch = useAppDispatch();
  // 🚨 D8 — THE ANNOUNCEMENT IS NOT THIS HOOK'S JOB. Every open of this
  // singleton goes through `openDetailSingleton`, which reads the record it is
  // about to replace and names it. Round 1 put that logic in this hook and its
  // sibling, and the `?panels=` hydrator — a third opener nobody remembered —
  // replaced records in silence (VERIFY-U-P1-R2). One primitive, no exceptions.
  const open = useCallback(
    (opts: OpenDetailWindowOptions, announce = true): DetailWindowHandle => {
      dispatchThunk(
        dispatch,
        openDetailSingleton({ presentation: "window", data: opts, announce }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
  return open;
}

/** Close the singleton from anywhere (the host's `close` port). */
export function useCloseDetailWindow() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
  }, [dispatch]);
}

/** Declarative form. Renders nothing visible; opens on mount, closes on unmount. */
export function DetailWindowController(props: OpenDetailWindowOptions): null {
  const open = useOpenDetailWindow();
  const listKey = props.list ? `${props.list.index}:${props.list.items.length}` : "";
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // The instance is identified by type/id/seed/list — a fresh object each
    // render must not reopen the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.type, props.id, props.seed?.name, props.seed?.about, listKey]);
  return null;
}
