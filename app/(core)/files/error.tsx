/**
 * app/(a)/files/error.tsx
 *
 * Client error boundary for the files segment.
 */

"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function CloudFilesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[files] route error:", error);
  }, [error]);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-background">
      <div className="max-w-md w-full rounded-lg border bg-card p-6 shadow-sm space-y-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 className="text-base font-semibold">Couldn&rsquo;t load files</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error.message || "Something went wrong while loading your files."}
          </p>
          {error.digest ? (
            <p className="mt-2 text-[10px] text-muted-foreground font-mono">
              {error.digest}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
