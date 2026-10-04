/**
 * Files dragged onto a board → file items.
 *
 * Every file goes up through the file handler's one write path
 * (`fileHandler.upload` → `cloudUpload`), which carries the organization
 * gate: with no workspace selected the person is ASKED once, and declining
 * uploads nothing. Each uploaded file becomes one File item.
 *
 * NOTHING IS DROPPED SILENTLY: a file that fails is named in a toast with the
 * reason and the remedy. Declining the workspace question is an answer, not a
 * failure — it stays silent, as the file handler requires of every catch site
 * (`UploadCancelledError`). The returned list holds only files that exist now.
 */

import { fileHandler } from "@/features/files/handler/handler";
import { isUploadCancelledError } from "@/features/files/handler/errors";
import { toast } from "@/lib/toast";
import type { PlacedItem } from "./types";
import { fileItem } from "./work-sources";

/** Where board uploads land in the person's files. */
export const BOARD_UPLOAD_FOLDER = "Board uploads";

export async function filesToBoardItems(files: File[]): Promise<PlacedItem[]> {
  if (files.length === 0) return [];
  const settled = await Promise.allSettled(
    files.map((file) => fileHandler.upload({ kind: "file", file }, { folderPath: BOARD_UPLOAD_FOLDER })),
  );

  const items: PlacedItem[] = [];
  const failed: Array<{ name: string; reason: string }> = [];
  settled.forEach((result, i) => {
    const name = files[i].name || "Untitled file";
    if (result.status === "fulfilled") {
      items.push(fileItem(result.value.fileId, name));
    } else if (!isUploadCancelledError(result.reason)) {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error("[spatial/file-drop] upload failed", { name, reason: result.reason });
      failed.push({ name, reason });
    }
  });

  for (const f of failed) {
    toast.error(
      `"${f.name}" could not be added to the board: ${f.reason}. Drop it again, or use Add → File → Upload from computer.`,
    );
  }
  return items;
}
