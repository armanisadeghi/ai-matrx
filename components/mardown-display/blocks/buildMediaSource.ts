/**
 * components/mardown-display/blocks/buildMediaSource.ts
 *
 * Shared URL-resolution for the chat media output-block renderers
 * (`AudioOutputBlockRenderer`, `VideoOutputBlockRenderer`). Turns the raw
 * `serverData` of an `audio_output` / `video_output` / `media_block` render
 * block into the strongest `FileSource` we can, so the universal file handler
 * (`useFileSrc`) resolves a DURABLE, playable URL — preferring the public/CDN
 * URL and resolving from `file_id` — instead of echoing a raw legacy URL.
 *
 * Why this exists: the old renderers passed the raw `data.url` straight to the
 * player. During streaming Python sends only a `file_id` (no minted URL) so it
 * didn't play; when a URL was present it was a raw signed S3 link that leaked
 * through "Copy link". Routing through the handler fixes both. See
 * `AudioOutputBlockRenderer.tsx` and FOUND_DEFECTS.md → "Media durability".
 */

import type { FileSource } from "@/features/files/handler/types";
import {
  fileIdFromUserFilesUrl,
  isDurableMediaUrl,
} from "@/lib/media/durability";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Build the strongest `FileSource` from a media block's `serverData`.
 * A permanent Matrx CDN URL wins because public media needs no authenticated
 * hop. Otherwise identity (`file_id`) beats opaque URLs so the handler can
 * resolve the durable authenticated lane. Expiring URLs are never rendered.
 */
export function buildMediaSource(
  sd: Record<string, unknown>,
  mime?: string,
): FileSource | null {
  const urlish = [
    pickStr(sd.cdnUrl) ?? pickStr(sd.cdn_url),
    pickStr(sd.downloadUrl) ?? pickStr(sd.download_url),
    pickStr(sd.url) ?? pickStr(sd.file_url),
    pickStr(sd.externalUrl) ?? pickStr(sd.external_url),
  ].filter((u): u is string => !!u);

  // Public Matrx media should render straight from the permanent CDN. Older
  // persisted audio/video parts put this URL in `url` rather than `cdn_url`,
  // so recognize the canonical host in every URL slot. Never classify a
  // signed URL as public even if a malformed producer put it on that host.
  const publicCdn = urlish.find(isPermanentMatrxCdnUrl);
  if (publicCdn) {
    return { kind: "public_cdn", url: publicCdn, mime };
  }

  const directId = pickStr(sd.fileId) ?? pickStr(sd.file_id);
  if (directId && UUID_RE.test(directId)) {
    return { kind: "file_id", fileId: directId, mime };
  }

  // 1. Last-resort identity recovery, scoped to OUR OWN user-files S3 host
  //    (`…/{user_id}/{file_id}?…`). Producers now carry `file_id` explicitly
  //    (server `AudioOutputData`/`VideoOutputData`, and both DB walkers via
  //    `fromCxAudioPart`/`fromCxVideoPart`), so this only covers a URL that
  //    reached us with no identity at all — an aidream fallback path that
  //    leaves `file_id` None, or a pre-2026-05 persisted row. The recovery is
  //    deliberately NOT generic: guessing a file_id off any trailing
  //    `{uuid}.{ext}` segment turned durable third-party/public-bucket URLs
  //    into mints for ids that do not exist, i.e. a dead player.
  for (const cand of urlish) {
    const id = fileIdFromUserFilesUrl(cand);
    if (id) return { kind: "file_id", fileId: id, mime };
  }

  // 2. A durable (non-expiring) public/CDN/external URL → safe to use as-is.
  const durable = urlish.find((u) => isDurableMediaUrl(u));
  if (durable) return { kind: "external_url", url: durable, mime };

  // An expiring URL with no recoverable identity is intentionally unusable.
  // Rendering it would expose a signed bearer credential and guarantee a
  // broken historical message after expiry. Producers must provide file_id or
  // a permanent URL.
  return null;
}

function isPermanentMatrxCdnUrl(url: string): boolean {
  if (!isDurableMediaUrl(url)) return false;
  try {
    return /(^|\.)cdn\.matrxserver\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
