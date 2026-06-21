"use client";

/**
 * OverlayLoadingFallback
 *
 * The canonical `loading` component for every lazily-loaded overlay (wired in
 * by {@link lazyOverlay}). Its job is simple but load-bearing: while a
 * `next/dynamic` chunk is in flight the overlay area must NEVER be blank — it
 * shows a centered spinner.
 *
 * It also closes the "pending forever" hole. The worst production failure mode
 * isn't a rejected import (an error boundary catches that) — it's a chunk
 * request that stalls and never resolves OR rejects. So after a stall
 * threshold this fallback gets LOUD: it swaps to an actionable message with a
 * hard-reload button and a console.error, instead of spinning silently.
 */

import * as React from "react";
import { Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const STALL_MS = 10_000;

export interface OverlayLoadingFallbackProps {
  /** Module path of the chunk being loaded, for the stall message + logs. */
  modulePath?: string | null;
}

export function OverlayLoadingFallback({
  modulePath,
}: OverlayLoadingFallbackProps) {
  const [stalled, setStalled] = React.useState(false);

  React.useEffect(() => {
    console.log(
      "[Track Overlay] B4, OverlayLoadingFallback.tsx — loading fallback shown (chunk in flight)",
      { modulePath: modulePath ?? "unknown" },
    );
    const t = setTimeout(() => {
      setStalled(true);
      // LOUD recovery: a chunk taking this long is a real problem, not a slow
      // network blip. Surface it so it's never an invisible spinner.
      console.error(
        "[Track Overlay] B5, OverlayLoadingFallback.tsx — STALLED: chunk has not loaded after %dms — likely a stalled/failed dynamic import",
        STALL_MS,
        { modulePath: modulePath ?? "unknown" },
      );
    }, STALL_MS);
    return () => clearTimeout(t);
  }, [modulePath]);

  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-border bg-card shadow-[var(--elevation-2)] px-5 py-4 max-w-sm w-full">
        {!stalled ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  This is taking longer than expected
                </p>
                <p className="mt-1 text-muted-foreground">
                  The panel&apos;s code didn&apos;t finish loading. This is
                  usually a stale build or cached file. Reloading the page
                  almost always fixes it.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="default"
                onClick={() => window.location.reload()}
                className="gap-1.5"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reload page
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OverlayLoadingFallback;
