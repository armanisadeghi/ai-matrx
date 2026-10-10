/**
 * features/files/components/core/FilePreview/edit-handoff.ts
 *
 * Which editor a file's "Edit" action opens, by preview kind. ONE table so a
 * binary kind can never reach the text/code editor (an image's Edit used to
 * open Monaco on the PNG's raw bytes). Guard: edit-handoff.test.ts.
 */

import type { PreviewKind } from "@/features/files/utils/preview-capabilities";

export type EditHandoff = "text-editor" | "image-editor" | "pdf-studio" | "none";

const TEXT_KINDS: ReadonlySet<string> = new Set(["code", "markdown", "text", "svg", "html"]);

export function editHandoffFor(kind: PreviewKind): EditHandoff {
  if (TEXT_KINDS.has(kind)) return "text-editor";
  if (kind === "image") return "image-editor";
  if (kind === "pdf") return "pdf-studio";
  // audio, video, office, spreadsheet, archive, generic, …: no editor yet.
  return "none";
}

/**
 * Asks the file viewer on this page to switch to its Edit tab. Returns true
 * when a viewer took it (FileTabsBody marks `detail.handled`), so the caller
 * falls back to a route only when there is no viewer to switch.
 */
export function requestEditTab(fileId: string): boolean {
  const detail: { fileId: string; tab: "edit"; handled?: boolean } = { fileId, tab: "edit" };
  window.dispatchEvent(new CustomEvent("cloud-files:open-preview-tab", { detail }));
  return detail.handled === true;
}
