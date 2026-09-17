"use client";

/**
 * Opener for the `detailDocked` overlay — the Detail primitive's DOCKED
 * presentation (`lib/detail`): a resizable side panel docked to the right edge
 * (a bottom sheet on phones). Prefer `useOpenDetail()` from `lib/detail`,
 * which honours the person's presentation setting; this is the raw door.
 *
 * - `useOpenDetailDocked()` — imperative hook; returns a handle with `close()`.
 * - `<DetailDockedController />` — declarative wrapper. Mount to open, unmount to close.
 *
 * Singleton: one docked panel; opening another record retargets it.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectOverlay,
} from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData } from "@/lib/detail/types";
import { announceSingletonReplacement } from "@/features/window-panels/detail/singletonReplacement";

const OVERLAY_ID = "detailDocked" as const;

export type OpenDetailDockedOptions = DetailInstanceData;

export interface DetailDockedHandle {
  close: () => void;
}

export function useOpenDetailDocked() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // 🚨 D8 — the singleton is kept, the silence is not. `announce` is false only
  // for the Undo re-open, which the toast it came from already explained.
  const open = useCallback(
    (opts: OpenDetailDockedOptions, announce = true): DetailDockedHandle => {
      if (announce) {
        const before = selectOverlay(store.getState(), OVERLAY_ID);
        announceSingletonReplacement({
          previousData: before.data,
          previousWasOpen: before.isOpen,
          next: opts,
          surface: "docked panel",
          reopen: (data) => open(data, false),
        });
      }
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            type: opts.type,
            id: opts.id,
            seedName: opts.seed?.name ?? null,
            seedAbout: opts.seed?.about ?? null,
            listItems: opts.list?.items ?? null,
            listIndex: opts.list?.index ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch, store],
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
