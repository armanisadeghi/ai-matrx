/**
 * features/files/handler/utils/classify.ts
 *
 * Wrap the existing FILE_TYPES registry to produce a `FileMeta` from any
 * (filename, mime) tuple. This is the only place the handler talks to
 * the classifier — keeps imports tidy and mocks easy.
 */

import { getFilePreviewProfile } from "@/features/files/utils/file-types";
import type { FileMeta } from "../types";

export function classify(opts: {
  fileName?: string;
  mime?: string;
  sizeBytes?: number;
  checksum?: string;
}): FileMeta {
  const fallbackName = opts.fileName ?? guessNameFromMime(opts.mime);
  const profile = getFilePreviewProfile(
    fallbackName,
    opts.mime ?? null,
    opts.sizeBytes ?? null,
  );
  return {
    fileName: opts.fileName,
    mime: profile.mime,
    sizeBytes: opts.sizeBytes,
    checksum: opts.checksum,
    category: profile.details.category,
    previewKind: profile.previewKind,
    thumbnailStrategy: profile.thumbnailStrategy,
  };
}

function guessNameFromMime(mime?: string): string {
  if (!mime) return "file";
  const ext = mime.split("/")[1]?.split(";")[0] ?? "bin";
  return `file.${ext}`;
}
