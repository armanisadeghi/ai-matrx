"use client";

/**
 * GeneratedVideoSetBlock — THE renderer for the `generated_video_set` kind.
 * There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (`features/content-ir/FEATURE.md`). Every
 * video node (`ai.generate_video`, `ai.edit_video`, `ai.extend_video`) emits
 * this shape. Need one clip on its own? Import `GeneratedVideoPlayer`. **Do
 * not build a second clip list.**
 *
 * 🚨 MEDIA DURABILITY. Playback goes through `<InlineMediaRef as="video">`
 * with the item's durable handle — `file_id` first, then the permanent CDN
 * URL, then any playable URL (the bridge decides; see
 * `kinds/media-io-shared.ts`). No raw `<video src>`, so an expiring URL
 * re-mints instead of breaking.
 */

import { Film, Loader2 } from "lucide-react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import {
  readGeneratedVideoList,
  type GeneratedVideoData,
  type GeneratedVideoSetData,
} from "@/features/content-ir/kinds/generated-video-set";
import {
  formatCost,
  formatDuration,
  readUsage,
} from "@/features/content-ir/kinds/media-io-shared";
import { cn } from "@/lib/utils";

export interface GeneratedVideoSetBlockProps {
  serverData?: unknown;
  hideHeader?: boolean;
  className?: string;
}

export function readGeneratedVideoSetData(
  serverData: unknown,
): GeneratedVideoSetData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<GeneratedVideoSetData>;
  if (!Array.isArray(candidate.videos)) return null;
  return {
    videos: readGeneratedVideoList(candidate.videos),
    count: typeof candidate.count === "number" ? candidate.count : null,
    model: typeof candidate.model === "string" ? candidate.model : "",
    usage: readUsage(candidate.usage),
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

export function GeneratedVideoPlayer({
  video,
  index,
}: {
  video: GeneratedVideoData;
  index: number;
}) {
  const openFilePreview = useOpenFilePreviewWindow();
  const duration = formatDuration(video.duration_seconds);

  return (
    <figure className="animate-in fade-in min-w-0">
      <InlineMediaRef
        ref={video.handle}
        as="video"
        size="fill"
        fit="contain"
        rounded="md"
        border="subtle"
        controls
        preload="metadata"
        className="aspect-video w-full bg-black"
      />
      <figcaption className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Clip {index + 1}</span>
        {duration && <span className="tabular-nums">{duration}</span>}
        {/* NO DEAD ENDS: a clip with a durable id is a file the user can open. */}
        {video.file_id && (
          <button
            type="button"
            onClick={() => openFilePreview({ fileId: video.file_id })}
            className="rounded text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Open file
          </button>
        )}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// The parent
// ---------------------------------------------------------------------------

export default function GeneratedVideoSetBlock({
  serverData,
  hideHeader = false,
  className,
}: GeneratedVideoSetBlockProps) {
  const data = readGeneratedVideoSetData(serverData);
  if (!data) return null;

  const cost = formatCost(data.usage?.cost_usd ?? null);

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Generated video
          </span>
          {data.videos.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {data.videos.length}
            </span>
          )}
          {data.model && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.model}
            </span>
          )}
          {cost && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {cost}
            </span>
          )}
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rendering
            </span>
          )}
        </div>
      )}

      {data.videos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {data.isComplete ? "No clips were returned." : "Waiting for the first clip…"}
        </p>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            data.videos.length > 1 ? "sm:grid-cols-2" : "sm:max-w-xl",
          )}
        >
          {data.videos.map((video, index) => (
            <GeneratedVideoPlayer
              key={video.file_id ?? video.handle ?? index}
              video={video}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
