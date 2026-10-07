// features/esign/signature-creator/render.ts — every tab's output, made into ONE thing (decision C):
// a transparent PNG in paper ink, longest side <= 1600 px, <= 150 KB.

import { PAPER } from "../contract/paper";
import { ensureStyleFont, fontStack } from "./fonts";
import type { SignatureStyle } from "./styles";

export const MAX_SIDE = 1600;
export const MAX_BYTES = 150_000;

const INK = (() => {
  const hex = PAPER.ink;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
})();

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot draw a signature image.");
  return ctx;
}

/** Crops to the ink bounds (plus a margin), fits the side limit, and re-encodes under the byte limit. */
export function trimAndEncode(source: HTMLCanvasElement): string {
  const ctx = ctxOf(source);
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("There is nothing drawn in this image.");
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04) + 2;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width, maxX + pad + 1) - sx;
  const sh = Math.min(height, maxY + pad + 1) - sy;
  let scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  for (let attempt = 0; attempt < 12; attempt++) {
    const out = makeCanvas(sw * scale, sh * scale);
    const octx = ctxOf(out);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const url = out.toDataURL("image/png");
    // base64 length * 3/4 = bytes
    if ((url.length - 22) * 0.75 <= MAX_BYTES) return url;
    scale *= 0.8;
  }
  throw new Error("This image is too detailed to keep. Try a simpler one.");
}

/** Repaints pixels as paper ink, alpha from the supplied per-pixel function. */
function inkify(canvas: HTMLCanvasElement, alphaOf: (r: number, g: number, b: number, a: number) => number): void {
  const ctx = ctxOf(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = alphaOf(d[i], d[i + 1], d[i + 2], d[i + 3]);
    d[i] = INK[0];
    d[i + 1] = INK[1];
    d[i + 2] = INK[2];
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** A typed name in one handwriting style, as a transparent ink PNG. */
export async function renderTypedPng(text: string, style: SignatureStyle): Promise<string> {
  const value = text.trim();
  if (!value) throw new Error("Type a name first.");
  await ensureStyleFont(style, value);
  const px = 360;
  const probe = ctxOf(makeCanvas(10, 10));
  probe.font = `${px}px ${fontStack(style)}`;
  const width = Math.ceil(probe.measureText(value).width) + px;
  const canvas = makeCanvas(Math.min(width, 9000), px * 2);
  const ctx = ctxOf(canvas);
  ctx.font = `${px}px ${fontStack(style)}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PAPER.ink;
  ctx.fillText(value, px / 2, px * 1.3);
  return trimAndEncode(canvas);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

/**
 * Any picture of a signature (the pad's PNG/JPEG, an uploaded photo) -> transparent paper-ink PNG.
 * Already-transparent images keep their alpha; flat images lose their paper colour.
 */
export async function imageToInkPng(src: string): Promise<string> {
  const img = await loadImage(src);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const k = Math.min(1, 2400 / longest);
  const canvas = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  const ctx = ctxOf(canvas);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let seeThrough = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) seeThrough++;
    if (d[i + 3] >= 200) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  const pixels = d.length / 4;
  if (seeThrough / pixels > 0.05) {
    inkify(canvas, (_r, _g, _b, a) => a / 255);
  } else {
    // Paper brightness = the 85th percentile of the opaque pixels; ink is whatever is well under it.
    let total = 0;
    for (let v = 0; v < 256; v++) total += hist[v];
    let acc = 0;
    let paper = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= total * 0.85) { paper = Math.max(v, 60); break; }
    }
    const hi = paper * 0.9;
    const lo = paper * 0.5;
    inkify(canvas, (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const t = Math.min(1, Math.max(0, (hi - lum) / (hi - lo)));
      return t * (a / 255);
    });
  }
  return trimAndEncode(canvas);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function pngBase64ToDataUrl(base64: string, mime = "image/png"): string {
  return `data:${mime};base64,${base64}`;
}
