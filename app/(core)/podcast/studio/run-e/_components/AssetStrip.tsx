"use client";

// app/(core)/podcast/studio/run-e/_components/AssetStrip.tsx
//
// The produced-assets strip — cover art + video slots that fill in as they
// stream from the backend. Empty slots show a pending placeholder so the user
// sees how many assets are coming; landed assets fade in.

import { ImageIcon, Clapperboard, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSlot } from "@/features/podcasts/generator/types";

export function AssetStrip({
  images,
  videos,
}: {
  images: MediaSlot[];
  videos: MediaSlot[];
}) {
  const slots = [...images, ...videos];

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="aspect-video w-28 shrink-0 rounded-lg border border-dashed border-border bg-muted/30"
          />
        ))}
        <p className="text-xs text-muted-foreground">
          Cover art &amp; video appear here as they finish.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-thin pb-1">
      {slots.map((slot) => (
        <AssetTile key={`${slot.kind}-${slot.index}`} slot={slot} />
      ))}
    </div>
  );
}

function AssetTile({ slot }: { slot: MediaSlot }) {
  const Icon = slot.kind === "image" ? ImageIcon : Clapperboard;
  const done = slot.status === "done" && slot.url;

  return (
    <div
      className={cn(
        "group relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg border bg-muted",
        done ? "border-border" : "border-dashed border-border",
      )}
      title={slot.prompt}
    >
      {done ? (
        <img
          src={slot.url!}
          alt={slot.prompt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="runE-shimmer relative flex h-full w-full items-center justify-center">
          {slot.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      )}

      {/* Kind chip */}
      <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
        <Icon className="h-2.5 w-2.5" />
        {slot.kind === "image" ? "Cover" : "Video"}
      </span>
      {done && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}
