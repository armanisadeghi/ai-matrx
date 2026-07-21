"use client";

/**
 * features/media-capture/components/DeviceFallbackInput.tsx
 *
 * OS-camera fallback: a hidden `<input type="file" accept="image/*" capture>`
 * normalized into the SAME output contract as the in-page shutter
 * (`CapturedPhoto` + `PhotoCaptureMetadata` with `source: "capture-input"`).
 *
 * EXIF handling: the raw OS-camera JPEG carries orientation + GPS/EXIF. We
 * apply orientation and STRIP all metadata by re-encoding through a canvas:
 * `createImageBitmap(file, { imageOrientation: "from-image" })` where
 * supported (falls back to a plain decode — browsers that ignore the option
 * already auto-orient per the CSS `image-orientation: from-image` default in
 * modern engines). Oversized images are DOWNSCALED to a pixel budget rather
 * than OOMing a phone tab.
 */

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { ChangeEvent } from "react";
import {
  buildPhotoCaptureMetadata,
  type PhotoCaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { captureFileName } from "@/features/media-capture/hooks/usePhotoCapture";

/** ~24 MP — beyond this the re-encode downscales (uniform) to stay bounded. */
const MAX_PIXELS = 24_000_000;
const DEFAULT_QUALITY = 0.92;

export interface DeviceFallbackPhoto {
  file: File;
  blob: Blob;
  width: number;
  height: number;
  metadata: PhotoCaptureMetadata;
}

export interface DeviceFallbackInputProps {
  /** `capture` attribute — "environment" | "user" opens the OS camera
   *  directly on mobile; omit for a plain picker. */
  captureFacing?: "environment" | "user";
  /** Stamped into metadata.capture.source_feature. */
  sourceFeature: string;
  quality?: number;
  onPhoto: (photo: DeviceFallbackPhoto) => void;
  onError: (error: Error) => void;
}

export interface DeviceFallbackInputHandle {
  open(): void;
}

async function decodeOriented(file: File): Promise<ImageBitmap> {
  try {
    // "from-image" applies the EXIF orientation during decode.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older engines reject the options bag — decode plain.
    return await createImageBitmap(file);
  }
}

/**
 * Re-encode `file` through a canvas: orientation applied, EXIF/GPS stripped,
 * downscaled above the pixel budget. Exported for reuse by import flows.
 */
export async function normalizeCapturedImageFile(
  file: File,
  opts: { sourceFeature: string; quality?: number },
): Promise<DeviceFallbackPhoto> {
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const bitmap = await decodeOriented(file);
  try {
    const pixels = bitmap.width * bitmap.height;
    const scale = pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / pixels) : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[DeviceFallbackInput] 2d canvas context unavailable.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolvePromise, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolvePromise(b)
            : reject(
                new Error(
                  "[DeviceFallbackInput] canvas.toBlob returned null — JPEG re-encode failed.",
                ),
              ),
        "image/jpeg",
        quality,
      );
    });

    const outFile = new File([blob], captureFileName("capture", new Date(), "jpg"), {
      type: "image/jpeg",
    });
    const metadata = buildPhotoCaptureMetadata({
      source: "capture-input",
      sourceFeature: opts.sourceFeature,
      sourceSettings: { width, height, frame_rate: null, facing_mode: null },
      framing: "full-frame",
      mirroredOutput: false,
    });
    return { file: outFile, blob, width, height, metadata };
  } finally {
    bitmap.close();
  }
}

export const DeviceFallbackInput = forwardRef<
  DeviceFallbackInputHandle,
  DeviceFallbackInputProps
>(function DeviceFallbackInput(
  { captureFacing, sourceFeature, quality, onPhoto, onError },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    open() {
      inputRef.current?.click();
    },
  }));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void normalizeCapturedImageFile(file, {
      sourceFeature,
      ...(quality !== undefined ? { quality } : {}),
    })
      .then(onPhoto)
      .catch((err: unknown) =>
        onError(err instanceof Error ? err : new Error(String(err))),
      );
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      {...(captureFacing ? { capture: captureFacing } : {})}
      onChange={handleChange}
      className="hidden"
      aria-hidden
      tabIndex={-1}
    />
  );
});
