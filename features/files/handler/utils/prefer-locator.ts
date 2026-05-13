/**
 * features/files/handler/utils/prefer-locator.ts
 *
 * "Pick the best identifier" helpers used by every output adapter. The
 * priority order is FIXED by the Python backend's MediaRef resolution
 * rules: file_id > file_uri > url > base64.
 */

import type { NormalizedFile } from "../types";
import {
  pythonFileDownloadUrl,
  pythonShareUrl,
} from "./python-base";

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
 * Pick the best URL for a `<img src>` / `<video src>` / `<audio src>`
 * consumer. Order:
 *   1. Public CDN URL (permanent, CDN-cached) — already on `file.url`
 *      when the file is public AND server has CDN enabled.
 *   2. Signed S3 URL we already minted — already on `file.url`.
 *   3. Python share resolver — for share-link sources.
 *   4. data: URI — last resort.
 *
 * No Next.js hops. The browser talks to Python (or CDN) directly.
 */
export function preferDisplayUrl(file: NormalizedFile): string | null {
  if (file.url) return file.url;
  if (file.shareToken) return pythonShareUrl(file.shareToken);
  if (file.base64 && file.meta.mime) {
    return `data:${file.meta.mime};base64,${file.base64}`;
  }
  return null;
}

/**
 * Pick the best URL for a `fetch()` consumer. Signed S3 URLs are CORS-
 * blocked, so when `transportSafeForFetch` is false we route through
 * Python's authenticated download endpoint — same Python backend the
 * cloud-files REST client already uses, no Next.js involvement.
 */
export function preferFetchableUrl(file: NormalizedFile): string | null {
  if (file.capabilities.transportSafeForFetch && file.url) return file.url;
  if (file.fileId) return pythonFileDownloadUrl(file.fileId);
  if (file.shareToken) return pythonShareUrl(file.shareToken);
  if (file.url) return file.url;
  if (file.base64 && file.meta.mime) {
    return `data:${file.meta.mime};base64,${file.base64}`;
  }
  return null;
}
