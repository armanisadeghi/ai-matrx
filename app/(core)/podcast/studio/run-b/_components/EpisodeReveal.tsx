"use client";

// run-b — the streamed-result reveal (left column).
//
// Requirement: use the streamed info far better — reveal results AS they stream,
// never a blank screen or lone spinner. So this panel progressively fills:
//   • title + description appear the moment podcast_metadata lands;
//   • each cover / video slot shows a shimmering placeholder, then fades in the
//     image the moment its podcast_asset event arrives;
//   • the script preview appears when create_script reports its output;
//   • the finished audio player swaps in on podcast_complete.
//
// It binds to the same PodcastRunState the live run produces.

import Image from "next/image";
import { Headphones, FileText, Sparkles, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PodcastRunState,
  MediaSlot,
} from "@/features/podcasts/generator/types";

export function EpisodeReveal({ state }: { state: PodcastRunState }) {
  const hasTitle = !!state.title;
  const cover =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;

  return (
    <div className="space-y-5">
      {/* Title + cover hero. */}
      <div className="overflow-hidden rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-muted/50">
          {cover ? (
            <Image
              src={cover}
              alt={state.title || "Episode cover"}
              fill
              unoptimized
              className="animate-in fade-in object-cover duration-700"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Shimmer label="Designing the cover art" />
            </div>
          )}
        </div>
        <div className="p-4">
          {hasTitle ? (
            <>
              <h2 className="animate-in fade-in slide-in-from-bottom-1 text-xl font-bold leading-tight tracking-tight text-foreground duration-500">
                {state.title}
              </h2>
              {state.description && (
                <p className="animate-in fade-in mt-1.5 text-sm leading-relaxed text-muted-foreground duration-700">
                  {state.description}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <SkeletonBar className="h-5 w-3/4" />
              <SkeletonBar className="h-3.5 w-full" />
              <SkeletonBar className="h-3.5 w-5/6" />
              <p className="pt-1 text-xs text-muted-foreground">
                Writing the title and summary…
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audio — finished player, or a live "rendering" placeholder. */}
      <div className="rounded-2xl border border-glass-edge bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        <div className="mb-3 flex items-center gap-2">
          <Headphones className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-foreground">Audio</span>
        </div>
        {state.audioUrl ? (
          <audio
            controls
            src={state.audioUrl}
            className="w-full animate-in fade-in duration-700"
          />
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-4">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="text-sm text-muted-foreground">
              The episode audio renders last — it&apos;ll appear here when ready.
            </span>
          </div>
        )}
      </div>

      {/* Cover art gallery (images). */}
      {state.images.length > 0 && (
        <AssetStrip
          icon={Sparkles}
          accent="text-fuchsia-500"
          title="Cover art"
          slots={state.images}
        />
      )}

      {/* Video. */}
      {state.videos.length > 0 && (
        <AssetStrip
          icon={Film}
          accent="text-orange-500"
          title="Video"
          slots={state.videos}
        />
      )}

      {/* Script preview — streams in from create_script's output. */}
      {state.scriptPreview && (
        <div className="rounded-2xl border border-glass-edge bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-foreground">
              Script preview
            </span>
          </div>
          <p className="animate-in fade-in line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground duration-700">
            {state.scriptPreview}
          </p>
        </div>
      )}
    </div>
  );
}

function AssetStrip({
  icon: Icon,
  accent,
  title,
  slots,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  title: string;
  slots: MediaSlot[];
}) {
  const ready = slots.filter((s) => s.status === "done").length;
  return (
    <div className="rounded-2xl border border-glass-edge bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", accent)} />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {ready} / {slots.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {slots.map((slot) => (
          <div
            key={slot.index}
            className="relative aspect-video overflow-hidden rounded-xl bg-muted/50"
          >
            {slot.status === "done" && slot.url ? (
              <Image
                src={slot.url}
                alt={slot.prompt || title}
                fill
                unoptimized
                className="animate-in fade-in zoom-in-95 object-cover duration-700"
              />
            ) : slot.status === "failed" ? (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-destructive/80">
                Couldn&apos;t render
              </div>
            ) : (
              <Shimmer />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Shimmer({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
          style={{ animation: "rb-shimmer 1.6s ease-in-out infinite" }}
        />
      </div>
      {label && (
        <span className="absolute text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-full bg-muted/60", className)}
      style={{ animation: "rb-pulse 1.6s ease-in-out infinite" }}
    />
  );
}
