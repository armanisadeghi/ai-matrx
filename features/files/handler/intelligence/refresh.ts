/**
 * features/files/handler/intelligence/refresh.ts
 *
 * Re-mint a signed URL for a file we own. Wraps the cloud-files REST
 * endpoint so the resolver and the expiry wheel call the same code path.
 *
 * Behavior:
 *   - On success → return { url, expiresAt } (epoch ms).
 *   - On 403 with expired-marker → throw FileExpiredError (callers never
 *     see this in practice because they came IN here BECAUSE of expiry).
 *   - On 403 without expired-marker → throw FileAccessDeniedError. The
 *     user lost access between the original mint and now (e.g. share was
 *     revoked).
 *   - On 404 → throw FileNotFoundError.
 */

import * as Files from "@/features/files/api/files";
import {
  FileAccessDeniedError,
  FileExpiredError,
  FileNotFoundError,
  isS3ExpiredError,
} from "../errors";

export interface RefreshResult {
  url: string;
  expiresAt: number;
}

/**
 * The published contract carries `expires_in` (seconds), but the live
 * matrx-files service omits it (contract drift, 2026-08-08). Without this
 * guard the cache stored `expiresAt: NaN`, so every consumer re-minted on
 * every call. Order: explicit `expires_in` → the AWS `Expires=` epoch on
 * the signed URL itself → the seconds we requested.
 */
function resolveExpiresAt(
  data: { url: string; expires_in?: number | null },
  requestedSec: number,
): number {
  if (typeof data.expires_in === "number" && Number.isFinite(data.expires_in)) {
    return Date.now() + data.expires_in * 1000;
  }
  try {
    const expiresParam = new URL(data.url).searchParams.get("Expires");
    if (expiresParam) {
      const epochSec = Number(expiresParam);
      if (Number.isFinite(epochSec)) return epochSec * 1000;
    }
  } catch {
    /* not a parseable URL — fall through */
  }
  return Date.now() + requestedSec * 1000;
}

export async function mintSignedUrl(
  fileId: string,
  expiresInSec = 3600,
): Promise<RefreshResult> {
  try {
    const { data } = await Files.getSignedUrl(fileId, { expiresIn: expiresInSec });
    return {
      url: data.url,
      expiresAt: resolveExpiresAt(data, expiresInSec),
    };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) throw new FileNotFoundError(undefined, { fileId });
    if (status === 403) {
      if (isS3ExpiredError(err)) throw new FileExpiredError(undefined, { fileId });
      throw new FileAccessDeniedError(undefined, { fileId });
    }
    throw err;
  }
}
