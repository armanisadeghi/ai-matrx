// lib/media/our-file-sources.ts
//
// "Is this URL one of OUR files?" — the host wiring over the canonical
// recognizer in `@ai-matrx/data/files` (the C9 collapse of the former
// module-local regex engine). The package owns URL policy: byte-endpoint
// promotion (QA F2), signed-bucket file_id recovery, CDN detection, mime and
// file-name sniffing, signed-URL classification. What stays here is HOST
// IDENTITY only:
//
//   - `OUR_FILE_URL_MARKERS` — the cheap substring pre-gate values used by
//     the prefilter + splitter so plain text and third-party links never pay
//     for a full `new URL()` parse (keep in sync with `eslint.config.mjs`);
//   - the mapping from a recognized URL to the handler's `FileSource`
//     vocabulary (`file_id` / `public_cdn` / `share_link`) — identity beats
//     an opaque URL, because the handler can re-mint a durable URL from
//     identity but not from an expiring one.

import type { FileSource } from "@/features/files/handler/types";
import {
  createFileUrlRecognizer,
  fileNameFromUrl,
  isSignedUrl,
  mimeFromUrl,
} from "@ai-matrx/data/files";
import { extractFileIdFromUrl } from "@/features/files/blocks/image/helpers/extract-file-id-from-url";

export { fileNameFromUrl, mimeFromUrl };

/** The canonical recognizer, bound to the shipped Matrx origin defaults
 * (`*.matrxserver.com`, the user-files bucket, `cdn.matrxserver.com`).
 * Stateless — the media client's instance shares the same policy. */
const recognizer = createFileUrlRecognizer();

/**
 * `{base}/files/{file_id}/download[?…]` or `{base}/media/{file_id}/v/{class}`
 * on our hosts — an identity in disguise (QA F2). Delegates to the package
 * recognizer; kept as a named export for the block/annotate call sites.
 */
export function fileIdFromFileEndpointUrl(url: string): string | null {
  return recognizer.fileIdFromFileEndpointUrl(url);
}

export interface OurFileMatch {
  /** Strongest source we can hand the universal file handler. */
  source: FileSource;
  /** Stable identifier when we could recover one (re-mintable forever). */
  fileId: string | null;
  /** Best-effort mime sniffed from the URL (query content-type or extension). */
  mime: string | null;
  /** Human label for the origin, for debugging / telemetry. */
  origin: string;
  /**
   * Whether the URL itself is durable (non-expiring). A signed S3 URL is NOT
   * durable, but we still match it because we recovered a `fileId` to re-mint.
   */
  durableUrl: boolean;
}

/**
 * The set of host/path markers that identify a URL as ours. This is the cheap
 * pre-gate (substring test) used by the prefilter + splitter. Keep in sync
 * with `eslint.config.mjs`.
 */
export const OUR_FILE_URL_MARKERS = [
  "matrx-user-files.s3",
  "cdn.matrxserver",
  "/podcast-assets/",
  "/share/",
  // Authenticated durable byte endpoints on our backend hosts
  // (`{base}/files/{id}/download`, `{base}/media/{id}/v/{class}`).
  "matrxserver.com/files/",
  "matrxserver.com/media/",
] as const;

/** Fast substring pre-check — no URL parse. Safe to run on every line. */
export function mightBeOurFileUrl(text: string): boolean {
  for (const marker of OUR_FILE_URL_MARKERS) {
    if (text.includes(marker)) return true;
  }
  return false;
}

const SHARE_TOKEN_PATH_RE = /\/share\/([^/]+)(?:\/download)?$/i;

/**
 * Recognize an arbitrary URL as one of our files. Returns the strongest
 * `FileSource` (identity beats opaque URL) plus a sniffed mime, or `null`
 * when the URL is not ours. Pure + synchronous — no network. Ordered most
 * specific / identity-recoverable first; the first match wins.
 */
export function recognizeOurFileUrl(url: string): OurFileMatch | null {
  if (!url || !mightBeOurFileUrl(url)) return null;

  const mime = mimeFromUrl(url);
  const durableUrl = !isSignedUrl(url);
  const match = (
    origin: string,
    source: FileSource,
    fileId: string | null,
  ): OurFileMatch => ({ source, fileId, mime, origin, durableUrl });

  // 1. Our authenticated durable byte endpoints → the file_id lane (QA F2).
  const endpointFileId = recognizer.fileIdFromFileEndpointUrl(url);
  if (endpointFileId) {
    return match(
      "files-endpoint",
      { kind: "file_id", fileId: endpointFileId, mime: mime ?? undefined },
      endpointFileId,
    );
  }

  // 2. Legacy signed user-files bucket → recover the file_id so the handler
  //    re-mints a durable URL forever.
  const bucketFileId = recognizer.fileIdFromUserFilesUrl(url);
  if (bucketFileId) {
    return match(
      "user-files-signed",
      { kind: "file_id", fileId: bucketFileId, mime: mime ?? undefined },
      bucketFileId,
    );
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed) return null;

  // 3. Public CDN — recover the file_id when present (durable identity);
  //    otherwise the CDN URL is itself durable so we use it as-is.
  if (/(^|\.)cdn\.matrxserver\.com$/i.test(parsed.hostname)) {
    const cdnFileId = extractFileIdFromUrl(url);
    return match(
      "cdn",
      cdnFileId
        ? { kind: "file_id", fileId: cdnFileId, mime: mime ?? undefined }
        : { kind: "public_cdn", url, mime: mime ?? undefined },
      cdnFileId,
    );
  }

  // 4. Share-link byte endpoint — `{backend}/share/{token}[/download]`. The
  //    handler resolves bytes by token; lifetime is backend-managed.
  const token = parsed.pathname.match(SHARE_TOKEN_PATH_RE)?.[1] ?? null;
  if (token) {
    return match(
      "share-link",
      { kind: "share_link", token, mime: mime ?? undefined },
      null,
    );
  }

  return null;
}
