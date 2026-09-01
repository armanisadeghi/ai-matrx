/**
 * features/product-capture/uploads.ts
 *
 * The ONE cloud boundary of product capture: every byte (photo JPEG, video
 * blob, voice note) goes through `fileHandler.upload` into the item's own
 * folder (`item.folderPath`, fixed at creation — the QR code when known,
 * else the item id).
 *
 * Files upload with explicit `visibility: "internal"` + `inheritActiveScope`
 * — org-wide access is the point of the surface: anyone in the warehouse org
 * can pick up an item, and the downstream listing pipeline reads them without
 * per-user grants. `metadata.product_capture` stamps the item id + code on
 * every file so the linkage survives even outside the DB link rows.
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { NormalizedFile } from "@/features/files/handler/types";

import type { CaptureItem, ProductCaptureFileKind } from "./types";
import {
  countFileLinks,
  isActiveCloudFile,
  linkFile,
  listItemFiles,
  unlinkFile,
} from "./service";
import type { CaptureFile } from "./types";

export interface UploadItemFileResult {
  uploaded: NormalizedFile;
  link: CaptureFile;
}

/** Upload one artifact into the item's folder and link it to the item. */
export async function uploadItemFile(args: {
  item: CaptureItem;
  file: File;
  kind: ProductCaptureFileKind;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<UploadItemFileResult> {
  const { item, file, kind } = args;
  const uploaded = await fileHandler.upload(
    { kind: "file", file },
    {
      folderPath: item.folderPath,
      visibility: "internal",
      fileName: file.name,
      metadata: {
        product_capture: {
          item_id: item.id,
          code: item.code,
          kind,
        },
      },
      inheritActiveScope: true,
      ...(args.onProgress ? { onProgress: args.onProgress } : {}),
    },
  );
  if (!uploaded.fileId) {
    throw new Error(
      "[product-capture] upload resolved without a fileId — the capture is " +
        "not durably addressable. Treat as an upload failure.",
    );
  }
  const link = await linkFile({
    itemId: item.id,
    organizationId: item.organizationId,
    fileId: uploaded.fileId,
    kind,
  });
  return { uploaded, link };
}

/**
 * Remove one file from this item without destroying another item's capture.
 * Upload deduplication can return one canonical file id to several item links:
 * shared files are therefore unlinked only. A sole live file is deleted
 * BEFORE its relation, so a storage failure cannot commit a half-delete and
 * make the caller roll back to a relation that no longer exists. A stale link
 * to an already-deleted file is cleaned idempotently.
 */
export async function removeItemFile(args: {
  itemId: string;
  fileId: string;
  linkId?: string;
}): Promise<void> {
  let linkId = args.linkId;
  if (!linkId) {
    const files = await listItemFiles(args.itemId);
    linkId = files.find((f) => f.fileId === args.fileId)?.id;
  }
  if (!linkId) return;

  const linkCount = await countFileLinks(args.fileId);
  if (linkCount === 0) return;
  if (linkCount > 1) {
    await unlinkFile(linkId);
    return;
  }

  if (!(await isActiveCloudFile(args.fileId))) {
    await unlinkFile(linkId);
    return;
  }

  // Delete first. The FK may cascade the link; the explicit unlink is safe
  // and keeps this correct in deployments where the relation does not cascade.
  await fileHandler.remove(args.fileId, { hard: true });
  await unlinkFile(linkId);
}
