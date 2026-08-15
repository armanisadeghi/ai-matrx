"use client";

/**
 * Starts persisted Redux hydration at the first safe lifecycle boundary.
 *
 * The first client render must use the same state as SSR or React cannot
 * hydrate it. A layout effect runs only after that match has committed, while
 * mounting this component before application children keeps boot ahead of
 * their passive effects and before the browser paints the restored state.
 */

import { useLayoutEffect } from "react";
import { useAppStore } from "@/lib/redux/hooks";

export function SyncBootstrap(): null {
  const store = useAppStore();

  useLayoutEffect(() => {
    void store._sync.boot().catch((error: unknown) => {
      // Loud recovery: the store clears its exactly-once guard on rejection,
      // so a later remount can retry instead of silently disabling sync.
      console.error("[sync] post-hydration bootstrap failed", error);
    });
  }, [store]);

  return null;
}
