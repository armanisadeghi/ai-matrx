"use client";

/**
 * THE capture port for a published HTML page (an exact image of it). The
 * capture engine (server Chromium — lane L3) plugs in with
 * `setPageCaptureEngine`; every caller — the canvas tab's Copy image, a
 * message's Print, Full Print's frame pre-pass — asks here. Until an engine is
 * plugged, there is no picture and callers say so honestly.
 */

import { setFramePrintCapture } from "@ai-matrx/chat/host/frame-print";
import { bareHtmlPageUrl } from "./publishedPage";

export interface PageCaptureRequest {
  /** The published page (bare URL). */
  readonly pageUrl?: string | null | undefined;
  /** The page's HTML, when no page is known (a message's source). */
  readonly html?: string | null | undefined;
  /** The viewer's width in CSS pixels. */
  readonly width?: number | undefined;
}

/** Answers an image (PNG blob) of the page, full height, at the given width — or null. */
export type PageCaptureEngine = (request: PageCaptureRequest) => Promise<Blob | null>;

let engine: PageCaptureEngine | null = null;

export function setPageCaptureEngine(next: PageCaptureEngine | null): void {
  engine = next;
}

export function hasPageCaptureEngine(): boolean {
  return engine !== null;
}

export async function capturePage(request: PageCaptureRequest): Promise<Blob | null> {
  return engine ? engine(request) : null;
}

/** Shown in a page's place in a composed print when no picture can be made. */
export const PAGE_IMAGE_UNAVAILABLE = "Page image unavailable — print the page from its card.";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("could not read the image"));
    reader.readAsDataURL(blob);
  });
}

// Full Print (chat package) asks for a picture of each live page frame through here.
setFramePrintCapture(async (frame) => {
  const pageUrl = bareHtmlPageUrl(frame.getAttribute("src"));
  if (!pageUrl || !engine) return null;
  const image = await engine({ pageUrl, width: frame.clientWidth || undefined });
  return image ? blobToDataUrl(image) : null;
});
