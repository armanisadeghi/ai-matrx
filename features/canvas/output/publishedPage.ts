/**
 * THE one answer to "which published page is this HTML?" for printing it.
 *
 * The canvas_items publication link (artifacts VISION R6:
 * `canvas_items.external_id` ↔ `html_pages.artifact_id`) decides: the page of
 * the version the surface shows (the chat card: its own version; the canvas
 * tab: the chain's latest). Print never depends on what happens to be mounted —
 * no iframe is read. A caller with no canvas item passes the page it already holds.
 */

import { resolveHtmlCanvasPage } from "@/features/html-pages/services/canvasVersionPage";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";

const HTML_SITE_URL = process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://www.mymatrx.com";

/** A page URL as the html site serves it on its own (no frame-mode query). */
export function bareHtmlPageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src, typeof window === "undefined" ? HTML_SITE_URL : window.location.href);
  } catch {
    return null;
  }
  if (!/^\/p\/[^/]+\/?$/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export interface PrintablePageInput {
  /** The canvas item (version) the page is published from — the publication link. */
  readonly canvasItemId?: string | null | undefined;
  /** Which version the surface shows: its own ("self", a chat card) or the chain's newest ("latest", the canvas tab). */
  readonly version?: "self" | "latest" | undefined;
  /** The page URL the caller holds when it has no canvas item (a message print block). */
  readonly pageUrl?: string | null | undefined;
}

/** The page to print, or null when this HTML has no published page yet. */
export async function resolvePrintablePageUrl(input: PrintablePageInput): Promise<string | null> {
  const canvasItemId = input.canvasItemId;
  if (canvasItemId && isMaterializedArtifactId(canvasItemId)) {
    const resolved = await resolveHtmlCanvasPage(canvasItemId.trim(), input.version ?? "self");
    return bareHtmlPageUrl(resolved?.shown.url);
  }
  return bareHtmlPageUrl(input.pageUrl);
}

/** The page's own print URL: opened top-level, it prints itself at natural layout (my-matrx frame script). */
export function pagePrintUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set("print", "1");
  return url.toString();
}

/**
 * The published page shown inside `element` (the first html-site page frame), or null.
 * Print never uses this (see `resolvePrintablePageUrl`); capture/attach still read the
 * mounted frame.
 */
export function publishedPageInElement(element: HTMLElement | null | undefined): string | null {
  if (!element) return null;
  for (const frame of element.querySelectorAll<HTMLIFrameElement>("iframe[src]")) {
    const url = bareHtmlPageUrl(frame.getAttribute("src"));
    if (url) return url;
  }
  return null;
}
