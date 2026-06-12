"use client";

// app/(core)/podcast/studio/run-f/_components/AssetGallery.tsx
//
// Partial results streaming in as they land — the cover-art and video slots.
// A slot is a soft shimmering placeholder while rendering, then flips to the
// real image the moment its asset event arrives. Empty until the art act seeds
// its first slot, so it never shows a barren grid up front.

import Image from "next/image";
import { ImageIcon, Clapperboard, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoothState, MediaSlot } from "./boothState";

export function AssetGallery({ state }: { state: BoothState }) {
  const slots = [...state.images, ...state.videos];
  if (slots.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Produced assets</h3>
        <span className="text-xs text-muted-foreground">
          {slots.filter((s) => s.status === "done").length}/{slots.length} ready
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((slot) => (
          <AssetTile key={`${slot.kind}-${slot.index}`} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function AssetTile({ slot }: { slot: MediaSlot }) {
  const Icon = slot.kind === "video" ? Clapperboard : ImageIcon;
  const ready = slot.status === "done" && slot.url;

  return (
    <figure className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
      {ready ? (
        <>
          <Image
            src={slot.url!}
            alt={slot.prompt || `${slot.kind} ${slot.index + 1}`}
            fill
            sizes="(max-width: 640px) 50vw, 200px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
          {slot.kind === "video" && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-md">
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </span>
            </span>
          )}
          <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-accent/40" />
          <Icon className="relative h-5 w-5 animate-pulse text-muted-foreground" />
          <span className="relative text-[11px] font-medium text-muted-foreground">
            Rendering…
          </span>
        </div>
      )}
    </figure>
  );
}
