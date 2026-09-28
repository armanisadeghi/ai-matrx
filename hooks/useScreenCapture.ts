"use client";

/**
 * useScreenCapture
 *
 * Two distinct capture strategies:
 *
 * captureTab  — html-to-image DOM re-paint. No browser picker. Silently captures
 *               the page content visible at call time. Works well for simple
 *               pages; may produce blank/incorrect results for elements that use
 *               backdrop-filter, canvas, WebGL, or CSS custom properties.
 *               Caller is responsible for hiding any overlay before calling.
 *
 * captureScreen — getDisplayMedia Screen Capture API. Shows a native browser
 *                 picker (preferCurrentTab pre-selects the active tab so the
 *                 user just has to confirm). Pixel-perfect regardless of CSS.
 *                 User must grant permission each time.
 *
 * Both methods return a File (PNG) on success, or throw on failure.
 * "User cancelled" is signalled by throwing a DOMException with name
 * "NotAllowedError" or "AbortError" — callers should handle those silently.
 */

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CaptureMethod = "tab" | "screen";

export interface ScreenCaptureOptions {
  /** Elements to hide before capturing (visibility toggled, always restored). */
  hideElements?: HTMLElement[];
  /** Filename for the returned File. Defaults to screenshot-<timestamp>.png */
  filename?: string;
}

export interface ScreenCaptureResult {
  file: File;
  dataUrl: string;
}

export interface ElementThumbnailOptions {
  /** Longest output edge in CSS pixels. Defaults to 320. */
  maxEdge?: number;
  /** WebP quality from 0–1. Defaults to 0.62. */
  quality?: number;
}

// ─── Low-level capture primitives ─────────────────────────────────────────────

/**
 * An image the renderer cannot fetch (a cross-origin avatar with no CORS
 * header — every signed-in page has one) used to REJECT the whole capture:
 * html-to-image sets the failed image's src to "" and its onerror rejects.
 * It becomes a transparent pixel instead, so the capture always completes
 * (page-pass 2026-09-27: "Tab capture failed" on /notes for every user).
 */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const RESILIENT_IMAGE_OPTIONS = {
  imagePlaceholder: TRANSPARENT_PIXEL,
  onImageErrorHandler: () => undefined,
} as const;

/**
 * Capture the current page via html2canvas.
 * Caller must already have hidden any overlays; this function does not hide anything.
 */
export async function captureTabViaCanvas(
  opts: { filename?: string; ignoreSelector?: string } = {},
): Promise<ScreenCaptureResult> {
  const htmlToImage = await import("html-to-image");

  const ignoreSelector = opts.ignoreSelector;
  const filter = ignoreSelector
    ? (node: HTMLElement) => {
        if (node?.matches && node.matches(ignoreSelector)) {
          return false;
        }
        return true;
      }
    : undefined;

  const dataUrl = await htmlToImage.toPng(document.body, {
    pixelRatio: window.devicePixelRatio || 1,
    filter,
    // Exactly what the person sees: the viewport, shell header included (it
    // is what says where they were). Proven live 2026-09-27: without the
    // viewport box the glass header dropped out of the capture.
    width: window.innerWidth,
    height: window.innerHeight,
    // The page's <img>s were loaded WITHOUT cors, and the browser reuses that
    // cached response for html-to-image's CORS fetch — so the CDN avatar
    // failed (two console errors, a blank avatar) although the CDN does send
    // Access-Control-Allow-Origin. A cache-busted URL is a fresh CORS request.
    cacheBust: true,
    ...RESILIENT_IMAGE_OPTIONS,
  });

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const filename = opts.filename ?? `screenshot-${Date.now()}.png`;
  return { file: new File([blob], filename, { type: "image/png" }), dataUrl };
}

/**
 * Capture a small, display-ready thumbnail of one DOM element.
 *
 * The renderer is loaded only when capture is requested. Output is capped at
 * one CSS pixel per target pixel and encoded as WebP, keeping this suitable
 * for transient UI previews without uploading or retaining full screenshots.
 */
