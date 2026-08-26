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
 * Identity (`file_id`) beats opaque URLs so the handler always picks the
 * durable lane when possible. Returns null when nothing resolvable — a part
 * carrying no `file_id` and no usable URL has no client-renderable source.
 */
export function buildMediaSource(
  sd: Record<string, unknown>,
  mime?: string,
): FileSource | null {
  const directId = pickStr(sd.fileId) ?? pickStr(sd.file_id);
  if (directId && UUID_RE.test(directId)) {
    return { kind: "file_id", fileId: directId, mime };
  }

  const urlish = [
    pickStr(sd.cdnUrl) ?? pickStr(sd.cdn_url),
    pickStr(sd.downloadUrl) ?? pickStr(sd.download_url),
    pickStr(sd.url) ?? pickStr(sd.file_url),
    pickStr(sd.externalUrl) ?? pickStr(sd.external_url),
  ].filter((u): u is string => !!u);

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

  // 3. Last resort: an expiring URL with no recoverable identity. Still try to
  //    play it (the durability gap is a tracked known defect).
  const last = urlish[0];
  if (last) return { kind: "external_url", url: last, mime };

  return null;
}
