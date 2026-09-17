"use client";

/**
 * Opener for the `detailDocked` overlay — the Detail primitive's DOCKED
 * presentation (`@ai-matrx/detail`): a resizable side panel docked to the right edge
 * (a bottom sheet on phones). Prefer `useOpenDetail()` from `@ai-matrx/detail/react`,
 * which honours the person's presentation setting; this is the raw door.
 *
 * - `useOpenDetailDocked()` — imperative hook; returns a handle with `close()`.
 * - `<DetailDockedController />` — declarative wrapper. Mount to open, unmount to close.
 *
 * Singleton: one docked panel; opening another record retargets it.
 */

import { useCallback, useEffect } from "react";
import { dispatchThunk, useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData } from "@ai-matrx/detail";
import { openDetailSingleton } from "@/features/window-panels/detail/openDetailSingleton";

const OVERLAY_ID = "detailDocked" as const;

export type OpenDetailDockedOptions = DetailInstanceData;

export interface DetailDockedHandle {
  close: () => void;
}

export function useOpenDetailDocked() {
  const dispatch = useAppDispatch();
  // 🚨 D8 — THE ANNOUNCEMENT IS NOT THIS HOOK'S JOB. Every open of this
  // singleton goes through `openDetailSingleton`, which reads the record it is
  // about to replace and names it. Round 1 put that logic in this hook and its
  // sibling, and the `?panels=` hydrator — a third opener nobody remembered —
  // replaced records in silence (VERIFY-U-P1-R2). One primitive, no exceptions.
  const open = useCallback(
    (opts: OpenDetailDockedOptions, announce = true): DetailDockedHandle => {
      dispatchThunk(
        dispatch,
        openDetailSingleton({ presentation: "docked", data: opts, announce }),
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
export function useCloseDetailDocked() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
  }, [dispatch]);
}

/** Declarative form. Renders nothing visible; opens on mount, closes on unmount. */
export function DetailDockedController(props: OpenDetailDockedOptions): null {
  const open = useOpenDetailDocked();
  const listKey = props.list ? `${props.list.index}:${props.list.items.length}` : "";
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.type, props.id, props.seed?.name, props.seed?.about, listKey]);
  return null;
}
