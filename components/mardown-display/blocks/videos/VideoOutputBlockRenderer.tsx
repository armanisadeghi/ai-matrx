"use client";

/**
 * components/mardown-display/blocks/videos/VideoOutputBlockRenderer.tsx
 *
 * The video twin of `AudioOutputBlockRenderer` / `UnifiedImageBlockRenderer`.
 * `BlockRenderer` hands us the raw `video_output` / `media_block(kind=video)`
 * `serverData`; we resolve a DURABLE, playable URL through the universal file
 * handler (`useFileSrc`) before mounting the presentational `<VideoOutputBlock>`.
 *
 * Same rationale as audio (shared `buildMediaSource`): echoing the raw
 * `data.url` didn't play during streaming (Python sends only a `file_id`) and
 * leaked a raw signed S3 URL through "Copy link". The poster URL is resolved
 * the same way. See KNOWN_DEFECTS.md → "Media durability".
 */

import React, { useEffect } from "react";
import VideoOutputBlock from "./VideoOutputBlock";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { buildMediaSource, pickStr } from "../buildMediaSource";
import { classifyMediaUrl } from "@/lib/media/durability";

export interface VideoOutputBlockRendererProps {
  /** The block's `serverData` — legacy `video_output` or `media_block(video)`. */
  data: Record<string, unknown>;
}

const VideoOutputBlockRenderer: React.FC<VideoOutputBlockRendererProps> = ({
  data,
}) => {
  const mime = pickStr(data.mimeType) ?? pickStr(data.mime_type);
  const source = buildMediaSource(data, mime);
  const resolvedUrl = useFileSrc(source);

  // Poster: matrx-owned videos carry `posterUrl` (`Asset.variants.poster_url`).
  // Resolve it through the handler too so it's durable; falls back to whatever
  // poster field is present. A poster is decorative, so we don't block render
  // on it.
  const posterRaw =
    pickStr(data.posterUrl) ?? pickStr(data.poster_url) ?? undefined;
  const posterSource = posterRaw
    ? buildMediaSource({ url: posterRaw }, undefined)
    : null;
  const resolvedPoster = useFileSrc(posterSource);

  // Plain `console.log` (not error) — a still-expiring S3 URL means the video
  // was persisted private server-side (tracked: KNOWN_DEFECTS.md → "Media
  // durability"). Backend fix; no error overlay on a known gap.
  useEffect(() => {
    if (!resolvedUrl) return;
    console.log("[video-block] resolved", {
      kind: classifyMediaUrl(resolvedUrl),
      resolvedUrl,
      rawData: data,
    });
  }, [resolvedUrl, data]);

  if (!resolvedUrl) return null;

  return (
    <VideoOutputBlock
      url={resolvedUrl}
      mimeType={mime}
      posterUrl={resolvedPoster ?? posterRaw}
    />
  );
};

export default VideoOutputBlockRenderer;
