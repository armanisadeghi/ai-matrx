"use client";

// features/podcasts/generator/components/AssetCard.tsx
//
// One media slot (image or video). While it renders, the FULL prompt fills the
// tile (so the long description is readable in the space the media will take).
// The instant the asset lands the prompt is replaced by the media itself —
// images fade in, videos auto-play (muted, looped). Per-asset failure is
// non-fatal: a failed slot keeps its prompt and shows a quiet badge.

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
  const isDone = slot.status === "done" && !!slot.url;

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
        {/* Index pill */}
        <span className="absolute left-2 top-2 z-20 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {label}
        </span>

        {/* Pending / running / failed — the prompt fills the tile */}
        {!isDone && (
          <div
            className={cn(
              "absolute inset-0 flex flex-col bg-gradient-to-br from-muted via-accent/30 to-muted",
              slot.status !== "failed" && "animate-pulse",
            )}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-8">
              <p
                className={cn(
                  "text-[11px] leading-relaxed",
                  slot.status === "failed"
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {slot.prompt || "Preparing…"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1.5 text-[10px] font-medium">
              {slot.status === "failed" ? (
                <>
                  <ImageOff className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span className="text-muted-foreground/70">
                    Couldn&apos;t render
                  </span>
                </>
              ) : slot.status === "running" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-primary">Rendering…</span>
                </>
              ) : (
                <span className="text-muted-foreground">Queued</span>
              )}
            </div>
          </div>
        )}

        {/* Done — media only */}
        {isDone &&
          (slot.kind === "image" ? (
            <div className="absolute inset-0 animate-[fadeIn_0.4s_ease]">
              <InlineMediaRef
                ref={slot.url ?? null}
                size="fill"
                fit="cover"
                alt={label}
                fallback="skeleton"
              />
              {/* Hover overlay */}
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
            </div>
          ) : (
            <video
              src={slot.url ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              className="absolute inset-0 h-full w-full animate-[fadeIn_0.4s_ease] bg-black object-cover"
            />
          ))}

        {/* Selected check (image) */}
        {selected && isDone && (
          <span className="absolute right-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
