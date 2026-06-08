"use client";

// features/podcasts/generator/components/MediaOptionsGrid.tsx
//
// The "options" experience: captioned cover-art and video slots that fill in
// one-by-one, out of order, as podcast_asset events arrive. After the run
// completes, the user picks a favorite cover (writes back to the episode).

import { useState } from "react";
import { ImageIcon, Clapperboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineMediaRef } from "@/features/files";
import { AssetCard } from "./AssetCard";
import type { MediaSlot, PodcastRunState } from "../types";

interface MediaOptionsGridProps {
  state: PodcastRunState;
  /** Enable cover selection (only meaningful once an episode exists). */
  interactive: boolean;
  selectedCoverUrl: string | null;
  onSelectCover: (url: string) => void;
}

function SectionHeader({
  icon: Icon,
  title,
  done,
  total,
}: {
  icon: typeof ImageIcon;
  title: string;
  done: number;
  total: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      <span className="text-xs tabular-nums text-muted-foreground">
        {done}/{total} ready
      </span>
    </div>
  );
}

export function MediaOptionsGrid({
  state,
  interactive,
  selectedCoverUrl,
  onSelectCover,
}: MediaOptionsGridProps) {
  const [lightbox, setLightbox] = useState<MediaSlot | null>(null);

  const imagesDone = state.images.filter((s) => s.status === "done").length;
  const videosDone = state.videos.filter((s) => s.status === "done").length;

  const hasImages = state.images.length > 0;
  const hasVideos = state.videos.length > 0;

  if (!hasImages && !hasVideos) return null;

  return (
    <div className="space-y-6">
      {hasImages && (
        <section>
          <SectionHeader
            icon={ImageIcon}
            title="Cover art options"
            done={imagesDone}
            total={state.images.length}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {state.images.map((slot) => (
              <AssetCard
                key={`img-${slot.index}`}
                slot={slot}
                label={`Style ${slot.index + 1}`}
                selectable={interactive}
                selected={!!slot.url && slot.url === selectedCoverUrl}
                onSelectCover={onSelectCover}
                onEnlarge={setLightbox}
              />
            ))}
          </div>
        </section>
      )}

      {hasVideos && (
        <section>
          <SectionHeader
            icon={Clapperboard}
            title="Video options"
            done={videosDone}
            total={state.videos.length}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {state.videos.map((slot) => (
              <AssetCard
                key={`vid-${slot.index}`}
                slot={slot}
                label={`Clip ${slot.index + 1}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">Cover preview</DialogTitle>
          {lightbox?.url && (
            <div className="flex flex-col">
              <div className="relative aspect-square w-full bg-black">
                <InlineMediaRef
                  ref={lightbox.url ?? null}
                  size="fill"
                  fit="contain"
                  alt="Cover preview"
                />
              </div>
              {lightbox.prompt && (
                <p className="border-t border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  {lightbox.prompt}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
