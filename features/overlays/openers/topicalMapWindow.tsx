"use client";

/**
 * Opener for the `topicalMapWindow` overlay (multi-instance) — CONTRACTS.md §5.
 *
 * - `useOpenTopicalMapWindow()` — imperative hook. ONE map gets ONE window: the
 *   instance id IS the map id, so opening a map that is already floating
 *   focuses it (un-minimize + raise) and, when a different screen was asked
 *   for, re-dispatches the instance data so the window switches to it — never
 *   a second identical window. Two different maps sit side by side.
 * - `<TopicalMapWindowController />` — declarative wrapper.
 *
 * `mapId: ""` opens the window on its MAP PICKER (the Tools grid does this):
 * that instance is keyed `picker` so it never collides with a real map.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";

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

const OVERLAY_ID = "topicalMapWindow" as const;

/** Mirrors `MapWorkspaceScreen` (declared here: an opener may not import feature modules). */
export type TopicalMapWindowScreen =
  | "outline"
  | "table"
  | "graph"
  | "text"
  | "pages"
  | "history";

export interface OpenTopicalMapWindowOptions {
  /** The map to open. Empty opens the picker. */
  mapId: string;
  /** Which screen to land on. Defaults to the outline. */
  screen?: TopicalMapWindowScreen | null;
  /** The site in scope, or null for every site the caller may view. */
  siteId?: string | null;
}

export interface TopicalMapWindowHandle {
  close: () => void;
}

export const TOPICAL_MAP_PICKER_INSTANCE_ID = "picker";

export function topicalMapWindowInstanceId(mapId: string): string {
  return mapId || TOPICAL_MAP_PICKER_INSTANCE_ID;
}

export function useOpenTopicalMapWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenTopicalMapWindowOptions): TopicalMapWindowHandle => {
      const instanceId = topicalMapWindowInstanceId(opts.mapId);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      const existing = open.find((inst) => inst.instanceId === instanceId);
      const data = {
        stackIndex: existing ? undefined : open.length,
        mapId: opts.mapId,
        screen: opts.screen ?? "outline",
        siteId: opts.siteId ?? null,
      };
      if (existing) {
        // Already floating: surface it. A screen the caller named is applied
        // by re-dispatching the instance data, which the window observes.
        if (opts.screen) {
          dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));
        }
        dispatch(restoreWindow(instanceId));
        dispatch(focusWindow(instanceId));
      } else {
        dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));
      }
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch, store],
  );
}

/** Declarative form. Opens on mount, closes on unmount. */
export function TopicalMapWindowController(props: OpenTopicalMapWindowOptions): null {
  const open = useOpenTopicalMapWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.mapId, props.screen, props.siteId]);
  return null;
}
