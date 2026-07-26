"use client";

/**
 * components/mardown-display/blocks/videos/VideoOutputBlockRenderer.tsx
 *
 * The video twin of `AudioOutputBlockRenderer` / `UnifiedImageBlockRenderer`.
 * `BlockRenderer` hands us the raw `video_output` / `media_block(kind=video)`
 * `serverData`; we resolve a DURABLE, playable URL through the universal file
 * handler identity before mounting the canonical
 * `<UnifiedVideoBlockRenderer>`. Playback, copy, sharing, download, and URL
 * refresh therefore all use the same file-aware action layer.
 *
 * Same rationale as audio (shared `buildMediaSource`): echoing the raw
 * `data.url` didn't play during streaming (Python sends only a `file_id`) and
 * leaked a raw signed S3 URL through "Copy link". The poster URL is resolved
 * the same way. See FOUND_DEFECTS.md → "Media durability".
 */

import React from "react";
import { UnifiedVideoBlockRenderer } from "@/features/files/blocks/video/UnifiedVideoBlockRenderer";
import { videoBlockFromMediaRef } from "@/features/files/blocks/adapters/from-media-ref";
import { isVideoBlock } from "@/features/files/blocks/guards";
import { fileIdToMediaRef, urlToMediaRef } from "@/features/files/redux/converters";
import { buildMediaSource, pickStr } from "../buildMediaSource";

export interface VideoOutputBlockRendererProps {
  /** The block's `serverData` — legacy `video_output` or `media_block(video)`. */
  data: Record<string, unknown>;
}

const VideoOutputBlockRenderer: React.FC<VideoOutputBlockRendererProps> = ({
  data,
}) => {
  if (isVideoBlock(data)) {
    return <UnifiedVideoBlockRenderer block={data} />;
  }

  const mime = pickStr(data.mimeType) ?? pickStr(data.mime_type);
  const source = buildMediaSource(data, mime);
  if (!source) return null;

  const ref =
    source.kind === "file_id"
      ? fileIdToMediaRef(source.fileId, mime)
      : source.kind === "external_url"
        ? urlToMediaRef(source.url, mime)
        : null;
  if (!ref) return null;

  const block = videoBlockFromMediaRef(ref);
  if (!block) return null;

  const posterUrl = pickStr(data.posterUrl) ?? pickStr(data.poster_url) ?? null;
  const fileName = pickStr(data.fileName) ?? pickStr(data.file_name) ?? null;

  return (
    <UnifiedVideoBlockRenderer
      block={{
        ...block,
        posterUrl,
        fileName,
      }}
    />
  );
};

export default VideoOutputBlockRenderer;
