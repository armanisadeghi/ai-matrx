// features/surfaces/user-state/useSurfaceUserState.ts
//
// Reusable hook for per-user, per-surface state with a global-default fallback.
//
//   const [value, setValue] = useSurfaceUserState("dictionary", surfaceKey, defaults)
//
// Resolution: the surface_key row, falling back to the '_default' row, falling
// back to `defaults`. Writes go to the given surface_key (debounced) so the
// user returns to a surface exactly as they left it. The hook is generic; the
// dictionary feature is its first consumer.

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { DEFAULT_SURFACE_KEY } from "@/features/surfaces/user-state/service";
import {
  ensureSurfaceFeatureLoaded,
  saveSurfaceState,
} from "@/features/surfaces/redux/userStateSlice";

const SAVE_DEBOUNCE_MS = 600;

export function useSurfaceUserState<T extends Record<string, unknown>>(
  feature: string,
  surfaceKey: string,
  defaults: T,
): [T, (next: T | ((prev: T) => T)) => void, { ready: boolean }] {
  const dispatch = useAppDispatch();
  const feat = useAppSelector((s) => s.surfaceUserState.byFeature[feature]);

  useEffect(() => {
    void dispatch(ensureSurfaceFeatureLoaded(feature));
  }, [dispatch, feature]);

  const ready = feat?.status === "ready";

  const value = useMemo<T>(() => {
    const rows = feat?.rows ?? {};
    const resolved = rows[surfaceKey] ?? rows[DEFAULT_SURFACE_KEY] ?? {};
    // Merge over defaults so newly-added keys are always present.
    return { ...defaults, ...(resolved as Partial<T>) };
  }, [feat?.rows, surfaceKey, defaults]);

  // Keep the freshest value in a ref for the functional setter form. Synced in
  // an effect (never written during render) — the setter only runs in event
  // handlers, by which point the effect has committed.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(valueRef.current) : next;
      valueRef.current = resolved;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void dispatch(saveSurfaceState(feature, surfaceKey, resolved));
      }, SAVE_DEBOUNCE_MS);
    },
    [dispatch, feature, surfaceKey],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return [value, setValue, { ready }];
}
