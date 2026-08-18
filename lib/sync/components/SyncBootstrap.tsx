"use client";

/**
 * Starts persisted Redux hydration at the first safe lifecycle boundary.
 *
 * The first client render must use the same state as SSR or React cannot
 * hydrate it. A passive effect runs after descendant hydration/layout work,
 * while mounting this component before application children keeps boot ahead
 * of their passive effects. Persisted Redux state is not a pre-paint concern;
 * DOM-only preferences such as theme use SyncBootScript instead.
 */

import { useEffect } from "react";
import { useAppStore } from "@/lib/redux/hooks";

export function SyncBootstrap(): null {
  const store = useAppStore();

  useEffect(() => {
    void store._sync.boot().catch((error: unknown) => {
      // Loud recovery: the store clears its exactly-once guard on rejection,
      // so a later remount can retry instead of silently disabling sync.
      console.error("[sync] post-hydration bootstrap failed", error);
    });
  }, [store]);

  return null;
}
