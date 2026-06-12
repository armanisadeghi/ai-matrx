"use client";

// features/podcasts/generator/components/MediaOptionsGrid.tsx
//
// The "options" experience: captioned cover-art and video slots that fill in
// one-by-one, out of order, as podcast_asset events arrive. After the run
// completes, the user picks a favorite cover (writes back to the episode).

import { useEffect, useState } from "react";
import { ImageIcon, Clapperboard, X } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { AssetCard } from "./AssetCard";
import { AddAssetCard } from "./AddAssetCard";
import type { AssetRegenerateOpts } from "./AssetActionsMenu";
import { podcastMediaRef } from "../media";
import type { MediaSlot, PodcastRunState } from "../types";
import type { RunAssetKind } from "@/features/podcasts/studio/runs/run-types";

const VISIBLE_IMAGES = 5;
const VISIBLE_VIDEOS = 2;

interface MediaOptionsGridProps {
  state: PodcastRunState;
  /** Enable cover selection (only meaningful once an episode exists). */
  interactive: boolean;
  selectedCoverUrl: string | null;
  onSelectCover: (url: string) => void;
  /** Per-asset regenerate (enables the "…" menu, Retry, model picker). */
  onRegenerate?: (
    kind: RunAssetKind,
    slot: number,
    opts: AssetRegenerateOpts,
  ) => void;
  /** Add a new asset from a user description (also how you go past 5/2). */
  onAddAsset?: (kind: RunAssetKind, description: string) => void;
  /** Per-slot busy map from useStudioRun ("image:2", "video:new", …). */
  assetBusy?: Record<string, boolean>;
  /** Internal model counts per kind (from the durable record). */
  modelCounts?: { image?: number; video?: number };
  /** Render only one kind's section (so images / videos can be placed apart). */
  only?: "image" | "video";
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
  onRegenerate,
  onAddAsset,
  assetBusy,
  modelCounts,
  only,
}: MediaOptionsGridProps) {
  const [lightbox, setLightbox] = useState<MediaSlot | null>(null);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showAllVideos, setShowAllVideos] = useState(false);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const imagesDone = state.images.filter((s) => s.status === "done").length;
  const videosDone = state.videos.filter((s) => s.status === "done").length;

  const hasImages = state.images.length > 0 && only !== "video";
  const hasVideos = state.videos.length > 0 && only !== "image";

  if (!hasImages && !hasVideos) return null;

  // Per-asset editing is enabled once a regenerate handler is supplied (i.e. the
  // run is loaded + not actively streaming).
  const editable = !!onRegenerate;
  const imageModelCount = modelCounts?.image ?? 0;
  const videoModelCount = modelCounts?.video ?? 0;
  const isBusy = (kind: RunAssetKind, slot: number) =>
    !!assetBusy?.[`${kind}:${slot}`];
  const addBusy = (kind: RunAssetKind) => !!assetBusy?.[`${kind}:new`];

  const imageCard = (slot: MediaSlot) => (
    <AssetCard
      slot={slot}
      label={`Style ${slot.index + 1}`}
      selectable={interactive}
      selected={!!slot.url && slot.url === selectedCoverUrl}
      onSelectCover={onSelectCover}
      onEnlarge={setLightbox}
      onRegenerate={
        onRegenerate
          ? (opts) => onRegenerate("image", slot.index, opts)
          : undefined
      }
      modelCount={imageModelCount}
      busy={isBusy("image", slot.index)}
    />
  );

  const videoCard = (slot: MediaSlot) => (
    <AssetCard
      slot={slot}
      label={`Clip ${slot.index + 1}`}
      onEnlarge={setLightbox}
      onRegenerate={
        onRegenerate
          ? (opts) => onRegenerate("video", slot.index, opts)
          : undefined
      }
      modelCount={videoModelCount}
      busy={isBusy("video", slot.index)}
    />
  );

  const visibleImages =
    editable && !showAllImages
      ? state.images.slice(0, VISIBLE_IMAGES)
      : state.images;
  const visibleVideos =
    editable && !showAllVideos
      ? state.videos.slice(0, VISIBLE_VIDEOS)
      : state.videos;

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
          {!editable && state.images.length === 5 ? (
            // Bento — 2 large + 3 small fills the row cleanly. Live-run view.
            <div className="grid grid-cols-6 gap-3">
              {state.images.map((slot, i) => (
                <div
                  key={`img-${slot.index}`}
                  className={i < 2 ? "col-span-3" : "col-span-2"}
                >
                  {imageCard(slot)}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {visibleImages.map((slot) => (
                <div key={`img-${slot.index}`}>{imageCard(slot)}</div>
              ))}
              {editable &&
                onAddAsset &&
                (showAllImages || state.images.length <= VISIBLE_IMAGES) && (
                  <AddAssetCard
                    kind="image"
                    busy={addBusy("image")}
                    onAdd={(d) => onAddAsset("image", d)}
                  />
                )}
            </div>
          )}
          {editable && state.images.length > VISIBLE_IMAGES && (
            <button
              type="button"
              onClick={() => setShowAllImages((v) => !v)}
              className="mt-3 text-xs font-medium text-primary hover:underline"
            >
              {showAllImages
                ? "Show fewer"
                : `See all ${state.images.length} images`}
            </button>
          )}
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
            {visibleVideos.map((slot) => (
              <div key={`vid-${slot.index}`}>{videoCard(slot)}</div>
            ))}
            {editable &&
              onAddAsset &&
              (showAllVideos || state.videos.length <= VISIBLE_VIDEOS) && (
                <AddAssetCard
                  kind="video"
                  busy={addBusy("video")}
                  onAdd={(d) => onAddAsset("video", d)}
                />
              )}
          </div>
          {editable && state.videos.length > VISIBLE_VIDEOS && (
            <button
              type="button"
              onClick={() => setShowAllVideos((v) => !v)}
              className="mt-3 text-xs font-medium text-primary hover:underline"
            >
              {showAllVideos
                ? "Show fewer"
                : `See all ${state.videos.length} clips`}
            </button>
          )}
        </section>
      )}

      {/* Lightbox — media fills the viewport; chrome floats on top */}
      {lightbox?.url && (
        <div
          className="fixed inset-0 z-[10000] bg-black"
          role="dialog"
          aria-modal="true"
          aria-label={
            lightbox.kind === "video" ? "Clip preview" : "Cover preview"
          }
          onClick={() => setLightbox(null)}
        >
          <div
            className="absolute inset-0"
            onClick={(event) => event.stopPropagation()}
          >
            <InlineMediaRef
              ref={podcastMediaRef(lightbox.url)}
              as={lightbox.kind === "video" ? "video" : undefined}
              size="fill"
              fit="contain"
              rounded="none"
              autoPlay={lightbox.kind === "video"}
              muted={lightbox.kind === "video"}
              loop={lightbox.kind === "video"}
              playsInline={lightbox.kind === "video"}
              controls={lightbox.kind === "video"}
              controlsList={
                lightbox.kind === "video" ? "nofullscreen" : undefined
              }
              preload={lightbox.kind === "video" ? "metadata" : undefined}
              alt={
                lightbox.kind === "video"
                  ? `Clip ${lightbox.index + 1}`
                  : "Cover preview"
              }
              className="h-dvh w-full"
            />
          </div>

          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 z-[10001] flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 transition-colors hover:bg-black hover:ring-white/40"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>

          <span className="pointer-events-none absolute left-4 top-4 z-[10001] rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
            {lightbox.kind === "video"
              ? `Clip ${lightbox.index + 1}`
              : `Style ${lightbox.index + 1}`}
          </span>

          {lightbox.prompt && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 z-[10001] bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-6 pt-10 text-sm text-white/80">
              {lightbox.prompt}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
