"use client";

/**
 * ImageEditSheet — instant in-browser image editing, core to the package
 * (THE CLOUD LAW's sibling: capture without instant edit is half a system).
 * v1 covers the basics that belong in the browser — crop (free + 1:1, 4:3,
 * 16:9 presets), rotate 90°, flip — full-screen dark chrome in the iOS
 * editing style: Cancel/Save top bar, the image letterboxed center, a
 * draggable/resizable crop frame with corner handles, tool row bottom.
 * Heavier AI edits ride host-injected actions, not this sheet.
 *
 * Output is a JPEG re-encode of the ORIGINAL pixels (rotation/flip/crop
 * applied on canvas) — never a screenshot of the preview.
 *
 * Package source (`@ai-matrx/capture`) — browser canvas only, no app deps.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, FlipHorizontal2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AspectPreset = "free" | "1:1" | "4:3" | "16:9";
const ASPECTS: { id: AspectPreset; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

/** Normalized crop rect (0..1) relative to the ROTATED/FLIPPED image. */
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageEditSheetProps {
  open: boolean;
  /** Source image URL (object URL or resolvable src). */
  src: string | null;
  onClose: () => void;
  /** Receives the edited JPEG. The host persists it (cloud port). */
  onSave: (blob: Blob) => void;
}

const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.08;

