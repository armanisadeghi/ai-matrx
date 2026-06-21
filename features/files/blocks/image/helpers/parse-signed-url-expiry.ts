/**
 * features/files/blocks/image/helpers/parse-signed-url-expiry.ts
 *
 * Extract the expiry timestamp from a signed S3 URL — BOTH AWS dialects
 * (SigV2 `Expires=<epoch>` and SigV4 `X-Amz-Date` + `X-Amz-Expires`).
 *
 * Thin re-export of the canonical primitive in `lib/media/signed-url.ts` so the
 * whole app agrees on one definition of "signed / expiring". (Historically this
 * file only understood SigV4, which made SigV2 owned-file URLs look permanent and
 * silently killed the re-mint path — see lib/media/signed-url.ts header.)
 *
 * Returns ms epoch (Date.now()-style), or null when no parseable expiry exists.
 */

export { signedUrlExpiresAtMs as parseSignedUrlExpiry } from "@/lib/media/signed-url";
