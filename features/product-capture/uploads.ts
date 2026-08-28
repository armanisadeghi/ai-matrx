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
import { linkFile } from "./service";
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
