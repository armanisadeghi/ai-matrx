/**
 * components/image/cloud/resolveCloudFileUrl.ts
 *
 * Imperative one-shot resolver that turns a cloud-files `fileId` into an
 * `ImageSource` the legacy image manager / SelectedImagesProvider can
 * consume. Used on selection events — the image manager hands the picked
 * file off to the provider with a usable URL.
 *
 * Implementation: delegates to the universal handler
 * (`fileHandler.use(source).as({kind: "html_src"})`), so durable-URL
 * routing (CDN for public, authenticated download route otherwise)
 * happens the same way as everywhere else.
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { CloudFileRecord } from "@/features/files/types";
import type { AppStore } from "@/lib/redux/store";
import type { ImageSource } from "@/components/image/context/SelectedImagesProvider";

/**
 * Imperative file lookup against the cloudFiles slice. This module is
 * non-React (it operates against an `AppStore`), so the React-side
 * `useFile` hook isn't available — and the file is just used as an
 * existence check before we hand the id off to `fileHandler`. Reading
 * the slice's `filesById` map directly is acceptable here because the
 * handler is the authoritative resolver; this lookup only short-circuits
 * the "file isn't in cache yet" error path.
 */
function getCloudFile(
  store: AppStore,
  fileId: string,
): CloudFileRecord | undefined {
  const state = store.getState();
  return state.cloudFiles?.filesById?.[fileId];
}

export interface ResolvedCloudUrl {
  url: string;
  /**
   * Epoch ms when the URL expires. `null` for permanent CDN URLs.
   * Informational only — the handler's lazy URL cache re-mints
   * transparently the next time anyone asks for this file's URL after
   * expiry, so most callers can ignore this field.
   */
  expiresAt: number | null;
}

export async function resolveCloudFileUrl(
  store: AppStore,
  fileId: string,
): Promise<ResolvedCloudUrl> {
  const file = getCloudFile(store, fileId);
  if (!file) {
    // access-errors: ok — existence check against the browser-local cloudFiles Redux cache, not a DB read; the id is verifiably absent from the local store
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
    // Durable URLs never expire.
    expiresAt: null,
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
  const file = getCloudFile(store, fileId);
  if (!file) {
    // access-errors: ok — existence check against the browser-local cloudFiles Redux cache, not a DB read; the id is verifiably absent from the local store
    throw new Error(`Cloud file not found in store: ${fileId}`);
  }
  const resolved = await resolveCloudFileUrl(store, fileId);
  return buildCloudImageSource(file, resolved);
}
