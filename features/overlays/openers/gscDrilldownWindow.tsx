"use client";

/**
 * Opener for the `gscDrilldownWindow` overlay (multi-instance).
 *
 * - `useOpenGscDrilldownWindow()` — imperative hook. Each distinct
 *   (site, dimension, filters, period) slice gets its own deterministic
 *   instanceId, so several drill-down panels float side by side while
 *   re-opening the SAME slice focuses the existing panel instead of
 *   stacking a duplicate.
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
import type {
  GscCompareMode,
  GscDimension,
  GscFilters,
  GscRangeKey,
} from "@/features/marketing/search-console/types";

const OVERLAY_ID = "gscDrilldownWindow" as const;

export interface OpenGscDrilldownWindowOptions {
  siteId: string;
  siteName?: string | null;
  dimension: GscDimension;
  filters?: GscFilters;
  range?: GscRangeKey;
  customFrom?: string | null;
  customTo?: string | null;
  compare?: GscCompareMode;
  title?: string;
}

export interface GscDrilldownWindowHandle {
  close: () => void;
}

function instanceIdFor(opts: OpenGscDrilldownWindowOptions): string {
  const filters = Object.entries(opts.filters ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return [
    opts.siteId,
    opts.dimension,
    filters,
    opts.range ?? "90d",
    opts.customFrom ?? "",
    opts.customTo ?? "",
    opts.compare ?? "none",
  ].join("|");
}

export function useOpenGscDrilldownWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenGscDrilldownWindowOptions): GscDrilldownWindowHandle => {
      const instanceId = instanceIdFor(opts);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((inst) => inst.instanceId === instanceId)) {
        // Same slice already floating: surface it (un-minimize + raise)
        // instead of silently re-dispatching into an unchanged pile.
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
            dimension: opts.dimension,
            filters: opts.filters ?? {},
            range: opts.range ?? "90d",
            customFrom: opts.customFrom ?? null,
            customTo: opts.customTo ?? null,
            compare: opts.compare ?? "none",
            title: opts.title ?? null,
          },
        }),
      );
      return {
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}
