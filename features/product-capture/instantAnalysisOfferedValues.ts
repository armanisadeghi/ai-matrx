/**
 * The MAPPED-ONLY offered values of Provision `product_capture.instant_item`
 * (mandate `product_capture.instant_analysis`, declared `pass_by_name=False`
 * in aidream `client_mandates.py`): the item's own facts, read from the item
 * row and the file list the run already loads — no extra read.
 *
 * They ride `variables` beside `dock_notes` (unchanged). On the mandate door
 * the server drops mapped-only values on the default pin and delivers them
 * only where a binding's consumption map names them, so no current Holder's
 * payload changes. Absent facts are omitted, never sent blank.
 */

import type { ProductCaptureInstantItemOffer } from "@/types/python-generated/provision-offers";
import type { CaptureFile, CaptureItem } from "./types";

type MappedKeys = Exclude<keyof ProductCaptureInstantItemOffer, "__kind" | "dock_notes">;

export function instantAnalysisOfferedValues(
  item: Pick<CaptureItem, "code" | "codeSource" | "folderPath" | "status" | "createdAt">,
  files: ReadonlyArray<Pick<CaptureFile, "kind" | "video">>,
): Pick<ProductCaptureInstantItemOffer, MappedKeys> {
  const videos = files.filter((f) => f.kind === "video");
  // A total only when EVERY video carries its recorded duration — a partial
  // sum would be a wrong number, so it is omitted instead.
  const videoDurationMs =
    videos.length > 0 && videos.every((v) => v.video !== null)
      ? videos.reduce((sum, v) => sum + (v.video?.durationMs ?? 0), 0)
      : null;
  const code = item.code?.trim();
  const folder = item.folderPath?.trim();
  return {
    ...(code ? { product_code: code } : {}),
    ...(item.codeSource ? { code_source: item.codeSource } : {}),
    photo_count: files.filter((f) => f.kind === "photo").length,
    has_video: videos.length > 0,
    has_audio: files.some((f) => f.kind === "audio"),
    ...(videoDurationMs !== null ? { video_duration_ms: videoDurationMs } : {}),
    ...(folder ? { folder_path: folder } : {}),
    ...(item.status ? { item_status: item.status } : {}),
    ...(item.createdAt ? { captured_at: item.createdAt } : {}),
  } satisfies Partial<ProductCaptureInstantItemOffer>;
}
