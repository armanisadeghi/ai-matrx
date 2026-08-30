/**
 * features/files/media-client/refs.ts
 *
 * Identity conversion between the handler's `FileSource` vocabulary and the
 * `@ai-matrx/media` `MediaRefLike` port. Used by call sites that build a
 * `FileSource` (via `buildMediaSource`, `recognizeOurFileUrl`, …) but render
 * through the package hooks/components. Pure — no I/O, no minting; the one
 * URL it constructs (share token → public share URL) goes through the
 * canonical builder in `handler/utils/python-base`.
 */

import type { MediaRefLike } from "@ai-matrx/media";
import type { FileSource } from "@/features/files/handler/types";
import { shareUrls } from "@/features/files/handler/utils/python-base";

export function fileSourceToMediaRef(
  source: FileSource | null | undefined,
): MediaRefLike | null {
  if (!source) return null;
  switch (source.kind) {
    case "file_id":
      return { file_id: source.fileId, mime_type: source.mime ?? undefined };
    case "external_url":
      return { url: source.url, mime_type: source.mime ?? undefined };
    case "public_cdn":
      // The builder already verified this is a permanent public CDN URL —
      // bind it directly (identity-first resolution would fall to the
      // private lane while the record hydrates).
      return { url: source.url, mime_type: source.mime ?? undefined };
    case "cloud_file":
      return {
        file_id: source.cloudFile.id,
        mime_type: source.cloudFile.mimeType ?? undefined,
      };
    case "share_link":
      return {
        url: shareUrls(source.token).public,
        mime_type: source.mime ?? undefined,
      };
    default:
      return null;
  }
}
