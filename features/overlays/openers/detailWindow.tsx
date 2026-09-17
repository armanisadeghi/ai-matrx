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
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectOverlay,
} from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData } from "@/lib/detail/types";
import { announceSingletonReplacement } from "@/features/window-panels/detail/singletonReplacement";

const OVERLAY_ID = "detailWindow" as const;

export type OpenDetailWindowOptions = DetailInstanceData;

export interface DetailWindowHandle {
  close: () => void;
}

export function useOpenDetailWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // 🚨 D8 — the singleton is kept, the silence is not. `announce` is false only
  // for the Undo re-open, which the toast it came from already explained.
  const open = useCallback(
    (opts: OpenDetailWindowOptions, announce = true): DetailWindowHandle => {
      if (announce) {
        const before = selectOverlay(store.getState(), OVERLAY_ID);
        announceSingletonReplacement({
          previousData: before.data,
          previousWasOpen: before.isOpen,
          next: opts,
          surface: "window",
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
