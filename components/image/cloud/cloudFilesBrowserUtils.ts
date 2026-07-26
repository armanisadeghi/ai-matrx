import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files";
import {
  getFileTypeDetails,
  isAudioMime,
  isImageMime,
  isPdfMime,
  isVideoMime,
  resolveMime,
} from "@/features/files";
import type { AllowedFileKind } from "./CloudFilesTab";

export type CloudFilesBrowserRow =
  | { kind: "folder"; folder: CloudFolderRecord }
  | { kind: "file"; file: CloudFileRecord };

export function buildCloudFilesBrowserRows({
  folders,
  files,
}: {
  folders: CloudFolderRecord[];
  files: CloudFileRecord[];
}): CloudFilesBrowserRow[] {
  return [
    ...folders.map((folder) => ({ kind: "folder" as const, folder })),
    ...files.map((file) => ({ kind: "file" as const, file })),
  ];
}

export function isCloudFileSelectable(
  file: CloudFileRecord,
  allowFileTypes: AllowedFileKind[],
): boolean {
  if (allowFileTypes.includes("any")) return true;
  const mime = resolveMime(file.mimeType, file.fileName);
  if (allowFileTypes.includes("image") && isImageMime(mime)) return true;
  if (allowFileTypes.includes("video") && isVideoMime(mime)) return true;
  if (allowFileTypes.includes("audio") && isAudioMime(mime)) return true;
  if (allowFileTypes.includes("pdf") && isPdfMime(mime)) return true;
  if (
    allowFileTypes.includes("document") &&
    (mime.startsWith("text/") ||
      mime.includes("word") ||
      mime.includes("excel") ||
      mime.includes("spreadsheet") ||
      mime.includes("presentation") ||
      mime === "application/pdf")
  ) {
    return true;
  }
  return false;
}

export function getCloudFileKindLabel(file: CloudFileRecord): string {
  const mime = resolveMime(file.mimeType, file.fileName);
  if (isImageMime(mime)) return imageKindLabel(file.fileName);
  if (isVideoMime(mime)) return "Video";
  if (isAudioMime(mime)) return "Audio";
  if (isPdfMime(mime)) return "PDF";
  return getFileTypeDetails(file.fileName).displayName;
}

export function toggleCloudBrowserSelection(
  selectedIds: string[],
  id: string,
): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id];
}

export function allCloudBrowserRowIds(rows: CloudFilesBrowserRow[]): string[] {
  return rows.map((row) =>
    row.kind === "folder" ? row.folder.id : row.file.id,
  );
}

function imageKindLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase();
  return ext ? `${ext} image` : "Image";
}
