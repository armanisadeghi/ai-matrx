"use client";

/**
 * components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx
 *
 * The audio twin of `UnifiedImageBlockRenderer`. `BlockRenderer` hands us the
 * raw `audio_output` / `media_block(kind=audio)` `serverData` and we resolve a
 * DURABLE, playable URL through the universal file handler (`useFileSrc`)
 * before mounting the presentational `<AudioOutputBlock>` player.
 *
 * URL resolution is shared with the video renderer via `buildMediaSource`.
 * See that file (and KNOWN_DEFECTS.md → "Media durability") for the rationale:
 * the old path echoed the raw `data.url`, which (a) didn't play during
 * streaming — Python sends only a `file_id`, no minted URL — and (b) leaked a
 * raw signed S3 URL through "Copy link".
 */

import React, { useEffect } from "react";
import AudioOutputBlock from "./AudioOutputBlock";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { buildMediaSource, pickStr } from "../buildMediaSource";
import { classifyMediaUrl } from "@/lib/media/durability";

export interface AudioOutputBlockRendererProps {
  /** The block's `serverData` — legacy `audio_output` or `media_block(audio)`. */
  data: Record<string, unknown>;
  title?: string;
}

const AudioOutputBlockRenderer: React.FC<AudioOutputBlockRendererProps> = ({
  data,
  title,
}) => {
  const mime = pickStr(data.mimeType) ?? pickStr(data.mime_type);
  const source = buildMediaSource(data, mime);
  const resolvedUrl = useFileSrc(source);

  // Log the raw inbound shape + what we resolved, once per resolved URL. This is
  // a plain `console.log` (NOT `console.error`) on purpose: a still-expiring S3
  // URL here means the AUDIO was persisted private server-side — a known defect
  // (KNOWN_DEFECTS.md → "Media durability"). The proper fix is backend (serve a
  // durable public / our-domain URL); an error overlay on every generation for
  // a tracked backend gap is just noise.
  useEffect(() => {
    if (!resolvedUrl) return;
    console.log("[audio-block] resolved", {
      kind: classifyMediaUrl(resolvedUrl),
      resolvedUrl,
      rawData: data,
    });
  }, [resolvedUrl, data]);

  if (!resolvedUrl) return null;

  return <AudioOutputBlock url={resolvedUrl} mimeType={mime} title={title} />;
};

export default AudioOutputBlockRenderer;
