"use client";

/**
 * Copy HTML / Download .html — ONE path for the chat card's toolbar and the
 * canvas tab's menu. Both go through the kit doors (`copyText`, `downloadFile`)
 * and hand over the HTML of the version the surface SHOWS (the card: its own;
 * the canvas tab: the chain's latest, read by `resolveHtmlCanvasPage`).
 */

import { copyText } from "@ai-matrx/kit/clipboard";
import { downloadFile } from "@ai-matrx/kit/download";
import { toast } from "@/lib/toast";
import { resolveHtmlCanvasPage } from "@/features/html-pages/services/canvasVersionPage";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";

export function htmlPageFileName(title: string): string {
  const base = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  return `${base || "page"}.html`;
}

export async function copyHtmlSource(html: string): Promise<boolean> {
  return copyText(html, {
    successMessage: "Copied HTML",
    notify: (message, kind) => (kind === "error" ? toast.error(message) : toast.success(message)),
  });
}

export function downloadHtmlSource(title: string, html: string): void {
  downloadFile(htmlPageFileName(title), html, "text/html");
}

/**
 * The HTML the surface shows: the saved version (`self` for a card, `latest` for
 * the canvas tab), else the HTML the caller holds (an unsaved page).
 */
export async function resolveShownHtml(input: {
  canvasItemId?: string | null | undefined;
  version: "self" | "latest";
  held: string;
}): Promise<string> {
  const id = input.canvasItemId?.trim();
  if (id && isMaterializedArtifactId(id)) {
    const resolved = await resolveHtmlCanvasPage(id, input.version);
    if (resolved?.shown.html) return resolved.shown.html;
  }
  return input.held;
}
