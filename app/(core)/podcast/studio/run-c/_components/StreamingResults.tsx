"use client";

// app/(core)/podcast/studio/run-c/_components/StreamingResults.tsx
//
// The "results reveal as they stream" panel for run-c. Instead of a blank
// screen until the end, this fills in the moment each piece of state lands:
//   - title + description appear when podcast_metadata arrives
//   - each cover / video slot animates in as its podcast_asset lands
//   - a script sneak-peek shows when create_script finishes
//   - the finished audio player + actions appear on podcast_complete
// Modeled after a build-preview pane (Vercel deploy preview): the artifact
// materializes piece by piece, never a lone spinner.

import { ImageIcon, Clapperboard, FileText, AudioLines, ExternalLink, Sparkles } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import type { MediaSlot, PodcastRunState } from "@/features/podcasts/generator/types";
import { cn } from "@/lib/utils";

export function StreamingResults({ state }: { state: PodcastRunState }) {
  const hasMeta = !!state.title || !!state.description;
  const rtl = state.podcastType === "persian";

  return (
    <div className="space-y-5">
      {/* Title + description — the episode identity, the moment it's known. */}
      {hasMeta ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" />
            Episode
          </div>
          <h2
            className="text-balance text-2xl font-bold tracking-tight text-foreground"
            dir={rtl ? "rtl" : undefined}
          >
            {state.title || "Generating title…"}
          </h2>
          {state.description && (
            <p
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
              dir={rtl ? "rtl" : undefined}
            >
              {state.description}
            </p>
          )}
        </div>
      ) : (
        <MetaPlaceholder />
      )}

      {/* Audio — the finished player once it lands. */}
      {state.audioUrl && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <AudioLines className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Audio ready</div>
            <div className="truncate text-xs text-muted-foreground">
              {state.title}
            </div>
          </div>
          <audio
            controls
            src={state.audioUrl}
            className="h-9 max-w-[220px]"
          />
        </div>
      )}

      {/* Cover art slots */}
      {state.images.length > 0 && (
        <AssetSection
          title="Cover art"
          icon={ImageIcon}
          slots={state.images}
          aspect="aspect-video"
        />
      )}

      {/* Video slots */}
      {state.videos.length > 0 && (
        <AssetSection
          title="Cover video"
          icon={Clapperboard}
          slots={state.videos}
          aspect="aspect-video"
        />
      )}

      {/* Script sneak-peek */}
      {state.scriptPreview && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-blue-500" />
            Script preview
          </div>
          <p
            className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
            dir={rtl ? "rtl" : undefined}
          >
            {state.scriptPreview}
          </p>
        </div>
      )}

      {/* Completion actions */}
      {state.status === "done" && state.episodeSlug && (
        <a
          href={`/podcast/${state.episodeSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
        >
          Open the published episode
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function MetaPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4 animate-pulse" />
        Shaping the episode…
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function AssetSection({
  title,
  icon: Icon,
  slots,
  aspect,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  slots: MediaSlot[];
  aspect: string;
}) {
  const landed = slots.filter((s) => s.status === "done" && s.url).length;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </div>
        <span className="text-xs text-muted-foreground">
          {landed} of {slots.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => (
          <AssetSlot key={slot.index} slot={slot} aspect={aspect} />
        ))}
      </div>
    </div>
  );
}

function AssetSlot({ slot, aspect }: { slot: MediaSlot; aspect: string }) {
  const done = slot.status === "done" && slot.url;
  const failed = slot.status === "failed";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border",
        aspect,
        done ? "border-border" : "border-dashed border-border",
      )}
    >
      {done ? (
        <div className="animate-in fade-in zoom-in-95 duration-500 h-full w-full">
          <InlineMediaRef
            ref={slot.url}
            size="fill"
            fit="cover"
            rounded="none"
            alt={slot.prompt}
          />
        </div>
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-destructive/5 text-center">
          <span className="text-xs font-medium text-destructive/80">
            Couldn&apos;t render
          </span>
        </div>
      ) : (
        // pending / running — a shimmering placeholder with the prompt teased.
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/40">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
          <style>{`@keyframes shimmer{100%{transform:translateX(100%)}}`}</style>
          <span className="px-3 text-center text-[11px] leading-snug text-muted-foreground">
            {slot.prompt ? slot.prompt : "Rendering…"}
          </span>
        </div>
      )}
    </div>
  );
}
