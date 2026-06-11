"use client";

// features/podcasts/generator/components/AssetCard.tsx
//
// One media slot (image or video). While it renders, the FULL prompt fills the
// tile (so the long description is readable in the space the media will take).
// The instant the asset lands the prompt is replaced by the media itself —
// images fade in, videos auto-play (muted, looped). Per-asset failure is
// non-fatal: a failed slot keeps its prompt and shows a quiet badge.

import {
  Loader2,
  ImageOff,
  Maximize2,
  Check,
  Star,
  RotateCcw,
} from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { cn } from "@/lib/utils";
import { podcastMediaRef } from "../media";
import type { MediaSlot } from "../types";
import { AssetActionsMenu, type AssetRegenerateOpts } from "./AssetActionsMenu";

interface AssetCardProps {
  slot: MediaSlot;
  label: string;
  /** Cover selection (images only, after the run completes). */
  selectable?: boolean;
  selected?: boolean;
  onSelectCover?: (url: string) => void;
  onEnlarge?: (slot: MediaSlot) => void;
  /** Per-asset regenerate (enables the "…" menu + Retry). */
  onRegenerate?: (opts: AssetRegenerateOpts) => void;
  /** Number of internal models available (drives the model picker). */
  modelCount?: number;
  /** This slot is currently (re)generating. */
  busy?: boolean;
}

export function AssetCard({
  slot,
  label,
  selectable = false,
  selected = false,
  onSelectCover,
  onEnlarge,
  onRegenerate,
  modelCount = 0,
  busy = false,
}: AssetCardProps) {
  const aspect = slot.kind === "video" ? "aspect-video" : "aspect-square";
  const isDone = slot.status === "done" && !!slot.url;
  const defaultAlias =
    modelCount > 0 && slot.index < modelCount
      ? `model_${slot.index + 1}`
      : "model_1";

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

        {/* Per-asset "…" menu — always visible when there's no media to hover. */}
        {onRegenerate && (
          <div
            className={cn(
              "absolute right-2 top-2 z-30 transition-opacity",
              isDone ? "opacity-0 group-hover:opacity-100" : "opacity-100",
            )}
          >
            <AssetActionsMenu
              kind={slot.kind}
              slot={slot.index}
              modelCount={modelCount}
              currentPrompt={slot.prompt}
              busy={busy}
              onRegenerate={onRegenerate}
            />
          </div>
        )}

        {/* Busy overlay while (re)generating this slot. */}
        {busy && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}

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
                  {onRegenerate && (
                    <button
                      type="button"
                      onClick={() => onRegenerate({ modelAlias: defaultAlias })}
                      disabled={busy}
                      className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
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

        {/* Quiet informational chip on a successful asset (e.g. the primary
            model was rejected and a backup rendered it) — never error styling. */}
        {isDone && slot.note && (
          <span
            className="absolute bottom-2 left-2 z-20 max-w-[85%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/85 backdrop-blur"
            title={slot.note}
          >
            {slot.note}
          </span>
        )}

        {/* Done — media only */}
        {isDone &&
          (slot.kind === "image" ? (
            <div className="absolute inset-0 animate-[fadeIn_0.4s_ease]">
              <InlineMediaRef
                ref={podcastMediaRef(slot.url)}
                size="fill"
                fit="cover"
                alt={label}
                fallback="skeleton"
              />
              {/* Enlarge — revealed on hover (top row, offset clear of the "…" menu). */}
              {onEnlarge && (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 flex justify-end bg-gradient-to-b from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100",
                    onRegenerate && "pr-11",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onEnlarge(slot)}
                    className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
                    aria-label="Enlarge"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Cover promotion — always visible (not hover-gated) so it's
                  discoverable. Selected reads as a solid primary bar. */}
              {selectable && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <button
                    type="button"
                    onClick={() => onSelectCover?.(slot.url!)}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium backdrop-blur transition-colors",
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
          ) : (
            <InlineMediaRef
              ref={podcastMediaRef(slot.url)}
              as="video"
              size="fill"
              fit="cover"
              rounded="none"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              fallback="skeleton"
              className="absolute inset-0 animate-[fadeIn_0.4s_ease] bg-black"
              alt={label}
            />
          ))}

        {/* Selected indicator (image) — bottom-left, only when there's no
            always-visible cover bar (which already says "Cover"). The primary
            ring also signals selection. */}
        {selected && isDone && !selectable && (
          <span className="absolute bottom-2 left-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
