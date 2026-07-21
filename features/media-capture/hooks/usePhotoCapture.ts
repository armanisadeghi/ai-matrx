"use client";

/**
 * features/media-capture/hooks/usePhotoCapture.ts
 *
 * Still-photo capture from a live camera lease. CANVAS IS PRIMARY everywhere
 * (plan §5 invariant 6): the `sourceRect(...)` region of the SOURCE frame is
 * drawn onto a canvas sized to the SOURCE crop (never element offsets, never
 * DPR-scaled layout pixels) and encoded via `canvas.toBlob("image/jpeg", q)`.
 * Base64 / data URLs are banned in this pipeline.
 *
 * `ImageCapture.takePhoto()` is a feature-detected ENHANCEMENT, allowed ONLY
 * for `full-frame` framing AND only when the caller opts in
 * (`allowNativeTakePhoto`) — viewport-crop MUST go through the canvas so the
 * output matches the preview exactly, and WYSIWYG consumers (the PDF scanner)
 * must keep output dims === stream videoWidth×videoHeight, which takePhoto()
 * does not guarantee (it may return full sensor resolution). Any native
 * failure falls back to the canvas path silently — canvas is the contract.
 *
 * The core (`capturePhotoFromVideo`) is dependency-injected (canvas factory)
 * so geometry integration is unit-testable without a DOM camera.
 */

import { useCallback, useState } from "react";
import type {
  FramingMode,
  VisualSourceSettings,
} from "@/features/media-capture/core/capture-types";
import { sourceRect } from "@/features/media-capture/core/geometry";
import type { CameraLease } from "@/features/media-capture/runtime/camera-stream-manager";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal video-frame source: intrinsic dims + drawable. A real
 *  HTMLVideoElement satisfies this; tests pass a stub. */
export type CaptureVideoSource = CanvasImageSource & {
  videoWidth: number;
  videoHeight: number;
};

export interface CapturePhotoArgs {
  /** The live frame source (the preview's <video> element). Intrinsic dims
   *  MUST be nonzero — capture before loadedmetadata is a caller bug. */
  video: CaptureVideoSource;
  framing: FramingMode;
  /** Preview container size in layout pixels — REQUIRED for viewport-crop
   *  (only its aspect is used; results are DPR-independent). */
  container?: { width: number; height: number };
  /** JPEG quality 0..1. Default 0.92. */
  quality?: number;
  /** Camera lease — used for source-settings reporting and (when allowed)
   *  the native ImageCapture enhancement. Optional so device-fallback and
   *  test paths can capture without a lease. */
  lease?: CameraLease | null;
  /**
   * Opt IN to `ImageCapture.takePhoto()` when framing is full-frame. Leave
   * false wherever output dims must equal the stream's videoWidth×videoHeight
   * (the PDF-scanner WYSIWYG contract). Default false.
   */
  allowNativeTakePhoto?: boolean;
  /** Filename prefix. Default "capture" → `capture-<ISO>.jpg`. */
  fileNamePrefix?: string;
}

export interface CapturedPhoto {
  file: File;
  blob: Blob;
  /** Output pixel dimensions (the canvas / decoded native photo). */
  width: number;
  height: number;
  /** Effective source-stream settings at capture time (for metadata.capture).
   *  Facing/frame-rate are null when no lease summary was available. */
  sourceSettings: VisualSourceSettings;
}

export interface CapturePhotoDeps {
  /** Canvas factory — injected for tests. Defaults to document.createElement. */
  createCanvas?: () => HTMLCanvasElement;
  now?: () => Date;
}

