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
 * signature (drop-in replacement) and guarantees:
 *   1. `ssr: false` — overlays are client-only.
 *   2. A canonical loading fallback (with a stall watchdog) — never blank while
 *      loading. Pass your own `loading` to override per-overlay.
 *   3. A per-render error boundary that catches ChunkLoadError / render throws
 *      and shows the canonical, admin-debuggable error fallback.
 *   4. A LOAD TIMEOUT. The worst prod failure mode is an `import()` that never
 *      resolves AND never rejects — a hung promise. That isn't an error, so an
 *      error boundary alone can't catch it. We race the import against a timeout
 *      that REJECTS, converting a stall into a real error so the rich admin
 *      error fallback always fires. (Confirmed in prod: B2 fired, B3 never did.)
 *
 * The result: an overlay rendered through `lazyOverlay` renders the component,
 * a loading state, or a meaningful error — never nothing.
 *
 * `modulePath` can't be reliably recovered from the loader's source (the
 * compiler rewrites `import("…")`, so `Function.toString()` no longer contains
 * the literal). Pass an explicit `modulePath` hint (3rd arg) so diagnostics and
 * the "Copy for AI" payload name the failing module. Without it, the full Redux
 * dump still identifies the overlay via its open instance.
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

/** How long an overlay's dynamic import may hang before we treat it as failed. */
export const OVERLAY_LOAD_TIMEOUT_MS = 12_000;

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
  modulePathHint?: string,
): React.ComponentType<P> {
  const modulePath = modulePathHint ?? extractModulePath(loader);

  // Wrap the loader to (a) trace the actual chunk fetch + resolution and (b)
  // race it against a timeout that REJECTS. The gap between B2 (import invoked)
  // and B3 (resolved) is exactly where prod chunk-load failures hide — and when
  // the promise hangs forever, the timeout turns it into a catchable error.
  const tracedLoader =
    typeof loader === "function"
      ? ((() => {
          console.log(
            "[Track Overlay] B2, lazyOverlay.tsx — dynamic import() invoked (fetching chunk)",
            { modulePath },
          );

          const real = (loader as () => Promise<unknown>)().then((m) => {
            console.log(
              "[Track Overlay] B3, lazyOverlay.tsx — chunk loaded & module resolved",
              { modulePath },
            );
            return m;
          });
          // Swallow a late rejection if the timeout already won the race, so it
          // doesn't surface as an unhandled rejection. (race() still settles.)
          real.catch(() => {});

          let timer: ReturnType<typeof setTimeout>;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              const err = new Error(
                `Overlay chunk did not load within ${OVERLAY_LOAD_TIMEOUT_MS}ms (module: ${
                  modulePath ?? "unknown"
                }). The dynamic import() never resolved — likely a stale build, cached chunk, or fragmented chunk graph.`,
              );
              // Name it ChunkLoadError so detection + messaging treat it as one.
              err.name = "ChunkLoadError";
              console.error(
                "[Track Overlay] B5b, lazyOverlay.tsx — TIMEOUT: rejecting stalled import so the error boundary can catch it",
                { modulePath, timeoutMs: OVERLAY_LOAD_TIMEOUT_MS },
              );
              reject(err);
            }, OVERLAY_LOAD_TIMEOUT_MS);
          });

          return Promise.race([real, timeout]).finally(() =>
            clearTimeout(timer),
          );
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
