/**
 * features/file-handler/utils/prefer-locator.ts
 *
 * "Pick the best identifier" helpers used by every output adapter. The
 * priority order is FIXED by the Python backend's MediaRef resolution
 * rules: file_id > file_uri > url > base64.
 */

import type { NormalizedFile } from "../types";

export function preferIdentityLocator(
  file: NormalizedFile,
): { file_id?: string; file_uri?: string; url?: string; base64_data?: string } {
  if (file.fileId) return { file_id: file.fileId };
  if (file.fileUri) return { file_uri: file.fileUri };
  if (file.url) return { url: file.url };
  if (file.base64) return { base64_data: file.base64 };
  return {};
}

/**
 * Pick the best URL for a `<img src>` consumer. Order:
 *   1. Public CDN URL (permanent, CDN-cached)
 *   2. Share-link URL (stable, indefinite)
 *   3. Signed S3 URL (1h, refreshable)
 *   4. data: URI (last resort, large)
 */
export function preferDisplayUrl(file: NormalizedFile): string | null {
  if (file.url) return file.url;
  if (file.shareToken) return `/share/${file.shareToken}`;
  if (file.base64 && file.meta.mime) {
    return `data:${file.meta.mime};base64,${file.base64}`;
  }
  return null;
}

/**
 * Pick the best URL for a `fetch()` consumer. Signed S3 URLs are CORS-
 * blocked, so when `transportSafeForFetch` is false and we have a
 * fileId, route through the same-origin proxy.
 */
export function preferFetchableUrl(file: NormalizedFile): string | null {
  if (file.capabilities.transportSafeForFetch && file.url) return file.url;
  if (file.fileId) return `/api/files/${file.fileId}/proxy`;
  if (file.shareToken) return `/api/share/${file.shareToken}/file`;
  if (file.url) return file.url;
  if (file.base64 && file.meta.mime) {
    return `data:${file.meta.mime};base64,${file.base64}`;
  }
  return null;
}
