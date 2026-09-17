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
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData } from "@/lib/detail/types";

const OVERLAY_ID = "detailWindow" as const;

export type OpenDetailWindowOptions = DetailInstanceData;

export interface DetailWindowHandle {
  close: () => void;
}

export function useOpenDetailWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenDetailWindowOptions): DetailWindowHandle => {
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
    [dispatch],
  );
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
