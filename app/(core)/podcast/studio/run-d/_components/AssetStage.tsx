"use client";

// app/(core)/podcast/studio/run-d/_components/AssetStage.tsx
//
// The "stage" — where the produced assets materialize live as the pipeline
// runs. Reference: a render-farm / export preview. Cover-art slots shimmer while
// rendering then pop in; the title/description type in from the metadata burst;
// the script preview and source preview reveal as those stages finish. Empty,
// pre-metadata state shows a calm placeholder grid (never a blank panel).

import { useState } from "react";
import {
  ImageIcon,
  Clapperboard,
  AlertTriangle,
  FileText,
  Telescope,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSlot, PodcastRunState } from "@/features/podcasts/generator/types";

interface AssetStageProps {
  state: PodcastRunState;
}

export function AssetStage({ state }: AssetStageProps) {
  const hasMeta = Boolean(state.title);
  const slots = [...state.images, ...state.videos];

  return (
    <div className="space-y-4">
      {/* Title / description as it arrives */}
      <div className="rounded-2xl border border-border bg-card p-4">
        {hasMeta ? (
          <div className="sd-pop">
            <h2 className="text-lg font-semibold leading-snug text-foreground">
              {state.title}
            </h2>
            {state.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {state.description}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted/70" />
            <div className="h-3.5 w-5/6 animate-pulse rounded bg-muted/70" />
            <p className="pt-1 text-xs text-muted-foreground">
              Title and concept land once the script is written…
            </p>
          </div>
        )}
      </div>

      {/* Asset slot grid */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          Cover art & video
        </div>
        {slots.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <PlaceholderSlot key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {slots.map((slot) => (
              <AssetSlot key={`${slot.kind}-${slot.index}`} slot={slot} />
            ))}
          </div>
        )}
      </div>

      {/* Script preview */}
      {state.scriptPreview && (
        <PreviewBlock
          icon={FileText}
          title="Script preview"
          body={state.scriptPreview}
          mono
        />
      )}

      {/* Source/research preview */}
      {state.sourcePreview && !state.scriptPreview && (
        <PreviewBlock
          icon={Telescope}
          title="What we found"
          body={state.sourcePreview}
        />
      )}
    </div>
  );
}

function PlaceholderSlot() {
  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
      <div className="flex h-full items-center justify-center text-muted-foreground/50">
        <ImageIcon className="h-6 w-6" />
      </div>
    </div>
  );
}

function AssetSlot({ slot }: { slot: MediaSlot }) {
  const [loaded, setLoaded] = useState(false);
  const isVideo = slot.kind === "video";

  if (slot.status === "failed") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-destructive/30 bg-destructive/5 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <span className="text-[11px] text-destructive">Couldn&apos;t render</span>
      </div>
    );
  }

  if (slot.status === "done" && slot.url) {
    return (
      <div className="sd-pop group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
        <img
          src={slot.url}
          alt={slot.prompt || `${slot.kind} ${slot.index + 1}`}
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
        {!loaded && <span className="sd-shimmer absolute inset-0 text-foreground" />}
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        )}
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-sm">
          {isVideo ? (
            <Clapperboard className="h-3 w-3" />
          ) : (
            <ImageIcon className="h-3 w-3" />
          )}
          {isVideo ? "Video" : `Art ${slot.index + 1}`}
        </span>
      </div>
    );
  }

  // pending / running
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted/40 text-muted-foreground">
      <span className="sd-shimmer absolute inset-0 text-foreground" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        {isVideo ? (
          <Clapperboard className="h-5 w-5 opacity-60" />
        ) : (
          <ImageIcon className="h-5 w-5 opacity-60" />
        )}
        <span className="text-[10px]">
          {slot.status === "running" ? "Rendering…" : "Queued"}
        </span>
      </div>
    </div>
  );
}

function PreviewBlock({
  icon: Icon,
  title,
  body,
  mono = false,
}: {
  icon: typeof FileText;
  title: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <div className="sd-pop rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <p
        className={cn(
          "max-h-40 overflow-hidden whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          mono && "font-mono text-[13px]",
        )}
      >
        {body}
      </p>
    </div>
  );
}
