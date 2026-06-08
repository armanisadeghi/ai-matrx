"use client";

// features/podcasts/generator/components/AssetCard.tsx
//
// One media slot (image or video). Shows a shimmering placeholder while the
// asset renders, then fades in the media the moment it lands — out of order.
// Per-asset failure is non-fatal: a failed slot shows a quiet badge.

import { Loader2, ImageOff, Maximize2, Check, Star } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { cn } from "@/lib/utils";
import type { MediaSlot } from "../types";

interface AssetCardProps {
  slot: MediaSlot;
  label: string;
  /** Cover selection (images only, after the run completes). */
  selectable?: boolean;
  selected?: boolean;
  onSelectCover?: (url: string) => void;
  onEnlarge?: (slot: MediaSlot) => void;
}

export function AssetCard({
  slot,
  label,
  selectable = false,
  selected = false,
  onSelectCover,
  onEnlarge,
}: AssetCardProps) {
  const aspect = slot.kind === "video" ? "aspect-video" : "aspect-square";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-all",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/30",
      )}
    >
      <div className={cn("relative w-full", aspect)}>
        {/* Pending / running — shimmer */}
        {(slot.status === "pending" || slot.status === "running") && (
          <div className="absolute inset-0 flex animate-pulse flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted via-accent/40 to-muted">
            {slot.status === "running" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Rendering…
                </span>
              </>
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground">
                Queued
              </span>
            )}
          </div>
        )}

        {/* Failed */}
        {slot.status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
            <ImageOff className="h-5 w-5 opacity-60" />
            <span className="text-[11px]">Couldn&apos;t render</span>
          </div>
        )}

        {/* Done */}
        {slot.status === "done" && slot.url && (
          <>
            {slot.kind === "image" ? (
              <div className="absolute inset-0 animate-[fadeIn_0.4s_ease]">
                <InlineMediaRef
                  ref={slot.url ?? null}
                  size="fill"
                  fit="cover"
                  alt={label}
                  fallback="skeleton"
                />
              </div>
            ) : (
              <video
                src={slot.url}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-black object-contain"
              />
            )}

            {/* Hover overlay (image only — video needs its own controls) */}
            {slot.kind === "image" && (
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex justify-end p-2">
                  {onEnlarge && (
                    <button
                      type="button"
                      onClick={() => onEnlarge(slot)}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
                      aria-label="Enlarge"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectable && (
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => onSelectCover?.(slot.url!)}
                      className={cn(
                        "pointer-events-auto flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium backdrop-blur transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/90 text-zinc-900 hover:bg-white",
                      )}
                    >
                      {selected ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Cover
                        </>
                      ) : (
                        <>
                          <Star className="h-3.5 w-3.5" />
                          Use as cover
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Index pill */}
        <span className="absolute left-2 top-2 z-10 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {label}
        </span>
        {selected && (
          <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Caption */}
      {slot.prompt && (
        <p className="line-clamp-2 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {slot.prompt}
        </p>
      )}
    </div>
  );
}
