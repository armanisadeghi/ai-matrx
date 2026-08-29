"use client";

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const CmsPageMeasure = lazy(() => import("./CmsPageMeasure"));

/**
 * The one loading front door for the canonical measured-page workspace.
 * Consumers may import this lightweight host, but never the heavy workspace.
 */
export function CmsPageMeasureLazy({ webPageId }: { webPageId: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading the measured page…</span>
        </div>
      }
    >
      <CmsPageMeasure webPageId={webPageId} />
    </Suspense>
  );
}
