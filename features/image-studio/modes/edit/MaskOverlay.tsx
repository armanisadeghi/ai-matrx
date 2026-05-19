"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Paintbrush, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MaskState } from "./use-mask-state";

interface Props {
  canvasAreaRef: React.MutableRefObject<HTMLDivElement | null>;
  mask: MaskState;
}

/**
 * Transparent overlay <canvas> for painting masks. Floats above Filerobot's
 * canvas; pointer events only when mask mode is active (draw/erase). Tracks
 * the underlying displayed image so the overlay matches its rendered size
 * AND captures stroke positions in pixel space.
 *
 * We size the backing canvas to the source image's natural dimensions so
 * the exported PNG aligns 1:1 with the source on the backend. The visible
 * CSS size matches the on-screen <img> Filerobot is showing.
 */
export function MaskOverlay({ canvasAreaRef, mask }: Props) {
  const { mode, active, brushSize, canvasRef, setMode, setBrushSize, markDirty, clear } = mask;
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Find Filerobot's displayed canvas/image and track its on-screen bbox.
  // Filerobot renders a Konva <canvas> inside its workspace; we mirror that
  // canvas's geometry. We poll via ResizeObserver + a layout effect; both
  // cheap.
  useEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }
    const area = canvasAreaRef.current;
    if (!area) return;

    const findTargetCanvas = (): HTMLCanvasElement | null => {
      // Konva stage canvases live under the FIE workspace. Pick the largest
      // one (the user-facing layer) — Konva also creates small hidden
      // canvases for caching.
      const canvases = area.querySelectorAll<HTMLCanvasElement>(
        ".konvajs-content canvas, canvas",
      );
      let best: HTMLCanvasElement | null = null;
      let bestArea = 0;
      canvases.forEach((c) => {
        if (canvasRef.current === c) return; // skip our own mask canvas
        const w = c.clientWidth;
        const h = c.clientHeight;
        const a = w * h;
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
      // Use the underlying drawing buffer for natural dimensions so masks
      // are exported at full source resolution.
      const natW = target.width || rect.width;
      const natH = target.height || rect.height;
      setBox({
        left: rect.left - areaRect.left,
        top: rect.top - areaRect.top,
        width: rect.width,
        height: rect.height,
        naturalWidth: natW,
        naturalHeight: natH,
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(area);
    const target = findTargetCanvas();
    if (target) ro.observe(target);
    // Filerobot animates in — re-measure on a short interval for the first
    // second so we catch the settled layout.
    const t1 = setTimeout(measure, 250);
    const t2 = setTimeout(measure, 750);
    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, canvasAreaRef, canvasRef]);

  // Keep the backing canvas sized to natural dimensions when the box updates.
  useEffect(() => {
    if (!box) return;
    const c = canvasRef.current;
    if (!c) return;
    if (c.width !== box.naturalWidth || c.height !== box.naturalHeight) {
      // Preserve the existing image when we resize.
      const tmp = document.createElement("canvas");
      tmp.width = c.width;
      tmp.height = c.height;
      const tmpCtx = tmp.getContext("2d");
      if (tmpCtx) tmpCtx.drawImage(c, 0, 0);
      c.width = box.naturalWidth;
      c.height = box.naturalHeight;
      const ctx = c.getContext("2d");
      if (ctx && tmp.width > 0 && tmp.height > 0) {
        ctx.drawImage(tmp, 0, 0, c.width, c.height);
      }
    }
  }, [box, canvasRef]);

  const strokeAt = useCallback(
    (clientX: number, clientY: number) => {
      const c = canvasRef.current;
      if (!c || !box) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const scaleX = c.width / box.width;
      const scaleY = c.height / box.height;
      const localX = clientX - box.left;
      const localY = clientY - box.top;
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
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      lastPointRef.current = null;
      strokeAt(e.clientX, e.clientY);
    },
    [active, strokeAt],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active || !isDrawingRef.current) return;
      strokeAt(e.clientX, e.clientY);
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
    return (
      <canvas
        ref={canvasRef}
        className="hidden"
        aria-hidden="true"
      />
    );
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
          <input
            type="range"
            min={4}
            max={120}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="h-1.5 w-24 accent-primary"
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
