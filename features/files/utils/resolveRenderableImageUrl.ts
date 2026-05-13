import type { ImageSource } from "@/components/image/context/SelectedImagesProvider";
import type { Asset, SignedUrlResponse } from "@/features/files/types";
import { getAssetForFile } from "@/features/files/api/assets";

const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const EXPIRY_SAFETY_MARGIN_MS = 30 * 1000;

interface CachedUrl {
  url: string;
  expiresAt: number | null;
}

const urlCache = new Map<string, CachedUrl>();
const inFlight = new Map<string, Promise<CachedUrl>>();

export interface RenderableImageUrlResult {
  url: string;
  expiresAt: number | null;
}

export interface RenderableImageUrlOptions {
  expiresIn?: number;
  getSignedUrl?: (
    fileId: string,
    params: { expiresIn?: number },
  ) => Promise<Pick<SignedUrlResponse, "url" | "expires_in">>;
  now?: () => number;
}

export type RenderableImageRef =
  | string
  | ImageSource
  | {
      id?: string;
      fileId?: string | null;
      fileName?: string | null;
      url?: string | null;
      publicUrl?: string | null;
      metadata?: Record<string, unknown> | null;
    };

export async function resolveRenderableImageUrl(
  ref: RenderableImageRef,
  options: RenderableImageUrlOptions = {},
): Promise<RenderableImageUrlResult> {
  const normalized = normalizeImageRef(ref);
  const now = options.now ?? Date.now;

  if (normalized.publicUrl) {
    return remember(normalized.publicUrl, {
      url: normalized.publicUrl,
      expiresAt: null,
    });
  }

  if (normalized.fileId) {
    const cached = urlCache.get(cacheKeyForFile(normalized.fileId));
    if (cached && isUsable(cached, now())) return cached;
  }

  const currentUrl = normalized.url;
  const currentExpiresAt =
    normalized.expiresAt ?? (currentUrl ? getAwsSignedUrlExpiry(currentUrl) : null);
  if (currentUrl && isUsable({ url: currentUrl, expiresAt: currentExpiresAt }, now())) {
    if (normalized.fileId) {
      return remember(cacheKeyForFile(normalized.fileId), {
        url: currentUrl,
        expiresAt: currentExpiresAt,
      });
    }
    return { url: currentUrl, expiresAt: currentExpiresAt };
  }

  if (!normalized.fileId) {
    if (currentUrl) return { url: currentUrl, expiresAt: currentExpiresAt };
    throw new Error("Image reference does not include a renderable URL or file id");
  }

  if (!options.getSignedUrl) {
    throw new Error("Resolving a private cloud file requires getSignedUrl");
  }

  return fetchAndCacheSignedUrl(normalized.fileId, options);
}

export function __clearRenderableImageUrlCacheForTests() {
  urlCache.clear();
  inFlight.clear();
}

/**
 * Async variant of {@link resolveRenderableImageUrl} that adds the
 * `GET /files/{id}/asset` endpoint as a third resolution tier. The
 * synchronous resolver picks between (1) `publicUrl` (CDN, permanent)
 * and (2) the caller-supplied `getSignedUrl` fallback. This helper adds
 * (3): when neither yields a URL, fall through to the asset endpoint,
 * which works regardless of whether the file was uploaded through the
 * asset pipeline.
 *
 * Use this when the caller has a `file_id` and wants the best-quality
 * inline URL the system can produce without locking in `useSignedUrl`
 * semantics. Hooks rendering live `<img>` should prefer `useFileAsset`
 * directly — this helper is for one-shot resolution from imperative
 * code paths (event handlers, derived selectors).
 *
 * Caches into the same `urlCache` keyed by `cloud-file:<id>` so a later
 * sync resolve picks up the result.
 */
