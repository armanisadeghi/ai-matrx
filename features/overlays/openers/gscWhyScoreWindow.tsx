"use client";

/**
 * Opener for the `gscWhyScoreWindow` overlay (multi-instance).
 *
 * One panel per (site, keyword): asking "why?" about the same keyword twice
 * focuses the panel already floating instead of stacking a duplicate, while
 * two different keywords float side by side for comparison.
 */

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectOpenInstances,
} from "@/lib/redux/slices/overlaySlice";
import {
  focusWindow,
  restoreWindow,
} from "@/lib/redux/slices/windowManagerSlice";

const OVERLAY_ID = "gscWhyScoreWindow" as const;

export interface OpenGscWhyScoreWindowOptions {
  siteId: string;
  siteName?: string | null;
  brandId?: string | null;
  keywordId: string;
  keyword?: string | null;
}

export interface GscWhyScoreWindowHandle {
  close: () => void;
}

function instanceIdFor(opts: OpenGscWhyScoreWindowOptions): string {
  return [opts.siteId, opts.keywordId].join("|why|");
}

export function useOpenGscWhyScoreWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenGscWhyScoreWindowOptions): GscWhyScoreWindowHandle => {
      const instanceId = instanceIdFor(opts);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((inst) => inst.instanceId === instanceId)) {
        dispatch(restoreWindow(instanceId));
        dispatch(focusWindow(instanceId));
        return {
          close: () =>
            dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
        };
      }
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            stackIndex: open.length,
            siteId: opts.siteId,
            siteName: opts.siteName ?? null,
            brandId: opts.brandId ?? null,
            keywordId: opts.keywordId,
            keyword: opts.keyword ?? null,
          },
        }),
      );
      return {
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch, store],
  );
}