export async function captureElementThumbnail(
  element: HTMLElement,
  options: ElementThumbnailOptions = {},
): Promise<Blob | null> {
  const sourceWidth = Math.max(1, element.offsetWidth);
  const sourceHeight = Math.max(1, element.offsetHeight);
  const maxEdge = Math.max(64, options.maxEdge ?? 320);
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const canvasWidth = Math.max(1, Math.round(sourceWidth * scale));
  const canvasHeight = Math.max(1, Math.round(sourceHeight * scale));
  const htmlToImage = await import("html-to-image");
  const canvas = await htmlToImage.toCanvas(element, {
    pixelRatio: 1,
    canvasWidth,
    canvasHeight,
    skipFonts: true,
    ...RESILIENT_IMAGE_OPTIONS,
  });

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", options.quality ?? 0.62);
  });
}

/**
 * Capture via getDisplayMedia (Screen Capture API).
 * Passes preferCurrentTab: true so the browser pre-selects the active tab in the picker.
 */
export async function captureViaDisplayMedia(
  opts: { filename?: string } = {},
): Promise<ScreenCaptureResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen Capture API not supported in this browser");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    // preferCurrentTab pre-selects this tab in the Chrome picker
    preferCurrentTab: true,
    video: true,
    audio: false,
  } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });

  // Play one frame in an offscreen video then draw to canvas
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();

  // Wait for a real frame to be available
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.addEventListener("canplay", () => resolve(), { once: true });
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D canvas context");
  }
  ctx.drawImage(video, 0, 0);

  video.pause();
  video.srcObject = null;
  stream.getTracks().forEach((t) => t.stop());

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("canvas.toBlob failed"))),
      "image/png",
    ),
  );
  const filename = opts.filename ?? `screenshot-${Date.now()}.png`;
  return { file: new File([blob], filename, { type: "image/png" }), dataUrl };
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseScreenCaptureOptions {
  /** CSS selector or element refs to hide before capturing (restored afterwards). */
  hideSelectors?: string[];
  onCaptured?: (result: ScreenCaptureResult, method: CaptureMethod) => void;
  onError?: (err: unknown, method: CaptureMethod) => void;
}

export function useScreenCapture(opts: UseScreenCaptureOptions = {}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastResult, setLastResult] = useState<ScreenCaptureResult | null>(
    null,
  );

  const withHidden = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      if (!opts.hideSelectors?.length) return fn();

      const elements = opts.hideSelectors.flatMap((sel) =>
        Array.from(document.querySelectorAll<HTMLElement>(sel)),
      );
      const prev = elements.map((el) => el.style.visibility);
      elements.forEach((el) => (el.style.visibility = "hidden"));

      // Two rAF cycles to ensure the browser repaints before capture
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );

      try {
        return await fn();
      } finally {
        elements.forEach((el, i) => (el.style.visibility = prev[i]));
      }
    },
    [opts.hideSelectors],
  );

  const captureTab = useCallback(
    async (
      captureOpts: { filename?: string; ignoreSelector?: string } = {},
    ) => {
      setIsCapturing(true);
      try {
        const result = await withHidden(() => captureTabViaCanvas(captureOpts));
        setLastResult(result);
        opts.onCaptured?.(result, "tab");
        return result;
      } catch (err) {
        opts.onError?.(err, "tab");
        throw err;
      } finally {
        setIsCapturing(false);
      }
    },
    [withHidden, opts],
  );

  const captureScreen = useCallback(
    async (captureOpts: { filename?: string } = {}) => {
      setIsCapturing(true);
      try {
        const result = await withHidden(() =>
          captureViaDisplayMedia(captureOpts),
        );
        setLastResult(result);
        opts.onCaptured?.(result, "screen");
        return result;
      } catch (err) {
        opts.onError?.(err, "screen");
        throw err;
      } finally {
        setIsCapturing(false);
      }
    },
    [withHidden, opts],
  );

  return { captureTab, captureScreen, isCapturing, lastResult };
}
