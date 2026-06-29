"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Paintbrush, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { MaskState } from "./use-mask-state";

interface Props {
  canvasAreaRef: React.MutableRefObject<HTMLDivElement | null>;
  mask: MaskState;
  /** Natural source dimensions — the backing canvas is sized to these so
   *  the exported mask aligns 1:1 with the source (backend 400s otherwise). */
  sourceDims: { width: number; height: number } | null;
}

/**
 * Transparent overlay <canvas> for painting masks. Floats above the IMAGE
 * CONTENT rectangle (not Filerobot's whole workspace canvas), so strokes
 * land where the cursor is even when the image is letterboxed inside the
 * workspace. The backing canvas is sized to the SOURCE image's natural
 * dimensions, so `toBlob()` produces a mask that matches the source pixel
 * grid exactly — the contract the backend enforces (mask dims must equal
 * source dims, else 400).
 *
 * Limitation: assumes Filerobot's default contain-fit at zoom = 1. If the
 * user zooms/pans the workspace the overlay won't track the transform;
 * masking is intended to be used at the default fit.
 */
export function MaskOverlay({ canvasAreaRef, mask, sourceDims }: Props) {
  const {
    mode,
    active,
    brushSize,
    canvasRef,
    setMode,
    setBrushSize,
    markDirty,
    clear,
  } = mask;
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Track the displayed IMAGE content rect: the contain-fit rectangle of the
  // source aspect ratio inside Filerobot's workspace canvas. Strokes map
  // into this rect; the backing canvas exports at source dims.
  useEffect(() => {
    if (!active || !sourceDims) {
      setBox(null);
      return undefined;
    }
    const area = canvasAreaRef.current;
    if (!area) return undefined;

    const findTargetCanvas = (): HTMLCanvasElement | null => {
      const canvases = area.querySelectorAll<HTMLCanvasElement>(
        ".konvajs-content canvas, canvas",
      );
      let best: HTMLCanvasElement | null = null;
      let bestArea = 0;
      canvases.forEach((c) => {
        if (canvasRef.current === c) return; // skip our own mask canvas
        const a = c.clientWidth * c.clientHeight;
        if (a > bestArea) {
          bestArea = a;
          best = c;
        }
      });
      return best;
    };

    const measure = () => {
      const target = findTargetCanvas();
      if (!target) {
        setBox(null);
        return;
      }
      const areaRect = area.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      // Contain-fit the source aspect ratio inside the workspace canvas so
      // the overlay covers exactly the visible image, not the letterbox.
      const sourceAspect = sourceDims.width / sourceDims.height;
      const canvasAspect = rect.width / rect.height;
      let displayW: number;
      let displayH: number;
      if (sourceAspect > canvasAspect) {
        displayW = rect.width;
        displayH = rect.width / sourceAspect;
      } else {
        displayH = rect.height;
        displayW = rect.height * sourceAspect;
      }
      const offsetX = (rect.width - displayW) / 2;
      const offsetY = (rect.height - displayH) / 2;
      setBox({
        left: rect.left - areaRect.left + offsetX,
        top: rect.top - areaRect.top + offsetY,
        width: displayW,
        height: displayH,
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(area);
    const target = findTargetCanvas();
    if (target) ro.observe(target);
    const t1 = setTimeout(measure, 250);
    const t2 = setTimeout(measure, 750);
    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, canvasAreaRef, canvasRef, sourceDims]);

  // Keep the backing canvas sized to the SOURCE natural dimensions so the
  // exported mask matches the source pixel grid.
  useEffect(() => {
    if (!sourceDims) return;
    const c = canvasRef.current;
    if (!c) return;
    if (c.width !== sourceDims.width || c.height !== sourceDims.height) {
      const tmp = document.createElement("canvas");
      tmp.width = c.width;
      tmp.height = c.height;
      const tmpCtx = tmp.getContext("2d");
      if (tmpCtx) tmpCtx.drawImage(c, 0, 0);
      c.width = sourceDims.width;
      c.height = sourceDims.height;
      const ctx = c.getContext("2d");
      if (ctx && tmp.width > 0 && tmp.height > 0) {
        ctx.drawImage(tmp, 0, 0, c.width, c.height);
      }
    }
  }, [sourceDims, canvasRef]);

  const strokeAt = useCallback(
    (clientX: number, clientY: number, overlayRect: DOMRect) => {
      const c = canvasRef.current;
      if (!c || !box) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      // Coords were broken: we used `clientX - box.left`, but box.left is
      // measured RELATIVE to the canvas area container (rect.left -
      // areaRect.left), while clientX is viewport-relative. The diff was
      // off by areaRect.left → brush landed lower/right of the cursor.
      // Using the overlay's own getBoundingClientRect gives us a clean
      // viewport-aligned local origin no matter how the editor is nested.
      const scaleX = c.width / overlayRect.width;
      const scaleY = c.height / overlayRect.height;
      const localX = clientX - overlayRect.left;
      const localY = clientY - overlayRect.top;
      const x = localX * scaleX;
      const y = localY * scaleY;
      const radius = (brushSize / 2) * Math.max(scaleX, scaleY);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = radius * 2;
      if (mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.fillStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.fillStyle = "rgba(255,255,255,1)";
      }
      const last = lastPointRef.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      lastPointRef.current = { x, y };
      markDirty();
    },
    [box, brushSize, mode, canvasRef, markDirty],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      lastPointRef.current = null;
      strokeAt(e.clientX, e.clientY, el.getBoundingClientRect());
    },
    [active, strokeAt],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active || !isDrawingRef.current) return;
      const el = e.currentTarget as HTMLElement;
      strokeAt(e.clientX, e.clientY, el.getBoundingClientRect());
    },
    [active, strokeAt],
  );
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  if (!active) {
    // Render a hidden canvas so the ref stays valid (so the toolbar can
    // export it even when not actively painting — useful if user paints,
    // toggles off, then runs an AI op).
    return <canvas ref={canvasRef} className="hidden" aria-hidden="true" />;
  }

  return (
    <>
      <div
        className={cn(
          "absolute z-30",
          mode === "erase" ? "cursor-cell" : "cursor-crosshair",
        )}
        style={
          box
            ? {
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
              }
            : { inset: 0 }
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full opacity-50 mix-blend-screen pointer-events-none"
        />
      </div>

      {/* Floating mask toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1.5 shadow-md">
        <Button
          variant={mode === "draw" ? "default" : "ghost"}
          size="sm"
          className="h-7"
          onClick={() => setMode("draw")}
        >
          <Paintbrush className="h-3.5 w-3.5 mr-1" />
          Draw
        </Button>
        <Button
          variant={mode === "erase" ? "default" : "ghost"}
          size="sm"
          className="h-7"
          onClick={() => setMode("erase")}
        >
          <Eraser className="h-3.5 w-3.5 mr-1" />
          Erase
        </Button>
        <div className="flex items-center gap-1.5 pl-1.5 border-l border-border">
          <span className="text-[11px] text-muted-foreground">Brush</span>
          <Slider
            min={4}
            max={120}
            step={1}
            value={[brushSize]}
            onValueChange={([v]) => setBrushSize(v)}
            className="w-24"
            aria-label="Brush size"
          />
          <span className="w-7 text-right text-[11px] tabular-nums text-muted-foreground">
            {brushSize}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={clear}
          title="Clear mask"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => setMode("off")}
          title="Close mask"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );
}
