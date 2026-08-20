/**
 * lib/qr/decode.ts — THE platform QR-code decoder (client-side, in memory).
 *
 * One primitive, three inputs (a File/Blob, an `ImageData` frame, a
 * `<video>`/`<canvas>` element), one answer: the text the QR encodes, or
 * `null` when no code is present. Nothing here uploads, stores, or persists
 * anything — the bytes live in a canvas for the length of one call.
 *
 * Engine order:
 *   1. `BarcodeDetector` — native, fast, handles rotation and poor contrast.
 *   2. `jsqr` — pure-JS fallback (lazily imported, so it only enters the
 *      bundle of a surface that actually decodes), for Safari/Firefox where
 *      the native detector does not exist.
 *
 * 🚨 Reach for THIS, never a second decoder. If a surface needs a new input
 * shape, add an adapter here.
 */

/** Longest edge we rasterise to. Big enough for a phone screenshot of a QR,
 *  small enough that a 48MP photo cannot stall the main thread. */
const MAX_EDGE = 1600;

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource | ImageBitmap | Blob) => Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

function nativeDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** True when the browser can decode without downloading the JS fallback. */
export function hasNativeQrDetector(): boolean {
  return nativeDetector() !== null;
}

async function decodeNative(
  source: CanvasImageSource | ImageBitmap | Blob,
): Promise<string | null> {
  const Ctor = nativeDetector();
  if (!Ctor) return null;
  try {
    const detector = new Ctor({ formats: ["qr_code"] });
    const results = await detector.detect(source);
    const value = results.find((r) => r.rawValue)?.rawValue;
    return value ? value : null;
  } catch {
    // A detector that throws (unsupported format, decode error) is a miss,
    // never a crash — the jsqr fallback still gets its turn.
    return null;
  }
}

async function decodeWithJsQr(frame: ImageData): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const both = jsQR(frame.data, frame.width, frame.height, {
    inversionAttempts: "attemptBoth",
  });
  return both?.data ? both.data : null;
}

/** Draw any image source onto a canvas, capped at {@link MAX_EDGE}. */
function toImageData(
  source: CanvasImageSource,
  width: number,
  height: number,
): ImageData | null {
  if (!width || !height) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Decode a QR code out of an already-rasterised frame. */
export async function decodeQrFromImageData(
  frame: ImageData,
): Promise<string | null> {
  return (await decodeWithJsQr(frame)) ?? null;
}

/**
 * Decode a QR code out of a live `<video>` (a camera preview) or a `<canvas>`.
 * Returns `null` when the current frame holds no code — call it on a tick.
 */
export async function decodeQrFromElement(
  element: HTMLVideoElement | HTMLCanvasElement,
): Promise<string | null> {
  const width =
    element instanceof HTMLVideoElement ? element.videoWidth : element.width;
  const height =
    element instanceof HTMLVideoElement ? element.videoHeight : element.height;
  if (!width || !height) return null;

  const native = await decodeNative(element);
  if (native) return native;

  const frame = toImageData(element, width, height);
  return frame ? decodeQrFromImageData(frame) : null;
}

/**
 * Decode a QR code out of an image File/Blob — a pasted screenshot, a dropped
 * PNG, a photo from the OS camera sheet.
 *
 * Resolves `null` when the image holds no QR code. Throws only when the file
 * is not decodable as an image at all.
 */
export async function decodeQrFromImageFile(
  file: Blob,
): Promise<string | null> {
  // The native detector accepts a Blob directly on Chromium — cheapest path.
  const direct = await decodeNative(file);
  if (direct) return direct;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file could not be read as an image.");
  }
  try {
    const viaBitmap = await decodeNative(bitmap);
    if (viaBitmap) return viaBitmap;
    const frame = toImageData(bitmap, bitmap.width, bitmap.height);
    return frame ? decodeQrFromImageData(frame) : null;
  } finally {
    bitmap.close();
  }
}
