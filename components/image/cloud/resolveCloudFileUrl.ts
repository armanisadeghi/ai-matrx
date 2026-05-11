/**
 * components/image/cloud/resolveCloudFileUrl.ts
 *
 * One-shot resolver that turns a cloud-files `fileId` (or `CloudFileRecord`)
 * into an `ImageSource` the rest of the legacy image system can consume.
 *
 * Strategy mirrors `<MediaThumbnail>`:
 *   - Files with `publicUrl` get a permanent Cloudflare CDN URL (cacheable
 *     forever; cache-busts via the `?v=<checksum>` suffix when content
 *     changes server-side).
 *   - Private / shared files fall back to a short-lived signed URL.
 *
 * Selection-time resolution is intentional: it's a one-shot event, so we
 * don't need the auto-refresh machinery from `useSignedUrl`. If a downstream
 * UI keeps the URL on screen for hours, it should refetch via the file id
 * stored in `metadata.fileId`.
 */
import * as Files from "@/features/files/api/files";
import { selectFileById } from "@/features/files/redux/selectors";
import type { CloudFileRecord } from "@/features/files/types";
import type { AppStore } from "@/lib/redux/store";
import type { ImageSource } from "@/components/image/context/SelectedImagesProvider";
import { resolveRenderableImageUrl } from "@/features/files/utils/resolveRenderableImageUrl";

export interface ResolvedCloudUrl {
  url: string;
  /** Epoch ms. `null` for permanent CDN URLs. */
  expiresAt: number | null;
}

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export async function resolveCloudFileUrl(
  store: AppStore,
  fileId: string,
  options: { expiresIn?: number } = {},
): Promise<ResolvedCloudUrl> {
  const file = selectFileById(store.getState(), fileId);
  if (!file) {
    throw new Error(`Cloud file not found in store: ${fileId}`);
  }
  if (file.publicUrl) {
    return resolveRenderableImageUrl(file);
  }
  return resolveRenderableImageUrl(file, {
    expiresIn: options.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS,
    getSignedUrl: async (id, params) => {
      const { data } = await Files.getSignedUrl(id, params);
      return data;
    },
  });
}

/**
 * Helper that builds a complete `ImageSource` from a cloud-file record.
 * Use this everywhere the image manager hands a cloud file off to the
 * SelectedImagesProvider so the metadata block is consistent.
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
  options: { expiresIn?: number } = {},
): Promise<ImageSource> {
  const file = selectFileById(store.getState(), fileId);
  if (!file) {
    throw new Error(`Cloud file not found in store: ${fileId}`);
  }
  const resolved = await resolveCloudFileUrl(store, fileId, options);
  return buildCloudImageSource(file, resolved);
}
