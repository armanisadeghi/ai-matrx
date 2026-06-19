"use client";

/**
 * Webpage drawer body — full preview of a single URL reference. Reuses the
 * existing `WebpagePreviewContent`, plus an embedded live preview iframe when
 * the page allows framing (best-effort; many sites block it).
 */

import { WebpagePreviewContent } from "@/features/agents/components/previews/WebpageHoverPreview";
import type { ContextItemBodyProps } from "../types";

export function WebpageBody({ item }: ContextItemBodyProps) {
  const url = item.refs.urls?.[0] ?? null;
  const snippet =
    typeof item.raw === "object" && item.raw
      ? ((item.raw as { preview?: string }).preview ?? null)
      : null;

  if (!url) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No URL on this item.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-4">
        <WebpagePreviewContent url={url} snippet={snippet} />
      </div>
      <iframe
        src={url}
        title={url}
        className="min-h-0 flex-1 w-full bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
