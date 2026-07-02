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

// ─── Low-level capture primitives ─────────────────────────────────────────────

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
  });

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const filename = opts.filename ?? `screenshot-${Date.now()}.png`;
  return { file: new File([blob], filename, { type: "image/png" }), dataUrl };
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
