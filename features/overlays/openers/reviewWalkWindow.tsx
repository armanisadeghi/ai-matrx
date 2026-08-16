"use client";

/**
 * Opener for the `reviewWalkWindow` overlay (multi-instance).
 *
 * - `useOpenReviewWalkWindow()` — imperative hook. Each walked unit
 *   (unit_kind, unit_id) gets its own deterministic instanceId, so walks on
 *   different messages float side by side while re-opening the SAME unit
 *   focuses the existing window instead of stacking a duplicate.
 * - `<ReviewWalkWindowController />` — declarative wrapper.
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
import type { WalkUnitKind } from "@/features/review-walk/types";

const OVERLAY_ID = "reviewWalkWindow" as const;

export interface OpenReviewWalkWindowOptions {
  unitKind: WalkUnitKind;
  unitId: string;
  /** The agent behind the walked conversation, when known — powers the
   * receipt's door to `/agents/{id}/hindsight`. */
  agentId?: string | null;
  agentName?: string | null;
}

export interface ReviewWalkWindowHandle {
  close: () => void;
}

function instanceIdFor(opts: OpenReviewWalkWindowOptions): string {
  return `review-walk|${opts.unitKind}|${opts.unitId}`;
}

export function useOpenReviewWalkWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenReviewWalkWindowOptions): ReviewWalkWindowHandle => {
      const instanceId = instanceIdFor(opts);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((inst) => inst.instanceId === instanceId)) {
        // Same unit already floating: surface it (un-minimize + raise)
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
            unitKind: opts.unitKind,
            unitId: opts.unitId,
            agentId: opts.agentId ?? null,
            agentName: opts.agentName ?? null,
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

export function ReviewWalkWindowController(
  props: OpenReviewWalkWindowOptions,
): null {
  const open = useOpenReviewWalkWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.unitKind, props.unitId, props.agentId, props.agentName]);
  return null;
}
