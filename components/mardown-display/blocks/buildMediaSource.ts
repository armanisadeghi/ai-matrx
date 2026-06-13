/**
 * components/mardown-display/blocks/buildMediaSource.ts
 *
 * Shared URL-resolution for the chat media output-block renderers
 * (`AudioOutputBlockRenderer`, `VideoOutputBlockRenderer`). Turns the raw
 * `serverData` of an `audio_output` / `video_output` / `media_block` render
 * block into the strongest `FileSource` we can, so the universal file handler
 * (`useFileSrc`) resolves a DURABLE, playable URL — preferring the public/CDN
 * URL and re-minting from `file_id` — instead of echoing a raw signed S3 URL.
 *
 * Why this exists: the old renderers passed the raw `data.url` straight to the
 * player. During streaming Python sends only a `file_id` (no minted URL) so it
 * didn't play; when a URL was present it was a raw signed S3 link that leaked
 * through "Copy link". Routing through the handler fixes both. See
 * `AudioOutputBlockRenderer.tsx` and KNOWN_DEFECTS.md → "Media durability".
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
 * Best-effort recovery of a cld_files `file_id` from any URL/URI shape so the
 * handler can re-mint a durable URL instead of echoing a raw S3 link:
 *   - our user-files signed S3 URL (`…/{user_id}/{file_id}?…`)
 *   - an `s3://bucket/{user_id}/{file_id}/…` canonical URI
 *   - any path that ends in a `{uuid}.{ext}` segment
 */
export function fileIdFromAnyUri(uri: string): string | null {
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
 * Build the strongest `FileSource` from a media block's `serverData`.
 * Identity (`file_id` / `file_uri`) beats opaque URLs so the handler always
 * picks the durable lane when possible. Returns null when nothing resolvable.
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
  //    play it (the durability gap is a tracked known defect).
  const last = urlish[0];
  if (last) return { kind: "external_url", url: last, mime };

  return null;
}
