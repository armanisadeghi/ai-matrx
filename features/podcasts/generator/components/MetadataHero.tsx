"use client";

// features/podcasts/generator/components/MetadataHero.tsx
//
// The episode identity. Shimmers while we wait for podcast_metadata, then
// reveals the title + description the instant they parse (well before audio
// finishes). RTL for Persian.

import { cn } from "@/lib/utils";
import { PodcastCompositionPlaceholder } from "./PodcastCompositionPlaceholder";
import type { PodcastRunState } from "../types";

interface MetadataHeroProps {
  state: PodcastRunState;
}

export function MetadataHero({ state }: MetadataHeroProps) {
  const hasMeta = state.title.trim().length > 0;
  const rtl = state.podcastType === "persian";

  if (!hasMeta) {
    return <PodcastCompositionPlaceholder />;
  }

  return (
    <div className="space-y-3" dir={rtl ? "rtl" : undefined}>
      <h2
        className={cn(
          "bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-2xl font-bold leading-tight text-transparent sm:text-3xl",
        )}
      >
        {state.title}
      </h2>
      {state.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {state.description}
        </p>
      )}
    </div>
  );
}
