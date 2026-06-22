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
  function tracedLoaderFor(attempt: number): DynamicLoader<P> {
    if (typeof loader !== "function") return loader;
    return (() => {
      console.log(
        "[Track Overlay] B2, lazyOverlay.tsx — dynamic import() invoked (fetching chunk)",
        { modulePath, attempt },
      );

      const real = (loader as () => Promise<unknown>)().then((m) => {
        console.log(
          "[Track Overlay] B3, lazyOverlay.tsx — chunk loaded & module resolved",
          { modulePath, attempt },
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
            }). The dynamic import() never resolved — likely a stale build, cached chunk, or deployment skew (?dpl= mismatch).`,
          );
          // Name it ChunkLoadError so detection + messaging treat it as one.
          err.name = "ChunkLoadError";
          console.error(
            "[Track Overlay] B5b, lazyOverlay.tsx — TIMEOUT: rejecting stalled import so the error boundary can catch it",
            { modulePath, attempt, timeoutMs: OVERLAY_LOAD_TIMEOUT_MS },
          );
          reject(err);
        }, OVERLAY_LOAD_TIMEOUT_MS);
      });

      return Promise.race([real, timeout]).finally(() => clearTimeout(timer));
    }) as DynamicLoader<P>;
  }

  // A bare `dynamic()` caches the loadable's import result for the life of the
  // module — so re-mounting after a failure replays the SAME rejection and
  // "Try again" is a no-op. We build a FRESH `dynamic()` per attempt (cached so
  // a given attempt is stable across re-renders) so retry genuinely re-imports.
  const lazyByAttempt = new Map<number, React.ComponentType<P>>();
  function getLazy(attempt: number): React.ComponentType<P> {
    let c = lazyByAttempt.get(attempt);
    if (!c) {
      c = dynamic<P>(tracedLoaderFor(attempt), {
        ssr: false,
        loading: () => <OverlayLoadingFallback modulePath={modulePath} />,
        ...options,
      }) as React.ComponentType<P>;
      lazyByAttempt.set(attempt, c);
    }
    return c;
  }

  function LazyOverlayComponent(props: P) {
    const [attempt, setAttempt] = React.useState(0);
    const Lazy = getLazy(attempt);
    // Every overlay rendered by the OverlayController is handed an `onClose`
    // that dispatches `closeOverlay({overlayId, instanceId})`. The error
    // boundary sits between the controller and the component, so without this
    // the fallback has no way to dismiss the overlay — the user is trapped and
    // forced to reload. Forward it so "Close" actually closes this instance.
    const onClose = (props as { onClose?: () => void } | undefined)?.onClose;
    console.log(
      "[Track Overlay] B1, lazyOverlay.tsx — overlay boundary rendering (mounting lazy child)",
      { modulePath, attempt },
    );
    return (
      <OverlayErrorBoundary
        modulePath={modulePath}
        onClose={typeof onClose === "function" ? onClose : undefined}
        onRetry={() => {
          console.log(
            "[Track Overlay] B8, lazyOverlay.tsx — retry requested, re-importing with fresh loadable",
            { modulePath, nextAttempt: attempt + 1 },
          );
          setAttempt((a) => a + 1);
        }}
      >
        <Lazy {...props} />
      </OverlayErrorBoundary>
    );
  }

  LazyOverlayComponent.displayName = `LazyOverlay(${modulePath ?? "unknown"})`;
  return LazyOverlayComponent;
}

export default lazyOverlay;
