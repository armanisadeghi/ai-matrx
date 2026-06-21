"use client";

/**
 * OverlayLoadingFallback
 *
 * The canonical `loading` component for every lazily-loaded overlay (wired in
 * by {@link lazyOverlay}). Its job: while a `next/dynamic` chunk is in flight
 * the overlay area must NEVER be blank — it shows a centered spinner.
 *
 * It does NOT own the "give up" decision anymore. The previous version swapped
 * to a plain "taking too long" card on a 10s timer — but that card has no admin
 * diagnostics, and a hung import would sit on it forever. Now `lazyOverlay`
 * races the import against a hard timeout that REJECTS, so a stall becomes a
 * real error and the rich, admin-debuggable error fallback takes over. This
 * component only spins and emits a loud early-warning at the stall threshold.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";

const STALL_WARN_MS = 10_000;

export interface OverlayLoadingFallbackProps {
  /** Module path of the chunk being loaded, for the stall log. */
  modulePath?: string | null;
}

export function OverlayLoadingFallback({
  modulePath,
}: OverlayLoadingFallbackProps) {
  React.useEffect(() => {
    console.log(
      "[Track Overlay] B4, OverlayLoadingFallback.tsx — loading fallback shown (chunk in flight)",
      { modulePath: modulePath ?? "unknown" },
    );
    const t = setTimeout(() => {
      // Loud early-warning only — the lazyOverlay timeout (slightly later)
      // converts the stall into a catchable error + rich admin fallback.
      console.error(
        "[Track Overlay] B5, OverlayLoadingFallback.tsx — STALL WARNING: chunk still loading after %dms",
        STALL_WARN_MS,
        { modulePath: modulePath ?? "unknown" },
      );
    }, STALL_WARN_MS);
    return () => clearTimeout(t);
  }, [modulePath]);

  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-border bg-card shadow-[var(--elevation-2)] px-5 py-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading…</span>
        </div>
      </div>
    </div>
  );
}

export default OverlayLoadingFallback;
