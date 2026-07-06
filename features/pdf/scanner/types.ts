/**
 * features/pdf/scanner — phone-scanner surface of the PDF domain.
 *
 * Coordinate contract: every quad is in **post-EXIF-transpose pixel
 * coordinates** — the orientation the browser displays. That is what
 * `POST /images/detect-document` returns and what the server's
 * `perspective_crop` op consumes at PDF build time, so quads round-trip
 * without conversion.
 */

export type QuadPoint = [number, number];

export interface Quad {
  top_left: QuadPoint;
  top_right: QuadPoint;
  bottom_right: QuadPoint;
  bottom_left: QuadPoint;
}

export type ScanItemKind = "image" | "pdf";

export type ScanItemStatus = "uploading" | "uploaded" | "error";

export type ScanRotation = 0 | 90 | 180 | 270;

export interface ScanItem {
  /** Local id — stable across reorder/crop; NOT the cld_files id. */
  itemId: string;
  /** cld_files id, set the moment the immediate upload completes. */
  fileId?: string;
  kind: ScanItemKind;
  fileName: string;
  mimeType: string;
  /** Object/data URL for thumbnails. Session-local, never persisted. */
  previewUrl?: string;
  status: ScanItemStatus;
  error?: string;
  /**
   * Crop state: `undefined` = untouched (auto-detect may run),
   * `null` = user explicitly chose full frame, `Quad` = crop to apply
   * server-side at PDF build time. Originals are never mutated.
   */
  quad?: Quad | null;
  rotation: ScanRotation;
}

/** The persisted (localStorage) survivor of a ScanItem — durable fields only. */
export interface ScanManifestItem {
  itemId: string;
  fileId: string;
  kind: ScanItemKind;
  fileName: string;
  mimeType: string;
  quad?: Quad | null;
  rotation: ScanRotation;
}

export interface ScanSessionManifest {
  version: 1;
  sessionId: string;
  createdAt: string;
  label: string;
  items: ScanManifestItem[];
}

// ── Wire shapes (mirror aidream routers; regenerated OpenAPI types land
//    with the next server deploy — these are the streaming contracts the
//    generator doesn't type anyway) ─────────────────────────────────────

export interface DetectDocumentResponse {
  found: boolean;
  quad: Quad | null;
  confidence: number;
  image_width: number;
  image_height: number;
}

export interface ScanPdfRequestItem {
  media: { file_id: string };
  kind: ScanItemKind;
  quad?: Quad | null;
  rotation: ScanRotation;
}

export interface ScanPdfRequest {
  items: ScanPdfRequestItem[];
  filename: string;
  folder_path?: string;
  force_ocr?: boolean;
  use_ocr_threshold?: number;
}

export interface ScanPdfResult {
  file_id: string | null;
  doc_id: string | null;
  filename: string;
  page_count: number | null;
  status: "done" | "error";
  error: string | null;
}
