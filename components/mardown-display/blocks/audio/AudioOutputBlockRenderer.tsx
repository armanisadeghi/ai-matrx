"use client";

/**
 * components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx
 *
 * The audio twin of `UnifiedImageBlockRenderer`. `BlockRenderer` hands us the
 * raw `audio_output` / `media_block(kind=audio)` `serverData` and we resolve a
 * DURABLE, playable URL through the universal file handler before mounting the
 * presentational `<AudioOutputBlock>` player.
 *
 * Why this exists (the bug it kills):
 *   - The old path passed the raw `data.url` straight to the player. During
 *     streaming that field is empty/stale (Python now sends a `file_id`, not a
 *     minted URL), so audio either didn't render or didn't play.
 *   - When it *did* carry a URL, that URL was a raw signed S3 link — which then
 *     leaked through the player's "Copy link" button. Per the media-durability
 *     doctrine (see CLAUDE.md → "Media durability"), a raw S3 URL must NEVER be
 *     rendered or revealed; owned/public media is served via the handler, which
 *     prefers the public CDN URL and re-mints expiring URLs from `file_id`.
 *
 * Resolution flows entirely through `useFileSrc` (the same lane images use), so
 * public audio yields a permanent CDN URL and private audio yields a fresh
 * signed URL the player can actually load. If the handler can only produce a
 * raw expiring S3 URL we scream via `reportMediaDurabilityViolation` (loud
 * recovery) so the server-side persistence bug gets fixed — we never paper over
 * it silently.
 */

import React, { useEffect } from "react";
import AudioOutputBlock from "./AudioOutputBlock";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { FileSource } from "@/features/files/handler/types";
import {
  fileIdFromUserFilesUrl,
  classifyMediaUrl,
  isDurableMediaUrl,
} from "@/lib/media/durability";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Best-effort recovery of a cld_files `file_id` from any URL/URI shape so the
 * handler can re-mint a durable URL instead of us echoing a raw S3 link:
 *   - our user-files signed S3 URL (`…/{user_id}/{file_id}?…`)
 *   - an `s3://bucket/{user_id}/{file_id}/…` canonical URI
 *   - any path that ends in a `{uuid}.{ext}` segment
 */
function fileIdFromAnyUri(uri: string): string | null {
  const fromUrl = fileIdFromUserFilesUrl(uri);
  if (fromUrl) return fromUrl;
  const segs = uri.split(/[/?#]/).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const bare = segs[i].split(".")[0];
    if (UUID_RE.test(bare)) return bare;
  }
  return null;
}

/**
 * Build the strongest `FileSource` we can from the block's `serverData`.
 * Identity (`file_id` / `file_uri`) beats opaque URLs so the handler always
 * picks the durable lane when possible.
 */
function buildAudioSource(
  sd: Record<string, unknown>,
  mime?: string,
): FileSource | null {
  const directId = pickStr(sd.fileId) ?? pickStr(sd.file_id);
  if (directId && UUID_RE.test(directId)) {
    return { kind: "file_id", fileId: directId, mime };
  }

  const urlish = [
    pickStr(sd.cdnUrl) ?? pickStr(sd.cdn_url),
    pickStr(sd.signedUrl) ?? pickStr(sd.signed_url),
    pickStr(sd.downloadUrl) ?? pickStr(sd.download_url),
    pickStr(sd.url) ?? pickStr(sd.file_url),
    pickStr(sd.fileUri) ?? pickStr(sd.file_uri),
    pickStr(sd.canonicalFileUri) ?? pickStr(sd.canonical_file_uri),
    pickStr(sd.externalUrl) ?? pickStr(sd.external_url),
  ].filter((u): u is string => !!u);

  // 1. Recover a file_id from any URL/URI → handler mints durable.
  for (const cand of urlish) {
    const id = fileIdFromAnyUri(cand);
    if (id) return { kind: "file_id", fileId: id, mime };
  }

  // 2. Canonical file_uri → handler resolves to a durable URL.
  const fileUri =
    pickStr(sd.fileUri) ??
    pickStr(sd.file_uri) ??
    pickStr(sd.canonicalFileUri) ??
    pickStr(sd.canonical_file_uri);
  if (fileUri) return { kind: "file_uri", fileUri, mime };

  // 3. A durable (non-expiring) public/CDN/external URL → safe to use as-is.
  const durable = urlish.find((u) => isDurableMediaUrl(u));
  if (durable) return { kind: "external_url", url: durable, mime };

  // 4. Last resort: an expiring URL with no recoverable identity. Still try to
  //    play it (the durability gap is tracked as a known defect, see below).
  const last = urlish[0];
  if (last) return { kind: "external_url", url: last, mime };

  return null;
}

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
  const source = buildAudioSource(data, mime);
  const resolvedUrl = useFileSrc(source);

  // Log the raw inbound shape + what we resolved, once per resolved URL. This is
  // a plain `console.log` (NOT `console.error`) on purpose: a still-expiring S3
  // URL here means the AUDIO was persisted private server-side — a known defect
  // (see KNOWN_DEFECTS.md → "AI audio served as raw signed S3 URL"). The proper
  // fix is backend (serve a durable public / our-domain URL); screaming with an
  // error overlay on every generation for a tracked backend gap is just noise.
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
