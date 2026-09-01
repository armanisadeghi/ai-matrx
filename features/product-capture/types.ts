/**
 * features/product-capture/types.ts
 *
 * Product capture — warehouse-style rapid capture of product photos, video,
 * voice notes and text ahead of eBay-listing categorization.
 *
 * DB shape (workbench.product_capture_item + workbench.product_capture_file,
 * migrations/workbench_product_capture_2026_08_28.sql): the item row is the
 * identity (code/SKU, notes, folder, status); every byte lives in files.files
 * via `fileHandler.upload`, linked back by a component row per file.
 */

import type { Database } from "@/types/database.types";
import type { CapturedVideoResult } from "@ai-matrx/capture/react";

type WorkbenchTables = Database["workbench"]["Tables"];

export type ProductCaptureItemRow =
  WorkbenchTables["product_capture_item"]["Row"];
export type ProductCaptureFileRow =
  WorkbenchTables["product_capture_file"]["Row"];

export type ProductCaptureFileKind = "photo" | "video" | "audio";
export type ProductCaptureCodeSource = "qr" | "manual";
export type CaptureVideoFacts = Pick<
  CapturedVideoResult,
  "mime" | "durationMs"
>;

/** The item as the UI holds it (camelCase, version carried for CAS writes). */
export interface CaptureItem {
  id: string;
  organizationId: string;
  /** Product number / SKU — QR value or typed. Null until assigned. */
  code: string | null;
  codeSource: ProductCaptureCodeSource | null;
  notes: string;
  /** Cloud folder the item's files are filed under. Set once at creation. */
  folderPath: string;
  status: "capturing" | "captured" | "processed";
  createdAt: string;
  version: number;
}

/** One linked file of an item. */
export interface CaptureFile {
  id: string;
  itemId: string;
  fileId: string;
  kind: ProductCaptureFileKind;
  /** Exact normalized terminal recording facts; null on legacy/non-video rows. */
  video: CaptureVideoFacts | null;
  createdAt: string;
}

/** A locally tracked artifact: shown in the filmstrip while (and after) its
 *  upload runs. `fileId` appears when the upload lands. */
export interface PendingArtifact {
  localId: string;
  itemId: string;
  kind: ProductCaptureFileKind;
  /** Tracked object URL for instant preview (photos/videos). */
  previewUrl?: string;
  fileId?: string;
  video?: CaptureVideoFacts;
  status: "uploading" | "uploaded" | "error";
  error?: string;
}
