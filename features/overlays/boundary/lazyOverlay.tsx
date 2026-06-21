"use client";

/**
 * lazyOverlay — the canonical replacement for `next/dynamic` in the
 * OverlayController.
 *
 * Every overlay is code-split with `next/dynamic({ ssr: false })` (this is
 * REQUIRED — without it the app's initial bundle would be unusable). The
 * recurring production bug is not the splitting itself; it's that a bare
 * `dynamic()` has no loading state and no error boundary, so a failed/stalled
 * chunk renders NOTHING and fails silently.
 *
 * `lazyOverlay` makes that structurally impossible. It mirrors the `dynamic()`
 * signature 1:1 (drop-in replacement) and guarantees three things for free:
 *   1. `ssr: false` — overlays are client-only.
 *   2. A canonical loading fallback (with a stall watchdog) — never blank while
 *      loading. Pass your own `loading` to override per-overlay.
 *   3. A per-render error boundary that catches ChunkLoadError / render throws
 *      and shows the canonical, admin-debuggable error fallback.
 *
 * The result: an overlay rendered through `lazyOverlay` renders the component,
 * the loading state, or a meaningful error — never nothing.
 *
 * IMPORTANT: do not nest `lazyOverlay`/`dynamic({ssr:false})` boundaries down a
 * single render path. One `ssr:false` boundary protects everything beneath it;
 * nesting them is what fragments the chunk graph and causes the intermittent
 * production failures this primitive exists to surface.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { OverlayErrorBoundary } from "@/features/overlays/boundary/OverlayErrorBoundary";
import { OverlayLoadingFallback } from "@/features/overlays/boundary/OverlayLoadingFallback";

/** Best-effort extraction of the dynamic import path for diagnostics. */
function extractModulePath(loader: unknown): string | null {
  try {
    const src =
      typeof loader === "function"
        ? Function.prototype.toString.call(loader)
        : "";
    const match = src.match(/import\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

type DynamicLoader<P> = Parameters<typeof dynamic<P>>[0];
type DynamicOpts<P> = Parameters<typeof dynamic<P>>[1];

export function lazyOverlay<P extends object = Record<string, never>>(
  loader: DynamicLoader<P>,
  options?: DynamicOpts<P>,
): React.ComponentType<P> {
  const modulePath = extractModulePath(loader);

  // Wrap the loader so we can trace the actual chunk fetch + resolution. The
  // gap between B2 (import invoked) and B3 (resolved) is exactly where prod
  // chunk-load failures hide — if B2 logs but B3 never does, the chunk
  // stalled/failed (the boundary's loading watchdog + error boundary catch it).
  const tracedLoader =
    typeof loader === "function"
      ? ((() => {
          console.log(
            "[Track Overlay] B2, lazyOverlay.tsx — dynamic import() invoked (fetching chunk)",
            { modulePath },
          );
          return (loader as () => Promise<unknown>)().then((m) => {
            console.log(
              "[Track Overlay] B3, lazyOverlay.tsx — chunk loaded & module resolved",
              { modulePath },
            );
            return m;
          });
        }) as DynamicLoader<P>)
      : loader;

  const Lazy = dynamic<P>(tracedLoader, {
    ssr: false,
    loading: () => <OverlayLoadingFallback modulePath={modulePath} />,
    ...options,
  }) as React.ComponentType<P>;

  function LazyOverlayComponent(props: P) {
    console.log(
      "[Track Overlay] B1, lazyOverlay.tsx — overlay boundary rendering (mounting lazy child)",
      { modulePath },
    );
    return (
      <OverlayErrorBoundary modulePath={modulePath}>
        <Lazy {...props} />
      </OverlayErrorBoundary>
    );
  }

  LazyOverlayComponent.displayName = `LazyOverlay(${modulePath ?? "unknown"})`;
  return LazyOverlayComponent;
}

export default lazyOverlay;
