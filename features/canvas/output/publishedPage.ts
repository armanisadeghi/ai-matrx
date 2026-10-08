/**
 * THE one answer to "which published page is this HTML?" for printing it.
 *
 * Today: the page the viewer is looking at — the `<iframe>` inside the body
 * (the canvas tab's app frame, the chat card's frame) whose page lives on the
 * html site. The canvas_items publication link (artifacts VISION R6:
 * `canvas_items.external_id` ↔ `html_pages.artifact_id`, lane L4) plugs in
 * HERE and nowhere else: when an item has a canvas item id, look its page up
 * first.
 */

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

/** The published page shown inside `element` (the first html-site page frame), or null. */
export function publishedPageInElement(element: HTMLElement | null | undefined): string | null {
  if (!element) return null;
  for (const frame of element.querySelectorAll<HTMLIFrameElement>("iframe[src]")) {
    const url = bareHtmlPageUrl(frame.getAttribute("src"));
    if (url) return url;
  }
  return null;
}

export interface PrintablePageInput {
  /** The rendered body (a canvas tab's element, a chat card). */
  readonly element?: HTMLElement | null | undefined;
  /** The page URL the caller already holds (the chat card knows its own). */
  readonly pageUrl?: string | null | undefined;
  /** The canvas item (version) the page is published from — L4's publication link. */
  readonly canvasItemId?: string | null | undefined;
}

/** The page to print, or null when this HTML has no published page yet. */
export async function resolvePrintablePageUrl(input: PrintablePageInput): Promise<string | null> {
  return bareHtmlPageUrl(input.pageUrl) ?? publishedPageInElement(input.element);
}

/** The page's own print URL: opened top-level, it prints itself at natural layout (my-matrx frame script). */
export function pagePrintUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set("print", "1");
  return url.toString();
}
