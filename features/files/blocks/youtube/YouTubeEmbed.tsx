"use client";

import React, { useState } from "react";
import { PlayIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  youTubeEmbedUrl,
  youTubeThumbnail,
  youTubeWatchUrl,
} from "@/lib/media/youtube";

interface YouTubeEmbedProps {
  /** The 11-ish char YouTube video id. */
  videoId: string;
  /** Start offset in whole seconds (the `?t=` / `?start=` token). */
  start?: number;
  /** Accessible label / caption. */
  title?: string;
  /**
   * Poster image to show before play. Defaults to YouTube's `maxres` thumbnail
   * (falls back to `hq` on error). Pass the thumbnail from the source markdown
   * when available so the facade matches what the author embedded.
   */
  poster?: string;
  className?: string;
}

/**
 * The one reusable YouTube embed for the whole app.
 *
 * Click-to-play facade: shows a poster thumbnail + play button and only mounts
 * the (heavy, cookie-laden) YouTube iframe on click — so a page with many
 * videos never loads N players at once, and no YouTube cookies are set until
 * the user actually plays. Uses the privacy-enhanced `youtube-nocookie.com`
 * domain and honors a start offset.
 *
 * Fed by both the markdown `youtube` block (client-detected links) and the
 * server `media_block(kind: "youtube")` render block — one component, one look.
 */
export const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  videoId,
  start,
  title,
  poster,
  className,
}) => {
  const [playing, setPlaying] = useState(false);
  const [posterSrc, setPosterSrc] = useState(
    poster ?? youTubeThumbnail(videoId, "maxres"),
  );
  const label = title || "YouTube video";

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-black",
        className,
      )}
    >
      <div className="relative aspect-video w-full">
        {playing ? (
          <iframe
            src={youTubeEmbedUrl(videoId, { start, autoplay: true })}
            title={label}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Play ${label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterSrc}
              alt={label}
              loading="lazy"
              className="h-full w-full object-cover"
              // maxresdefault.jpg doesn't exist for every video — fall back to hq.
              onError={() => {
                const hq = youTubeThumbnail(videoId, "hq");
                if (posterSrc !== hq) setPosterSrc(hq);
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/0">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors group-hover:bg-red-600">
                <PlayIcon className="ml-0.5 h-7 w-7 fill-white text-white" />
              </span>
            </span>
          </button>
        )}
      </div>
      {title ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <p
            className="flex-1 truncate text-xs text-foreground/80"
            title={title}
          >
            {title}
          </p>
          <a
            href={youTubeWatchUrl(videoId, start)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
            title="Open on YouTube"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </div>
  );
};

export default YouTubeEmbed;
