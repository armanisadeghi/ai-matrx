"use client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { TapTargetCopyButton } from "@ai-matrx/design-system/tap-target";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Eye,
  MessageCircle,
  ThumbsUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPublishDate } from "@/features/files/blocks/video/VideoPublishDate";
import { youTubeEmbedUrl, youTubeWatchUrl } from "@ai-matrx/rich-content/utils/youtube";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { formatYouTubeCount, formatYouTubeDuration } from "./formatters";
import type { YouTubeVideoCandidate } from "./types";
import { YouTubeResearchActions } from "./YouTubeResearchActions";
import { CanvasPagePanel } from "@/features/canvas/host/pagePanel";

export function YouTubeVideoPreviewContent({
  video,
  action,
}: {
  video: YouTubeVideoCandidate;
  action?: ReactNode;
}) {
  return (
    <>
      <div className="relative aspect-video overflow-hidden rounded-t-3xl bg-black">
        <iframe
          src={youTubeEmbedUrl(video.video_id)}
          title={video.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <VideoPublishDate
          publishedAt={video.published_at}
          className="absolute left-2 top-2 z-10 rounded bg-black/75 px-1.5 py-0.5 text-white shadow-sm"
        />
      </div>
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {video.channel_title ?? "YouTube creator"}
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              {video.title}
            </h1>
          </div>
          {action}
        </div>
        <div className="mt-4 flex items-start gap-2">
          <p /* rich-content-exempt: YouTube descriptions are plain text */ className="min-w-0 flex-1 whitespace-pre-line text-sm leading-6 text-muted-foreground dark:text-zinc-400">
            {video.description || "No description supplied."}
          </p>
          <CopyButtons label="Copy description" human={video.description || "No description supplied."} size="icon" className="h-8 w-8 shrink-0 rounded-lg border border-border px-0 dark:border-white/10" />
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground dark:text-zinc-400">
          <span>
            <Eye className="mr-1 inline h-3.5 w-3.5" />
            {formatYouTubeCount(video.view_count)} views
          </span>
          <span>
            <ThumbsUp className="mr-1 inline h-3.5 w-3.5" />
            {formatYouTubeCount(video.like_count)} likes
          </span>
          <span>
            <Clock3 className="mr-1 inline h-3.5 w-3.5" />
            {formatYouTubeDuration(video.duration)}
          </span>
          <span>
            <MessageCircle className="mr-1 inline h-3.5 w-3.5" />
            {formatYouTubeCount(video.comment_count)} comments
          </span>
          <span>
            <Users className="mr-1 inline h-3.5 w-3.5" />
            {formatYouTubeCount(video.channel_subscriber_count)} subscribers
          </span>
        </div>
        {(video.tags ?? []).length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {(video.tags ?? []).slice(0, 12).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground dark:bg-white/[0.06] dark:text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" asChild>
            <a
              href={youTubeWatchUrl(video.video_id)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on YouTube
            </a>
          </Button>
          <TapTargetCopyButton value={youTubeWatchUrl(video.video_id)} variant="transparent" ariaLabel="Copy YouTube link" tooltip="Copy YouTube link" />
        </div>
        <YouTubeResearchActions
          videoId={video.video_id}
          initialStatus={video.processing_status}
        />
      </div>
    </>
  );
}

/**
 * A discovered video's preview as the page's canvas tab (one per discovery
 * page; picking another video renames the tab and brings it forward). The
 * pane header carries the title, the close and "Open full page".
 */
export function YouTubeVideoPreviewPanel({
  video,
  onClose,
}: {
  video: YouTubeVideoCandidate;
  onClose: () => void;
}) {
  return (
    <CanvasPagePanel
      panelKey="youtube-video-preview"
      title={video.title}
      onClose={onClose}
      headerActions={
        <Link
          href={marketingRoutes.youtubeVideo(video.video_id)}
          className="inline-flex h-6 items-center text-xs leading-none text-muted-foreground hover:text-foreground"
        >
          Open full page
        </Link>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <YouTubeVideoPreviewContent video={video} />
      </div>
    </CanvasPagePanel>
  );
}

export function YouTubeVideoPreviewSurface({
  video,
}: {
  video: YouTubeVideoCandidate;
}) {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground dark:bg-[#07090d] dark:text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Button
          asChild
          variant="quiet"
          className="mb-4"
        >
          <Link href={marketingRoutes.youtubeDiscovery()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to YouTube discovery
          </Link>
        </Button>
        <article className="overflow-hidden rounded-3xl border border-border bg-background shadow-2xl dark:border-white/10 dark:bg-[#0d1015]">
          <YouTubeVideoPreviewContent video={video} />
        </article>
      </div>
    </main>
  );
}