export function ImageEditSheet({
  open,
  src,
  onClose,
  onSave,
}: ImageEditSheetProps) {
  const [rotation, setRotation] = useState(0); // 0|90|180|270, CCW steps
  const [flipped, setFlipped] = useState(false);
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    kind: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setRotation(0);
      setFlipped(false);
      setAspect("free");
      setCrop(FULL_CROP);
      setSaving(false);
    }
  }, [open, src]);

  const applyAspect = useCallback((preset: AspectPreset) => {
    setAspect(preset);
    const ratio = ASPECTS.find((a) => a.id === preset)?.ratio ?? null;
    if (ratio === null) return;
    // Fit the largest centered rect of the target ratio inside the frame,
    // in DISPLAYED-image normalized space (needs the element's real aspect).
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;
    const rotated = rotationSwapsAxes();
    const iw = rotated ? img.naturalHeight : img.naturalWidth;
    const ih = rotated ? img.naturalWidth : img.naturalHeight;
    const imageRatio = iw / ih;
    let w = 1;
    let h = 1;
    if (ratio > imageRatio) h = imageRatio / ratio;
    else w = ratio / imageRatio;
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });

    function rotationSwapsAxes() {
      return rotation % 180 !== 0;
    }
  }, [rotation]);

  const onPointerDown = useCallback(
    (kind: "move" | "nw" | "ne" | "sw" | "se") =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = {
          kind,
          startX: e.clientX,
          startY: e.clientY,
          startCrop: crop,
        };
      },
    [crop],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const img = imgRef.current;
      if (!drag || !img) return;
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const c = { ...drag.startCrop };
      const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? null;
      const frameRatio = rect.width / rect.height;

      if (drag.kind === "move") {
        c.x = Math.min(1 - c.w, Math.max(0, c.x + dx));
        c.y = Math.min(1 - c.h, Math.max(0, c.y + dy));
      } else {
        const left = drag.kind === "nw" || drag.kind === "sw";
        const top = drag.kind === "nw" || drag.kind === "ne";
        let x2 = c.x + c.w;
        let y2 = c.y + c.h;
        if (left) c.x = Math.min(x2 - MIN_CROP, Math.max(0, c.x + dx));
        else x2 = Math.max(c.x + MIN_CROP, Math.min(1, x2 + dx));
        if (top) c.y = Math.min(y2 - MIN_CROP, Math.max(0, c.y + dy));
        else y2 = Math.max(c.y + MIN_CROP, Math.min(1, y2 + dy));
        c.w = x2 - c.x;
        c.h = y2 - c.y;
        if (ratio !== null) {
          // Lock the ratio by deriving height from width in SCREEN space.
          const targetH = (c.w * frameRatio) / ratio;
          if (top) c.y = y2 - Math.min(targetH, y2);
          c.h = Math.min(targetH, top ? y2 - c.y : 1 - c.y);
          c.w = (c.h * ratio) / frameRatio;
          if (left) c.x = x2 - c.w;
        }
      }
      setCrop(c);
    },
    [aspect],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const save = useCallback(() => {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;
    setSaving(true);
    try {
      const swap = rotation % 180 !== 0;
      const outW = Math.round((swap ? img.naturalHeight : img.naturalWidth) * crop.w);
      const outH = Math.round((swap ? img.naturalWidth : img.naturalHeight) * crop.h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, outW);
      canvas.height = Math.max(1, outH);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      // Move into crop space, then apply rotation/flip about the image center.
      const rw = swap ? img.naturalHeight : img.naturalWidth;
      const rh = swap ? img.naturalWidth : img.naturalHeight;
      ctx.translate(-crop.x * rw, -crop.y * rh);
      ctx.translate(rw / 2, rh / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (flipped) ctx.scale(-1, 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      canvas.toBlob(
        (blob) => {
          setSaving(false);
          if (blob) {
            onSave(blob);
            onClose();
          }
        },
        "image/jpeg",
        0.92,
      );
    } catch (err) {
      console.error("[capture-camera] edit save failed", err);
      setSaving(false);
    }
  }, [rotation, flipped, crop, onSave, onClose]);

  if (!open || !src) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel editing"
          className="flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-white"
        >
          <X className="h-5 w-5" />
          Cancel
        </button>
        <span className="text-[15px] font-semibold text-white/90">Edit</span>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          aria-label="Save edited image"
          className="flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-[#FFCC00] disabled:opacity-50"
        >
          <Check className="h-5 w-5" />
          Save
        </button>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative max-h-full max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL being edited */}
          <img
            ref={imgRef}
            src={src}
            alt="Image being edited"
            draggable={false}
            className="max-h-[62dvh] max-w-full select-none object-contain"
            style={{
              transform: `rotate(${rotation}deg) ${flipped ? "scaleX(-1)" : ""}`,
            }}
          />
          {/* Crop frame in displayed-image space */}
          <div
            role="presentation"
            onPointerDown={onPointerDown("move")}
            className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }}
          >
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <span
                key={corner}
                role="presentation"
                onPointerDown={onPointerDown(corner)}
                className={cn(
                  "absolute h-6 w-6 touch-none",
                  corner === "nw" &&
                    "-left-1.5 -top-1.5 border-l-4 border-t-4 cursor-nwse-resize",
                  corner === "ne" &&
                    "-right-1.5 -top-1.5 border-r-4 border-t-4 cursor-nesw-resize",
                  corner === "sw" &&
                    "-bottom-1.5 -left-1.5 border-b-4 border-l-4 cursor-nesw-resize",
                  corner === "se" &&
                    "-bottom-1.5 -right-1.5 border-b-4 border-r-4 cursor-nwse-resize",
                  "border-white",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Tool row */}
      <div className="shrink-0 pb-safe">
        <div className="flex items-center justify-center gap-2 pb-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => applyAspect(a.id)}
              aria-pressed={aspect === a.id}
              className={cn(
                "touch-manipulation rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors",
                aspect === a.id
                  ? "bg-white/20 text-[#FFCC00]"
                  : "text-white/80",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 pb-4">
          <button
            type="button"
            onClick={() => {
              setRotation((r) => (r + 270) % 360);
              setCrop(FULL_CROP);
              setAspect("free");
            }}
            aria-label="Rotate left"
            className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/10 text-white"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label="Flip horizontally"
            aria-pressed={flipped}
            className={cn(
              "flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/10",
              flipped ? "text-[#FFCC00]" : "text-white",
            )}
          >
            <FlipHorizontal2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
