"use client";

/**
 * useOverlay — factory hooks for subscribing to and mutating overlay state.
 *
 * These replace the 98 inline `useAppSelector(s => selectIsOverlayOpen(s, "..."))`
 * + `selectOverlayData(...)` calls in the legacy OverlayController. Each hook
 * subscribes to only the slice it needs, keeping OverlaySurface re-renders
 * tightly scoped per overlay.
 *
 * Signature mirrors the selectors in overlaySlice.ts — a thin, typed wrapper.
 */
import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectIsOverlayOpen,
  selectOpenInstances,
  selectOverlayData,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/overlays/catalogue";

const DEFAULT_INSTANCE_ID = "default";

/** True when the given overlay instance is open. */
export function useOverlayOpen(
  overlayId: OverlayId,
  instanceId: string = DEFAULT_INSTANCE_ID,
): boolean {
  return useAppSelector((s) => selectIsOverlayOpen(s, overlayId, instanceId));
}

/** Data payload for the given overlay instance (null when closed / no data). */
export function useOverlayData<T = unknown>(
  overlayId: OverlayId,
  instanceId: string = DEFAULT_INSTANCE_ID,
): T | null {
  return useAppSelector((s) =>
    selectOverlayData(s, overlayId, instanceId),
  ) as T | null;
}

/**
 * All currently-open instances for a given overlayId.
 *
 * Returns a stable empty-array reference when nothing is open — safe to use
 * in effect deps / memo keys.
 */
export function useOverlayInstances<T = unknown>(
  overlayId: OverlayId,
): Array<{ instanceId: string; data: T | null }> {
  return useAppSelector((s) => selectOpenInstances(s, overlayId)) as Array<{
    instanceId: string;
    data: T | null;
  }>;
}

/**
 * Imperative overlay actions — memoized object so callers can pass it into
 * dependency arrays without re-creating on every render.
 */
export function useOverlayActions() {
  const dispatch = useAppDispatch();
  return useMemo(
    () => ({
      open: (
        overlayId: OverlayId,
        opts: {
          instanceId?: string;
          data?: Record<string, unknown>;
        } = {},
      ) => dispatch(openOverlay({ overlayId, ...opts })),
      close: (overlayId: OverlayId, instanceId: string = DEFAULT_INSTANCE_ID) =>
        dispatch(closeOverlay({ overlayId, instanceId })),
      toggle: (
        overlayId: OverlayId,
        opts: {
          instanceId?: string;
          data?: Record<string, unknown>;
        } = {},
      ) => dispatch(toggleOverlay({ overlayId, ...opts })),
    }),
    [dispatch],
  );
}

/**
 * Single-purpose close handler for a specific overlay instance, memoized so
 * it can be passed as a stable `onClose` prop to a lazy-loaded component.
 */
export function useCloseOverlay(
  overlayId: OverlayId,
  instanceId: string = DEFAULT_INSTANCE_ID,
): () => void {
  const dispatch = useAppDispatch();
  return useCallback(
    () => dispatch(closeOverlay({ overlayId, instanceId })),
    [dispatch, overlayId, instanceId],
  );
}
