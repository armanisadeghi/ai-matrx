"use client";

// features/podcasts/generator/components/MetadataHero.tsx
//
// The episode identity. Shimmers while we wait for podcast_metadata, then
// reveals the title + description the instant they parse (well before audio
// finishes). RTL for Persian.

import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PodcastRunState } from "../types";

interface MetadataHeroProps {
  state: PodcastRunState;
}

export function MetadataHero({ state }: MetadataHeroProps) {
  const hasMeta = state.title.trim().length > 0;
  const rtl = state.podcastType === "persian";

  if (!hasMeta) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AudioLines className="h-3.5 w-3.5 animate-pulse text-primary" />
          Composing the episode…
        </div>
        <div className="h-9 w-3/4 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
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
