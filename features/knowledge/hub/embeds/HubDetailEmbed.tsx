"use client";

/**
 * The full detail screen for a hit, inside the peek (H6b). Only mounted when
 * `embedFor(hit)` found one — the condition is the whole point of the edge.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { ErrorBoundaryWithCapture } from "@/lib/error-boundary/ErrorBoundaryWithCapture";
import { embedKey, type HubEmbed } from "./embedFor";

const HubDetailEmbedsImpl = dynamic(() => import("./HubDetailEmbedsImpl"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> Opening…
    </p>
  ),
});

export function HubDetailEmbed({ embed }: { embed: HubEmbed }) {
  const key = embedKey(embed);
  return (
    <ErrorBoundaryWithCapture
      boundary="KnowledgeHubDetailEmbed"
      relation={key}
      resetKeys={[key]}
      fallback={(error, reset) => (
        <div className="space-y-2 p-4 text-sm" role="alert">
          <p className="text-destructive">This screen failed to draw here: {error.message}</p>
          <p className="text-muted-foreground">Details still has everything the hub knows; Open full opens its own page.</p>
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    >
      <HubDetailEmbedsImpl key={key} embed={embed} />
    </ErrorBoundaryWithCapture>
  );
}
