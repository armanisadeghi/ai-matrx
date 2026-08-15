/**
 * copy-format — the ONE human/agent shape for image-manager copy actions.
 *
 * Shared by the per-image metadata sheet and the image grids so the row, the
 * record, and the list copy never drift (agent-copy doctrine: add the shared
 * summary once, never duplicate it across files).
 *
 * MEDIA RULES (see lib/media/agent-payload.ts): image rows are the worst
 * offenders for signed URLs — a `CloudFile` carries `url`/`signedUrl`/
 * `downloadUrl` (all expiring) plus `filePath` (a raw storage path). Every
 * agent shape here goes through `mediaSafe` and leads with `agentFileRef`, so
 * the agent gets a durable `file_id` instead of a link that dies in days.
 */

import type { CloudFile } from "@/features/files/types";
import { formatFileSize } from "@/features/files/utils/format";
import { agentFileRef, mediaSafe } from "@/lib/media/agent-payload";

function visibilityLabel(visibility: CloudFile["visibility"]): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "personal":
      return "Personal";
    case "internal":
      return "Organization";
    case "link":
      return "Anyone with the link";
    default:
      return visibility;
  }
}

/** Dimensions live in the metadata bag when the renderer knows them. */
function dimensions(file: CloudFile): string | null {
  const bag = file.metadata ?? {};
  const width = bag.width ?? bag.image_width;
  const height = bag.height ?? bag.image_height;
  if (typeof width === "number" && typeof height === "number") {
    return `${width} × ${height}`;
  }
  return null;
}

/**
 * One image as the metadata sheet renders it — the `label: value` lines the
 * user is actually looking at.
 */
export function imageFileHumanSummary(file: CloudFile): string {
  const lines: Array<[string, string | null]> = [
    ["Name", file.fileName],
    ["Size", formatFileSize(file.fileSize)],
    ["Type", file.mimeType || "—"],
    ["Dimensions", dimensions(file)],
    ["Visibility", visibilityLabel(file.visibility)],
    ["Version", `v${file.currentVersion}`],
    ["Updated", file.updatedAt],
    ["Created", file.createdAt],
    ["File id", file.id],
    ["Checksum", file.checksum],
  ];
  return lines
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/** Compact one-liner for list/grid rows. */
export function imageRowSummary(file: CloudFile): string {
  const parts = [
    file.fileName,
    formatFileSize(file.fileSize),
    dimensions(file),
    visibilityLabel(file.visibility),
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Agent-safe data for a single image: durable identity first, then the
 * sanitized row. Never emits a signed URL or a storage path.
 */
export function imageFileAgentData(file: CloudFile): Record<string, unknown> {
  return {
    file_ref: agentFileRef(file),
    dimensions: dimensions(file),
    visibility: visibilityLabel(file.visibility),
    file: mediaSafe(file),
  };
}

/** Agent-safe projection for list/grid copy — the core fields, per row. */
export function imageListAgentRows(files: CloudFile[]): unknown[] {
  return files.map((file) => ({
    ...agentFileRef(file),
    dimensions: dimensions(file),
    visibility: visibilityLabel(file.visibility),
    updated_at: file.updatedAt,
  }));
}

/** Human flavor for a whole grid/list. */
export function imageListHumanSummary(files: CloudFile[]): string {
  return files.map(imageRowSummary).join("\n");
}
