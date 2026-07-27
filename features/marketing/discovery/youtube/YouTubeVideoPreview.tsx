"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  MessageCircle,
  ThumbsUp,
  Users,
} from "lucide-react";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { Button } from "@/components/ui/button";
import { youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/media/youtube";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { formatYouTubeCount } from "./formatters";
import type { YouTubeVideoCandidate } from "./types";

export function YouTubeVideoPreviewContent({
  video,
  action,
}: {
  video: YouTubeVideoCandidate;
  action?: ReactNode;
}) {
  return (
    <>
      <div className="aspect-video overflow-hidden rounded-t-3xl bg-black">
        <iframe
          src={youTubeEmbedUrl(video.video_id)}
          title={video.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
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
          <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-6 text-muted-foreground dark:text-zinc-400">
            {video.description || "No description supplied."}
          </p>
          <CopyButton
            content={video.description || "No description supplied."}
            tooltip="Copy description"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg border border-border px-0 dark:border-white/10"
          />
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
          <Button asChild className="rounded-xl">
            <a
              href={youTubeWatchUrl(video.video_id)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on YouTube
            </a>
          </Button>
          <CopyButton
            content={youTubeWatchUrl(video.video_id)}
            tooltip="Copy YouTube link"
            label="Copy link"
            size="sm"
            className="rounded-xl"
          />
        </div>
      </div>
    </>
  );
}

export function YouTubeVideoPreviewDialog({
  video,
  onClose,
}: {
  video: YouTubeVideoCandidate;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border bg-background text-foreground shadow-2xl dark:border-white/10 dark:bg-[#0d1015] dark:text-zinc-100">
        <YouTubeVideoPreviewContent
          video={video}
          action={
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={marketingRoutes.youtubeVideo(video.video_id)}>
                  Open full page
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-xl border-border dark:border-white/10"
              >
                Close
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}

export function YouTubeVideoPreviewSurface({
  video,
}: {
  video: YouTubeVideoCandidate;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground dark:bg-[#07090d] dark:text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Button
          asChild
          variant="ghost"
          className="mb-4 rounded-xl text-muted-foreground"
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
