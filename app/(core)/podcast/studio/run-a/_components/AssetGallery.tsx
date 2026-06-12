"use client";

// app/(core)/podcast/studio/run-a/_components/AssetGallery.tsx
//
// Reveals cover art + video as they STREAM in. A slot is a shimmering
// placeholder while pending/running and crossfades to the real frame the
// moment its asset event lands — so the page is never blank and the user
// watches the deliverables appear one by one.

import { ImageIcon, Clapperboard, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSlot } from "@/features/podcasts/generator/types";

export function AssetGallery({
  images,
  videos,
}: {
  images: MediaSlot[];
  videos: MediaSlot[];
}) {
  if (images.length === 0 && videos.length === 0) return null;

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <Group
          title="Cover art"
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          slots={images}
        />
      )}
      {videos.length > 0 && (
        <Group
          title="Video"
          icon={<Clapperboard className="h-3.5 w-3.5" />}
          slots={videos}
          isVideo
        />
      )}
    </div>
  );
}

function Group({
  title,
  icon,
  slots,
  isVideo = false,
}: {
  title: string;
  icon: React.ReactNode;
  slots: MediaSlot[];
  isVideo?: boolean;
}) {
  const done = slots.filter((s) => s.status === "done").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {done}/{slots.length}
        </span>
      </div>
      <div
        className={cn(
          "grid gap-2.5",
          isVideo ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        {slots.map((slot) => (
          <Slot key={slot.index} slot={slot} isVideo={isVideo} />
        ))}
      </div>
    </div>
  );
}

function Slot({ slot, isVideo }: { slot: MediaSlot; isVideo: boolean }) {
  const ready = slot.status === "done" && slot.url;
  const failed = slot.status === "failed";

  return (
    <div
      className={cn(
        "group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted/40",
      )}
      title={slot.prompt || undefined}
    >
      {ready ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- demo placeholder media only */}
          <img
            src={slot.url!}
            alt={slot.prompt || "Generated asset"}
            className="h-full w-full object-cover duration-500 animate-in fade-in"
          />
          {isVideo && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black">
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </span>
            </span>
          )}
        </>
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          Couldn&apos;t render
        </div>
      ) : (
        // Pending / running — shimmering placeholder.
        <div className="relative h-full w-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-muted/60 to-muted/20" />
          <div className="runa-develop absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
            {isVideo ? (
              <Clapperboard className="h-5 w-5" />
            ) : (
              <ImageIcon className="h-5 w-5" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
