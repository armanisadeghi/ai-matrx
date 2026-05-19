"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Mask painting state for the image editor.
 *
 * Drives a transparent overlay <canvas> rendered above Filerobot's image.
 * Painting strokes white pixels (any non-zero alpha is "in mask"). Erase mode
 * uses globalCompositeOperation = "destination-out" to subtract from the
 * mask. The canvas is exported on demand as a PNG Blob with the same pixel
 * dimensions as the underlying source image so the Python backend can
 * align it 1:1 against the source.
 *
 * Mode lifecycle:
 *   - "off"   → overlay hidden, pointer events fall through to Filerobot
 *   - "draw"  → overlay visible, brush adds to the mask
 *   - "erase" → overlay visible, brush removes from the mask
 *
 * `hasPixels` is a coarse "is the mask non-empty" signal used to decide
 * whether to attach `mask_id` to AI ops.
 */
export type MaskMode = "off" | "draw" | "erase";

export interface MaskState {
  mode: MaskMode;
  active: boolean;
  brushSize: number;
  hasPixels: boolean;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  setMode: (m: MaskMode) => void;
  toggle: () => void;
  setBrushSize: (n: number) => void;
  markDirty: () => void;
  clear: () => void;
  exportPng: () => Promise<Blob | null>;
}

export function useMaskState(): MaskState {
  const [mode, setMode] = useState<MaskMode>("off");
  const [brushSize, setBrushSize] = useState<number>(32);
  const [hasPixels, setHasPixels] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const markDirty = useCallback(() => {
    setHasPixels(true);
  }, []);

  const clear = useCallback(() => {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, c.width, c.height);
    }
    setHasPixels(false);
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => (m === "off" ? "draw" : "off"));
  }, []);

  const exportPng = useCallback(async (): Promise<Blob | null> => {
    const c = canvasRef.current;
    if (!c) return null;
    return new Promise<Blob | null>((resolve) => {
      c.toBlob((blob) => resolve(blob), "image/png");
    });
  }, []);

  return {
    mode,
    active: mode !== "off",
    brushSize,
    hasPixels,
    canvasRef,
    setMode,
    toggle,
    setBrushSize,
    markDirty,
    clear,
    exportPng,
  };
}
