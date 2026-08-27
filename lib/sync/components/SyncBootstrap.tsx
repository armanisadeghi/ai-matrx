"use client";

/**
 * Starts persisted Redux hydration at the first safe lifecycle boundary.
 *
 * The first client render must use the same state as SSR or React cannot
 * hydrate it. A parent passive effect is not a sufficient boundary: streamed
 * Suspense descendants may still be selectively hydrating when it runs. Boot
 * therefore waits for window load and the browser's next idle turn. Persisted
 * Redux state is not a pre-paint concern; DOM-only preferences such as theme
 * use SyncBootScript instead.
 */

import { useEffect } from "react";
import { useAppStore } from "@/lib/redux/hooks";

export function SyncBootstrap(): null {
  const store = useAppStore();

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const boot = () => {
      if (cancelled) return;
      void store._sync.boot().catch((error: unknown) => {
        console.error("[sync] post-hydration bootstrap failed", error);
      });
    };
    const scheduleIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(boot);
      } else {
        timeoutHandle = globalThis.setTimeout(boot, 0);
      }
    };

    if (document.readyState === "complete") scheduleIdle();
    else window.addEventListener("load", scheduleIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleIdle);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    };
  }, [store]);

  return null;
}
