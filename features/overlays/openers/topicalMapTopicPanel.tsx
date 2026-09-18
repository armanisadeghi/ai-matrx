"use client";

/**
 * Opener for the `topicalMapTopicPanel` overlay (multi-instance).
 *
 * - `useOpenTopicPanel()` — imperative hook. One topic of one map gets ONE
 *   deterministic instance id, so opening the same topic twice FOCUSES the
 *   panel already floating instead of stacking a second identical copy, while
 *   two different topics happily sit side by side.
 * - `<TopicalMapTopicPanelController />` — declarative wrapper.
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

const OVERLAY_ID = "topicalMapTopicPanel" as const;

export interface OpenTopicPanelOptions {
  mapId: string;
  /** Topics are addressed by SLUG everywhere the map reasons. */
  slug: string;
  /** The site in scope, or null for every site the caller may view. */
  siteId?: string | null;
}

export interface TopicPanelHandle {
  close: () => void;
}

/** (map, topic) is the identity of a panel — not the moment it was opened. */
function instanceIdFor(opts: OpenTopicPanelOptions): string {
  return `${opts.mapId}|${opts.slug}`;
}

export function useOpenTopicPanel() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenTopicPanelOptions): TopicPanelHandle => {
      const instanceId = instanceIdFor(opts);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((inst) => inst.instanceId === instanceId)) {
        // This topic is already floating: surface it (un-minimize + raise)
        // rather than re-dispatching into an unchanged pile, which would look
        // to the person like the click did nothing.
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
            mapId: opts.mapId,
            slug: opts.slug,
            siteId: opts.siteId ?? null,
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

/**
 * Declarative form. Renders nothing visible; opens the panel on mount, closes
 * it on unmount.
 */
export function TopicalMapTopicPanelController(
  props: OpenTopicPanelOptions,
): null {
  const open = useOpenTopicPanel();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.mapId, props.slug, props.siteId]);
  return null;
}