// ─── Native ImageCapture (feature-detected, typed without `any`) ────────────

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function getImageCaptureCtor(): ImageCaptureCtor | null {
  const candidate = (globalThis as { ImageCapture?: unknown }).ImageCapture;
  return typeof candidate === "function" ? (candidate as ImageCaptureCtor) : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function captureFileName(prefix: string, when: Date, ext: string): string {
  // ISO with filesystem-hostile characters flattened: 2026-07-21T18-30-05-123Z
  const iso = when.toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${iso}.${ext}`;
}

function sourceSettingsFrom(
  lease: CameraLease | null | undefined,
  video: CaptureVideoSource,
): VisualSourceSettings {
  const effective = lease?.getTrackSummary()?.effective ?? null;
  const facing = effective?.facingMode;
  return {
    width: effective?.width ?? video.videoWidth,
    height: effective?.height ?? video.videoHeight,
    frame_rate: effective?.frameRate ?? null,
    facing_mode: facing === "user" || facing === "environment" ? facing : null,
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolvePromise, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolvePromise(blob);
        else
          reject(
            new Error(
              "[usePhotoCapture] canvas.toBlob returned null — JPEG encode failed " +
                "(zero-sized canvas or encoder failure).",
            ),
          );
      },
      "image/jpeg",
      quality,
    );
  });
}

// ─── Core (pure-ish, DI'd, unit-tested) ──────────────────────────────────────

/**
 * Capture one frame. Canvas path: draw `sourceRect(...)` of the SOURCE frame
 * to a canvas sized to that SOURCE crop, encode JPEG. Native path (opt-in,
 * full-frame only): `ImageCapture.takePhoto()`, canvas fallback on ANY error.
 */
export async function capturePhotoFromVideo(
  args: CapturePhotoArgs,
  deps: CapturePhotoDeps = {},
): Promise<CapturedPhoto> {
  const quality = args.quality ?? 0.92;
  const prefix = args.fileNamePrefix ?? "capture";
  const now = deps.now ? deps.now() : new Date();
  const sourceSettings = sourceSettingsFrom(args.lease, args.video);

  // Native enhancement — ONLY full-frame, ONLY opted in, canvas on any error.
  if (args.allowNativeTakePhoto && args.framing === "full-frame" && args.lease) {
    const Ctor = getImageCaptureCtor();
    const track = args.lease.stream.getVideoTracks()[0];
    if (Ctor && track) {
      try {
        const blob = await new Ctor(track).takePhoto();
        const dims = await imageBlobDimensions(blob);
        const file = new File(
          [blob],
          captureFileName(prefix, now, blob.type === "image/png" ? "png" : "jpg"),
          { type: blob.type || "image/jpeg" },
        );
        return { file, blob, ...dims, sourceSettings };
      } catch (err) {
        // Enhancement only — the canvas path below is the contract.
        console.warn(
          "[usePhotoCapture] ImageCapture.takePhoto() failed — falling back to canvas.",
          err,
        );
      }
    }
  }

  const { videoWidth, videoHeight } = args.video;
  if (args.framing === "viewport-crop" && !args.container) {
    throw new Error(
      "[usePhotoCapture] viewport-crop capture requires the preview container size.",
    );
  }
  const rect = sourceRect(
    args.framing === "viewport-crop" && args.container
      ? args.container.width
      : videoWidth,
    args.framing === "viewport-crop" && args.container
      ? args.container.height
      : videoHeight,
    videoWidth,
    videoHeight,
    args.framing,
  );

  const canvas = deps.createCanvas
    ? deps.createCanvas()
    : document.createElement("canvas");
  // Canvas sized to the SOURCE crop — never element offsets (invariant 5).
  canvas.width = Math.round(rect.sWidth);
  canvas.height = Math.round(rect.sHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("[usePhotoCapture] 2d canvas context unavailable.");
  }
  ctx.drawImage(
    args.video,
    rect.sx,
    rect.sy,
    rect.sWidth,
    rect.sHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await canvasToJpegBlob(canvas, quality);
  const file = new File([blob], captureFileName(prefix, now, "jpg"), {
    type: "image/jpeg",
  });
  return { file, blob, width: canvas.width, height: canvas.height, sourceSettings };
}

async function imageBlobDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UsePhotoCaptureResult {
  /** True while a shutter is in flight. */
  capturing: boolean;
  capturePhoto(args: CapturePhotoArgs): Promise<CapturedPhoto>;
}

export function usePhotoCapture(): UsePhotoCaptureResult {
  const [capturing, setCapturing] = useState(false);

  const capturePhoto = useCallback(async (args: CapturePhotoArgs) => {
    setCapturing(true);
    try {
      return await capturePhotoFromVideo(args);
    } finally {
      setCapturing(false);
    }
  }, []);

  return { capturing, capturePhoto };
}
