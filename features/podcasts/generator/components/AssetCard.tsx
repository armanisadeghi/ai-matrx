"use client";

// features/podcasts/generator/components/AssetCard.tsx
//
// One media slot (image or video). While it renders, the FULL prompt fills the
// tile (so the long description is readable in the space the media will take).
// The instant the asset lands the prompt is replaced by the media itself,
// rendered through the CANONICAL media renderers
// (`UnifiedImageBlockRenderer` / `UnifiedVideoBlockRenderer`) so every done
// asset gets the full rich-media affordances for free: expand → fullscreen,
// the single "…" menu (with download / copy-link / share / open-in-new-tab),
// right-click context menu, and mobile long-press. Podcast-specific actions
// (Use as cover, Regenerate) are folded into that ONE menu via `extraActions`
// — there is no second "…" menu on a done asset.
//
// Per-asset failure is non-fatal: a failed slot keeps its prompt and shows a
// quiet badge with a Retry. Non-done slots still use `AssetActionsMenu` for
// the model picker / edit-description affordance.

import {
  Loader2,
  ImageOff,
  Check,
  Star,
  RotateCcw,
  RefreshCw,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { blockFromMediaRef } from "@/features/files/blocks/adapters/from-media-ref";
import { UnifiedImageBlockRenderer } from "@/features/files/blocks/image/UnifiedImageBlockRenderer";
import { UnifiedVideoBlockRenderer } from "@/features/files/blocks/video/UnifiedVideoBlockRenderer";
import type { MediaExtraAction } from "@/features/files/blocks/actions";
import type { ImageBlock, VideoBlock } from "@/features/files/blocks/types";
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

  // Domain actions folded into the canonical renderer's single "…" menu.
  const extraActions: MediaExtraAction[] = [];
  if (isDone && selectable && slot.kind === "image" && onSelectCover) {
    extraActions.push({
      id: "use-as-cover",
      label: selected ? "Selected as cover" : "Use as cover",
      icon: selected ? <Check /> : <Star />,
      disabled: selected,
      onClick: () => onSelectCover(slot.url!),
    });
  }
  if (isDone && onRegenerate) {
    extraActions.push({
      id: "regenerate",
      label: busy ? "Regenerating…" : "Regenerate",
      icon: <RefreshCw />,
      disabled: busy,
      onClick: () => onRegenerate({ modelAlias: defaultAlias }),
    });
    // Per-model regenerate when multiple internal models exist — kept flat
    // (one row per model) so the canonical menu stays a single level.
    if (modelCount > 1) {
      for (let i = 0; i < modelCount; i++) {
        const alias = `model_${i + 1}`;
        extraActions.push({
          id: `regenerate-${alias}`,
          label: `Regenerate · Model ${i + 1}`,
          icon: <Layers />,
          disabled: busy,
          onClick: () => onRegenerate({ modelAlias: alias }),
        });
      }
    }
  }

  const mediaRef = podcastMediaRef(slot.url);
  const imageBlock = isDone
    ? (blockFromMediaRef(mediaRef, "image") as ImageBlock | null)
    : null;
  const videoBlock = isDone
    ? (blockFromMediaRef(mediaRef, "video") as VideoBlock | null)
    : null;

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

        {/* Per-asset "…" menu — ONLY for non-done slots (the canonical
            renderer owns the menu once media has landed). */}
        {onRegenerate && !isDone && (
          <div className="absolute right-2 top-2 z-30">
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
            className="pointer-events-none absolute bottom-2 left-2 z-20 max-w-[85%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/85 backdrop-blur"
            title={slot.note}
          >
            {slot.note}
          </span>
        )}

        {/* Done — canonical media renderer fills the tile. The renderer
            provides expand/fullscreen + the single "…" menu + mobile
            long-press; podcast actions ride in via `extraActions`. */}
        {isDone && slot.kind === "image" && imageBlock && (
          <div className="absolute inset-0 animate-[fadeIn_0.4s_ease] [&_.group]:m-0 [&_.group]:h-full [&_.group]:w-full [&_.group>img]:h-full [&_.group>img]:w-full [&_.group>img]:object-cover">
            <UnifiedImageBlockRenderer
              block={imageBlock}
              extraActions={extraActions}
            />

            {/* Cover promotion bar — always visible (not hover-gated) so it's
                discoverable. Also available in the "…" menu above. */}
            {selectable && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-2">
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

        {isDone && slot.kind === "video" && videoBlock && (
          <div className="absolute inset-0 animate-[fadeIn_0.4s_ease] bg-black [&_.group]:m-0 [&_.group]:h-full [&_.group]:w-full [&_.group>video]:h-full [&_.group>video]:max-h-none [&_.group>video]:w-full [&_.group>video]:min-h-0 [&_.group>video]:min-w-0 [&_.group>video]:object-cover">
            <UnifiedVideoBlockRenderer
              block={videoBlock}
              extraActions={extraActions}
            />
          </div>
        )}

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
