/**
 * features/file-handler/intelligence/refresh.ts
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
import { recordTelemetry } from "./telemetry";

export interface RefreshResult {
  url: string;
  expiresAt: number;
}

export async function mintSignedUrl(
  fileId: string,
  expiresInSec = 3600,
): Promise<RefreshResult> {
  const start = Date.now();
  try {
    const { data } = await Files.getSignedUrl(fileId, { expiresIn: expiresInSec });
    const expiresAt = Date.now() + data.expires_in * 1000;
    recordTelemetry({
      event: "signed_url_minted",
      fileId,
      durationMs: Date.now() - start,
    });
    return { url: data.url, expiresAt };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      recordTelemetry({ event: "access_denied", fileId, error: "not_found" });
      throw new FileNotFoundError(undefined, { fileId });
    }
    if (status === 403) {
      if (isS3ExpiredError(err)) {
        recordTelemetry({ event: "signed_url_expired", fileId });
        throw new FileExpiredError(undefined, { fileId });
      }
      recordTelemetry({ event: "access_denied", fileId });
      throw new FileAccessDeniedError(undefined, { fileId });
    }
    throw err;
  }
}
