/**
 * components/image/cloud/resolveCloudFileUrl.ts
 *
 * Imperative one-shot resolver that turns a cloud-files `fileId` into an
 * `ImageSource` the legacy image manager / SelectedImagesProvider can
 * consume. Used on selection events — the image manager hands the picked
 * file off to the provider with a usable URL.
 *
 * Implementation: delegates to the universal handler
 * (`fileHandler.use(source).as({kind: "html_src"})`), so URL minting,
 * CDN-vs-signed routing, and expiry-wheel registration all happen the
 * same way as everywhere else. Permanent CDN URLs come back as-is;
 * private/shared files get a freshly-minted signed URL.
 */

import { fileHandler } from "@/features/files/handler/handler";
import { selectFileById } from "@/features/files/redux/selectors";
import type { CloudFileRecord } from "@/features/files/types";
import type { AppStore } from "@/lib/redux/store";
import type { ImageSource } from "@/components/image/context/SelectedImagesProvider";

export interface ResolvedCloudUrl {
  url: string;
  /**
   * Epoch ms when the URL expires. `null` for permanent CDN URLs. The
   * handler's expiry-wheel handles auto-refresh internally — this field
   * is informational, used by surfaces that persist the URL across long
   * sessions and want to know when to re-resolve.
   */
  expiresAt: number | null;
}

/**
 * Best-effort parse of the expiry from an AWS-signed URL. Returns `null`
 * for permanent CDN URLs (no `X-Amz-Date` / `X-Amz-Expires` query params).
 */
function parseExpiry(url: string): number | null {
  try {
    const u = new URL(url);
    const date = u.searchParams.get("X-Amz-Date");
    const expires = u.searchParams.get("X-Amz-Expires");
    if (!date || !expires) return null;
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`;
    const startedAt = Date.parse(iso);
    const ttlMs = Number.parseInt(expires, 10) * 1000;
    if (!Number.isFinite(startedAt) || !Number.isFinite(ttlMs)) return null;
    return startedAt + ttlMs;
  } catch {
    return null;
  }
}

export async function resolveCloudFileUrl(
  store: AppStore,
  fileId: string,
): Promise<ResolvedCloudUrl> {
  const file = selectFileById(store.getState(), fileId);
  if (!file) {
    throw new Error(`Cloud file not found in store: ${fileId}`);
  }
  const url = await fileHandler
    .use({ kind: "file_id", fileId })
    .as({ kind: "html_src" });
  if (!url) {
    throw new Error(`Could not resolve renderable URL for file: ${fileId}`);
  }
  return {
    url,
    expiresAt: parseExpiry(url),
  };
}

/**
 * Helper that builds a complete `ImageSource` from a cloud-file record.
 * Used everywhere the image manager hands a cloud file off to the
 * SelectedImagesProvider so the metadata block stays consistent.
 */
export function buildCloudImageSource(
  file: Pick<CloudFileRecord, "id" | "fileName" | "mimeType" | "fileSize">,
  resolved: ResolvedCloudUrl,
): ImageSource {
  return {
    type: "cloud-file",
    url: resolved.url,
    id: `cloud:${file.id}`,
    metadata: {
      title: file.fileName,
      description: file.fileName,
      fileId: file.id,
      mimeType: file.mimeType ?? undefined,
      fileSize: file.fileSize ?? undefined,
      urlExpiresAt: resolved.expiresAt,
    },
  };
}

/**
 * Convenience for the common case — resolve and build in one call.
 */
export async function resolveCloudFileToImageSource(
  store: AppStore,
  fileId: string,
): Promise<ImageSource> {
  const file = selectFileById(store.getState(), fileId);
  if (!file) {
    throw new Error(`Cloud file not found in store: ${fileId}`);
  }
  const resolved = await resolveCloudFileUrl(store, fileId);
  return buildCloudImageSource(file, resolved);
}
