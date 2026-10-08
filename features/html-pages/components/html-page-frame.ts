/**
 * The two contracts every inline HTML page preview shares.
 *
 * 1. HEIGHT. The published page is served by the html site (mymatrx.com), whose
 *    /p/[id] route injects a frame script that posts the page's content height
 *    to its parent (`my-matrx/lib/render/servedHtmlDocument.js`). The chat
 *    preview sizes the frame to it. A message is accepted only when it comes
 *    FROM that frame's window AND from the page's own origin (the apex/www pair
 *    of the same host counts as one — the apex 307s to www).
 *
 * 2. ONE CANVAS PATH. Every "Open in canvas" for an html page opens the `html`
 *    canvas type with the page SOURCE, which the canvas renders through
 *    HtmlArtifact → HtmlInlinePreview(fill) → HtmlAppFrame, with the app
 *    sandbox. There is no second path that opens a page URL in the generic
 *    `iframe` web view (stricter sandbox: no dialogs, no downloads).
 */

/** Must equal HEIGHT_MESSAGE_TYPE in my-matrx/lib/render/servedHtmlDocument.js. */
export const HTML_PAGE_HEIGHT_MESSAGE = "matrx-html-page:height";

/** A height above this is not a page, it is a bug or an attack — ignore it. */
const MAX_REPORTED_HEIGHT = 100_000;

/** The origins a published page URL may legitimately answer from. */
export function pageOrigins(pageUrl: string | null | undefined): string[] {
  if (!pageUrl) return [];
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];
  const host = url.host;
  const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  return [`${url.protocol}//${host}`, `${url.protocol}//${twin}`];
}

/**
 * The content height a page reported, or null when the message is not a valid
 * height report from THIS frame's page.
 */
export function readPageHeight(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  pageUrl: string | null | undefined,
  frameWindow: Window | null | undefined,
): number | null {
  if (!frameWindow || event.source !== frameWindow) return null;
  if (!pageOrigins(pageUrl).includes(event.origin)) return null;
  const data = event.data as { type?: unknown; height?: unknown } | null;
  if (!data || typeof data !== "object" || data.type !== HTML_PAGE_HEIGHT_MESSAGE) return null;
  const height = data.height;
  if (typeof height !== "number" || !Number.isFinite(height)) return null;
  if (height <= 0 || height > MAX_REPORTED_HEIGHT) return null;
  return Math.ceil(height);
}

/**
 * 3. FIT. The inline chat card asks the page to fit its frame (`?fit=card`):
 *    a page a little wider than the card is scaled to the card's width so its
 *    layout survives; only a phone-width card reflows. A page opened on its
 *    own or in the canvas app frame carries no parameter and is never scaled
 *    (scaling breaks games and drag code). Must match MODE in the frame script.
 */
export const CARD_FIT_PARAM = "fit";
export const CARD_FIT_VALUE = "card";

/** The URL the inline card frames: the page URL with `?fit=card`. */
export function cardFrameUrl(pageUrl: string | null | undefined): string | undefined {
  if (!pageUrl) return undefined;
  try {
    const url = new URL(pageUrl);
    url.searchParams.set(CARD_FIT_PARAM, CARD_FIT_VALUE);
    return url.toString();
  } catch {
    return pageUrl;
  }
}

/** The ONE canvas content for an html page — see the header. */
export function htmlPageCanvasContent({
  code,
  title,
  messageId,
  canvasItemId,
}: {
  code: string;
  title: string;
  messageId?: string;
  /** The version chain the canvas tab follows (it shows the chain's latest). */
  canvasItemId?: string;
}) {
  return {
    type: "html" as const,
    data: code,
    metadata: {
      title,
      ...(messageId ? { sourceMessageId: messageId } : {}),
      ...(canvasItemId ? { canvasItemId } : {}),
    },
  };
}