export async function resolveRenderableImageUrlAsync(
  ref: RenderableImageRef,
  options: RenderableImageUrlOptions = {},
): Promise<RenderableImageUrlResult> {
  try {
    return await resolveRenderableImageUrl(ref, options);
  } catch (err) {
    const normalized = normalizeImageRef(ref);
    if (!normalized.fileId) throw err;

    // Asset-endpoint fallback. Prefer the master "original" variant's
    // permanent CDN URL when available; otherwise pick whatever the
    // server returned as `primary_url` (handles signed-inline).
    const { data } = await getAssetForFile(normalized.fileId, {
      signed_url_ttl: options.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS,
    });
    const resolved = pickAssetUrl(data);
    if (!resolved.url) throw err;
    const now = options.now ?? Date.now;
    const expiresAt =
      resolved.expiresAt ?? getAwsSignedUrlExpiry(resolved.url) ?? null;
    return remember(cacheKeyForFile(normalized.fileId), {
      url: resolved.url,
      expiresAt: expiresAt ?? now() + (options.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000,
    });
  }
}

/**
 * Pick the most renderable URL from an Asset envelope. Prefers CDN
 * (permanent) over signed-inline (TTL-bound). Returns `expiresAt: null`
 * for CDN URLs and lets the caller compute expiry for signed URLs.
 */
function pickAssetUrl(asset: Asset): { url: string | null; expiresAt: number | null } {
  const primary = asset.variants[asset.primary_key] ?? asset.variants.original ?? null;
  if (primary?.cdn_url) return { url: primary.cdn_url, expiresAt: null };
  if (primary?.url) return { url: primary.url, expiresAt: null };
  if (asset.primary_url) return { url: asset.primary_url, expiresAt: null };
  // Fallback: scan variants for any usable URL.
  for (const variant of Object.values(asset.variants)) {
    if (variant.cdn_url) return { url: variant.cdn_url, expiresAt: null };
    if (variant.url) return { url: variant.url, expiresAt: null };
  }
  return { url: null, expiresAt: null };
}

function fetchAndCacheSignedUrl(
  fileId: string,
  options: RenderableImageUrlOptions,
): Promise<CachedUrl> {
  const key = cacheKeyForFile(fileId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = options
    .getSignedUrl!(fileId, {
      expiresIn: options.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS,
    })
    .then((data) =>
      remember(key, {
        url: data.url,
        expiresAt: (options.now ?? Date.now)() + data.expires_in * 1000,
      }),
    )
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

function remember(key: string, value: CachedUrl): CachedUrl {
  urlCache.set(key, value);
  return value;
}

function isUsable(value: CachedUrl, now: number) {
  return value.expiresAt === null || value.expiresAt - EXPIRY_SAFETY_MARGIN_MS > now;
}

function cacheKeyForFile(fileId: string) {
  return `cloud-file:${fileId}`;
}

function normalizeImageRef(ref: RenderableImageRef): {
  fileId: string | null;
  url: string | null;
  publicUrl: string | null;
  expiresAt: number | null;
  cacheKey: string | null;
} {
  if (typeof ref === "string") {
    return {
      fileId: null,
      url: ref,
      publicUrl: null,
      expiresAt: getAwsSignedUrlExpiry(ref),
      cacheKey: ref,
    };
  }

  // After the string check above, treat ref as a duck-typed bag — the
  // discriminated union members don't all expose the same keys, but every
  // property access here is runtime-guarded.
  const refRecord = ref as Record<string, unknown>;
  const metadata = isRecord(refRecord.metadata) ? refRecord.metadata : null;
  const metadataFileId = readString(metadata, "fileId");
  const metadataExpiresAt = readNumber(metadata, "urlExpiresAt");
  const directFileId = readString(refRecord, "fileId");
  const cloudId =
    typeof refRecord.id === "string" && refRecord.id.startsWith("cloud:")
      ? refRecord.id.slice("cloud:".length)
      : null;
  const url =
    typeof refRecord.url === "string" && refRecord.url.length > 0
      ? refRecord.url
      : null;
  const publicUrl =
    typeof refRecord.publicUrl === "string" && refRecord.publicUrl.length > 0
      ? refRecord.publicUrl
      : null;
  const idOnlyCloudFile =
    !url &&
    !publicUrl &&
    typeof refRecord.id === "string" &&
    ("publicUrl" in refRecord || "fileName" in refRecord);
  const fileId =
    directFileId ?? metadataFileId ?? cloudId ?? (idOnlyCloudFile ? (refRecord.id as string) : null);

  return {
    fileId,
    url,
    publicUrl,
    expiresAt: metadataExpiresAt ?? (url ? getAwsSignedUrlExpiry(url) : null),
    cacheKey: fileId ? cacheKeyForFile(fileId) : url,
  };
}

function getAwsSignedUrlExpiry(url: string): number | null {
  try {
    const parsed = new URL(url);
    const date = parsed.searchParams.get("X-Amz-Date");
    const expires = parsed.searchParams.get("X-Amz-Expires");
    if (!date || !expires) return null;
    const seconds = Number(expires);
    if (!Number.isFinite(seconds)) return null;
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    const issuedAt = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return issuedAt + seconds * 1000;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) return null;
  const item = value[key];
  return typeof item === "string" && item.length > 0 ? item : null;
}

function readNumber(value: Record<string, unknown> | null, key: string): number | null {
  if (!value) return null;
  const item = value[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}
