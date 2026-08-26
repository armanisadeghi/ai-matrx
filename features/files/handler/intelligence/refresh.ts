/**
 * features/files/handler/intelligence/refresh.ts
 *
 * Resolve the durable authenticated URL for a file we own. The function name
 * is retained while consumers migrate away from the former signed-URL model.
 *
 * Behavior:
 *   - On success → return { url, expiresAt: Infinity }; durable locators do
 *     not expire and authorization is evaluated when the URL is requested.
 *   - On 403 without expired-marker → throw FileAccessDeniedError. The
 *     user lost access between the original mint and now (e.g. share was
 *     revoked).
 *   - On 404 → throw FileNotFoundError.
 */

import * as Files from "@/features/files/api/files";
import { FileAccessDeniedError, FileNotFoundError } from "../errors";

export interface RefreshResult {
  url: string;
  expiresAt: number;
}

export async function mintSignedUrl(
  fileId: string,
  _expiresInSec = 3600,
): Promise<RefreshResult> {
  try {
    const { data } = await Files.getFile(fileId);
    const url = data.url ?? data.download_url;
    if (!url) {
      throw new Error(`File ${fileId} did not include a renderable URL`);
    }
    return {
      url,
      expiresAt: Number.POSITIVE_INFINITY,
    };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) throw new FileNotFoundError(undefined, { fileId });
    if (status === 403) {
      throw new FileAccessDeniedError(undefined, { fileId });
    }
    throw err;
  }
}
