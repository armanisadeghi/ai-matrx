"use client";

import { Eye, Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoPublishDate } from "@/features/files/blocks/video/VideoPublishDate";
import {
  formatYouTubeCount,
  formatYouTubeDuration,
} from "@/features/marketing/discovery/youtube/formatters";
import type { YouTubeVideoIdentity } from "../../service";

/**
 * The compact video-identity line for GENERIC research surfaces: channel,
 * duration, views, subscriber reach, and Gemini processing state — so a video
 * source stops rendering as an anonymous web row. Data comes from the global
 * `research.youtube_video` library via `useYouTubeVideoIndex`. The dedicated
 * Research YouTube surface keeps its richer cards; this is the ambassador.
 */
export function VideoSourceMeta({
  identity,
  className,
}: {
  identity: YouTubeVideoIdentity;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted-foreground",
        className,
      )}
    >
      {identity.channel_title && (
        <span className="font-medium text-foreground/80 truncate max-w-40">
          {identity.channel_title}
        </span>
      )}
      <VideoPublishDate publishedAt={identity.published_at} />
      {identity.duration && (
        <span className="font-mono tabular-nums">
          {formatYouTubeDuration(identity.duration)}
        </span>
      )}
      {identity.view_count != null && (
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
          <Eye className="h-3 w-3" />
          {formatYouTubeCount(identity.view_count)}
        </span>
      )}
      {identity.channel_subscriber_count != null && (
        <span
          className="inline-flex items-center gap-0.5 whitespace-nowrap"
          title={`${identity.channel_subscriber_count.toLocaleString()} channel subscribers`}
        >
          <Users className="h-3 w-3" />
          {formatYouTubeCount(identity.channel_subscriber_count)}
        </span>
      )}
      <VideoProcessingChip status={identity.processing_status} />
    </div>
  );
}

/**
 * Gemini transcript/analysis processing state of a library video. Neutral for
 * "never processed" — that is a normal state, not an error.
 */
export function VideoProcessingChip({
  status,
}: {
  status: string | null;
}) {
  // Live vocabulary on research.youtube_video.processing_status:
  // unprocessed | processing (leased, in flight) | partial | completed | failed.
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 whitespace-nowrap">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Transcribed
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="h-2.5 w-2.5" />
        Partial
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="h-2.5 w-2.5" />
        Processing failed
      </span>
    );
  }
  if (status === "processing" || status === "queued") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Processing
      </span>
    );
  }
  // unprocessed / null / unknown — a normal state, never an error.
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground whitespace-nowrap">
      Not processed
    </span>
  );
}
