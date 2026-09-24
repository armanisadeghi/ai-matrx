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

/**
 * The longest boot may be deferred after mount. `load` waits on every image,
 * iframe and font, and idle never comes on a busy main thread, so an unbounded
 * wait left persisted state unread for as long as a page stayed slow (D345).
 * Past this, boot runs anyway and says so.
 */
export const BOOT_DEFER_CAP_MS = 5_000;
/** `requestIdleCallback` deadline so a busy main thread cannot starve boot. */
const IDLE_TIMEOUT_MS = 1_000;

function hasPendingReactBoundary(root: Node): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue === "$?") return true;
    node = walker.nextNode();
  }
  return false;
}

export function SyncBootstrap(): null {
  const store = useAppStore();

  useEffect(() => {
    let cancelled = false;
    let booted = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const start = () => {
      if (cancelled || booted) return;
      booted = true;
      void store._sync.boot().catch((error: unknown) => {
        console.error("[sync] post-hydration bootstrap failed", error);
      });
    };
    const boot = () => {
      if (cancelled || booted) return;
      // Browser idle is only a scheduler hint: streamed Suspense boundaries
      // can still be waiting to hydrate and must see the unpersisted tree.
      if (hasPendingReactBoundary(document)) {
        scheduleIdle();
        return;
      }
      start();
    };
    const scheduleIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(boot, { timeout: IDLE_TIMEOUT_MS });
      } else {
        timeoutHandle = globalThis.setTimeout(boot, 0);
      }
    };

    if (document.readyState === "complete") scheduleIdle();
    else window.addEventListener("load", scheduleIdle, { once: true });

    const capHandle = globalThis.setTimeout(() => {
      if (cancelled || booted) return;
      // LOUD: an automatic intervention — boot is starting before the page
      // reached its safe boundary. A pending boundary may client-render.
      console.warn(
        `[sync] boot deferred ${BOOT_DEFER_CAP_MS}ms without reaching window load + idle ` +
          `(readyState=${document.readyState}, pendingBoundary=${hasPendingReactBoundary(document)}); ` +
          "starting persisted hydration now.",
      );
      start();
    }, BOOT_DEFER_CAP_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleIdle);
      globalThis.clearTimeout(capHandle);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    };
  }, [store]);

  return null;
}
