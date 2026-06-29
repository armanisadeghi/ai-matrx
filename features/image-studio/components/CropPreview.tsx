"use client";

/**
 * CropPreview — two-pane live crop preview.
 *
 * Left pane  : the uploaded source image at full display size, overlaid with
 *              a rectangle highlighting the exact region that will be kept.
 * Right pane : a canvas rendering the final cropped output (scaled to fit
 *              the pane, but preserving the target aspect ratio).
 *
 * All math is client-side and runs on every prop change — there's no server
 * round-trip. For `attention` / `entropy` the overlay falls back to center
 * and a "server picks the region" note is shown.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Info, Move, Zap, Scan } from "lucide-react";
import type { ImageFit, ImagePosition } from "../types";
import {
    computeSourceCropRect,
    renderCropToCanvas,
    snapPointToAnchor,
} from "../utils/compute-crop";
import { formatBytes, formatDimensions } from "../utils/format-bytes";

interface CropPreviewProps {
    sourceUrl: string | null;
    sourceWidth: number | null;
    sourceHeight: number | null;
    sourceName?: string;
    sourceBytes?: number;

    dstWidth: number;
    dstHeight: number;
    presetName?: string;

    fit: ImageFit;
    position: ImagePosition;
    backgroundColor: string;

    /**
     * When provided, the source pane becomes draggable: dragging or
     * clicking inside it updates the focal point (cover mode only).
     * Anchor-position drags upgrade to a continuous `{x, y}` point.
     */
    onPositionChange?: (position: ImagePosition) => void;
}

export function CropPreview({
    sourceUrl,
    sourceWidth,
    sourceHeight,
    sourceName,
    sourceBytes,
    dstWidth,
    dstHeight,
    presetName,
    fit,
    position,
    backgroundColor,
    onPositionChange,
}: CropPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imgWrapRef = useRef<HTMLDivElement | null>(null);
    const isDraggingRef = useRef(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const draggable =
        Boolean(onPositionChange) &&
        fit === "cover" &&
        position !== "attention" &&
        position !== "entropy";

    // Cache a single decoded Image so we don't reload on every prop change.
    const imgRef = useRef<HTMLImageElement | null>(null);

    // Drag handler — pointerdown / move / up. Wraps a single utility that
    // converts a clientX/Y into a normalized [0..1] focal point relative
    // to the visible image bounds, then emits via `onPositionChange`. We
    // snap back to a compass anchor when the point is within ε of one
    // (e.g. 0.5 / 0.5 → "center"), so the user doesn't lose the named
    // labels just because of a minor pixel jitter.
    const emitFocalAt = useCallback(
        (clientX: number, clientY: number) => {
            if (!onPositionChange) return;
            const wrap = imgWrapRef.current;
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const x = (clientX - rect.left) / rect.width;
            const y = (clientY - rect.top) / rect.height;
            const cx = Math.max(0, Math.min(1, x));
            const cy = Math.max(0, Math.min(1, y));
            const point = { x: cx, y: cy };
            const anchor = snapPointToAnchor(point);
            onPositionChange(anchor ?? point);
        },
        [onPositionChange],
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!draggable) return;
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            isDraggingRef.current = true;
            setIsDragging(true);
            emitFocalAt(e.clientX, e.clientY);
        },
        [draggable, emitFocalAt],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!isDraggingRef.current) return;
            emitFocalAt(e.clientX, e.clientY);
        },
        [emitFocalAt],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!isDraggingRef.current) return;
            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            isDraggingRef.current = false;
            setIsDragging(false);
        },
        [],
    );

    // Keyboard nudge — arrow keys move the focal point by 1% (5% with shift).
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (!draggable || !onPositionChange) return;
            const step = e.shiftKey ? 0.05 : 0.01;
            let dx = 0;
            let dy = 0;
            if (e.key === "ArrowLeft") dx = -step;
            else if (e.key === "ArrowRight") dx = step;
            else if (e.key === "ArrowUp") dy = -step;
            else if (e.key === "ArrowDown") dy = step;
            else return;
            e.preventDefault();
            const current =
                typeof position === "string"
                    ? // Use the current overlay rect's center as a starting point.
                      sourceWidth && sourceHeight
                        ? (() => {
                              const r = computeSourceCropRect(
                                  sourceWidth,
                                  sourceHeight,
                                  dstWidth,
                                  dstHeight,
                                  fit,
                                  position,
                              );
                              return {
                                  x: (r.x + r.w / 2) / sourceWidth,
                                  y: (r.y + r.h / 2) / sourceHeight,
                              };
                          })()
                        : { x: 0.5, y: 0.5 }
                    : position;
            const next = {
                x: Math.max(0, Math.min(1, current.x + dx)),
                y: Math.max(0, Math.min(1, current.y + dy)),
            };
            const anchor = snapPointToAnchor(next);
            onPositionChange(anchor ?? next);
        },
        [
            draggable,
            onPositionChange,
            position,
            sourceWidth,
            sourceHeight,
            dstWidth,
            dstHeight,
            fit,
        ],
    );

    useEffect(() => {
        if (!sourceUrl) {
            imgRef.current = null;
            setImgLoaded(false);
            setImgError(null);
            return undefined;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            imgRef.current = img;
            setImgLoaded(true);
            setImgError(null);
        };
        img.onerror = () => {
            setImgError("Could not load preview");
            setImgLoaded(false);
        };
        img.src = sourceUrl;
        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [sourceUrl]);

    // Render the output canvas whenever the settings or source change.
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !imgLoaded) return;
        renderCropToCanvas(canvas, img, dstWidth, dstHeight, fit, position, backgroundColor);
    }, [imgLoaded, dstWidth, dstHeight, fit, position, backgroundColor]);

    const cropRect = useMemo(() => {
        if (!sourceWidth || !sourceHeight) return null;
        return computeSourceCropRect(
            sourceWidth,
            sourceHeight,
            dstWidth,
            dstHeight,
            fit,
            position,
        );
    }, [sourceWidth, sourceHeight, dstWidth, dstHeight, fit, position]);

    if (!sourceUrl || !sourceWidth || !sourceHeight) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-sm text-muted-foreground">
                <Info className="h-6 w-6 mb-2 text-muted-foreground/60" />
                <p className="font-medium">No file selected</p>
                <p className="text-xs mt-1">Drop an image to see the crop preview.</p>
            </div>
        );
    }

    const smartCrop =
        typeof position === "string" &&
        (position === "attention" || position === "entropy");
    const isCustomFocal = typeof position === "object";

    return (
        <div className="flex flex-col h-full min-h-0 gap-3 p-3">
            {/* ── Two-pane preview ─────────────────────────────────────── */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Source + crop overlay */}
                <div className="flex flex-col gap-1.5 min-h-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                        <span>Source</span>
                        <span className="font-mono normal-case text-muted-foreground/80">
                            {formatDimensions(sourceWidth, sourceHeight)}
                            {sourceBytes != null && ` · ${formatBytes(sourceBytes)}`}
                        </span>
                    </p>
                    <div className="relative flex-1 min-h-0 rounded-lg border border-border bg-[conic-gradient(at_top_left,_rgba(0,0,0,0.08)_0deg,_rgba(0,0,0,0.12)_90deg,_rgba(0,0,0,0.08)_180deg,_rgba(0,0,0,0.12)_270deg)] bg-muted/20 overflow-hidden flex items-center justify-center">
                        <div
                            ref={imgWrapRef}
                            tabIndex={draggable ? 0 : -1}
                            role={draggable ? "slider" : undefined}
                            aria-label={
                                draggable
                                    ? "Drag to set crop focal point. Use arrow keys for fine control; hold shift for larger steps."
                                    : undefined
                            }
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onKeyDown={handleKeyDown}
                            className={
                                "relative inline-block max-w-full max-h-full focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md " +
                                (draggable
                                    ? isDragging
                                        ? "cursor-grabbing"
                                        : "cursor-grab"
                                    : "")
                            }
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={sourceUrl}
                                alt={sourceName ?? "source"}
                                draggable={false}
                                className="block max-w-full max-h-full object-contain select-none pointer-events-none"
                            />
                            {/* Crop overlay */}
                            {fit === "cover" && cropRect && (
                                <>
                                    <div
                                        className="absolute pointer-events-none"
                                        style={{
                                            left: `${(cropRect.x / sourceWidth) * 100}%`,
                                            top: `${(cropRect.y / sourceHeight) * 100}%`,
                                            width: `${(cropRect.w / sourceWidth) * 100}%`,
                                            height: `${(cropRect.h / sourceHeight) * 100}%`,
                                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                                            outline: isDragging
                                                ? "2px solid rgba(99, 102, 241, 1)"
                                                : "2px solid rgba(255,255,255,0.95)",
                                            outlineOffset: "-1px",
                                            transition: isDragging
                                                ? "none"
                                                : "left 60ms linear, top 60ms linear, width 60ms linear, height 60ms linear",
                                        }}
                                    />
                                    {/* Rule-of-thirds lines inside the crop */}
                                    <div
                                        className="absolute pointer-events-none"
                                        style={{
                                            left: `${(cropRect.x / sourceWidth) * 100}%`,
                                            top: `${(cropRect.y / sourceHeight) * 100}%`,
                                            width: `${(cropRect.w / sourceWidth) * 100}%`,
                                            height: `${(cropRect.h / sourceHeight) * 100}%`,
                                        }}
                                    >
                                        <div className="absolute inset-0 border-[0.5px] border-white/30 grid grid-cols-3 grid-rows-3">
                                            {Array.from({ length: 9 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="border-[0.5px] border-white/20"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    {/* Focal-point handle — sits at the centre of the crop. */}
                                    <div
                                        className="absolute pointer-events-none flex items-center justify-center"
                                        style={{
                                            left: `${((cropRect.x + cropRect.w / 2) / sourceWidth) * 100}%`,
                                            top: `${((cropRect.y + cropRect.h / 2) / sourceHeight) * 100}%`,
                                            transform: "translate(-50%, -50%)",
                                        }}
                                    >
                                        <div
                                            className={
                                                "h-7 w-7 rounded-full border-2 backdrop-blur-sm flex items-center justify-center shadow " +
                                                (isDragging
                                                    ? "border-primary bg-primary/30"
                                                    : "border-white/90 bg-white/20")
                                            }
                                        >
                                            <div
                                                className={
                                                    "h-1.5 w-1.5 rounded-full " +
                                                    (isDragging
                                                        ? "bg-primary-foreground"
                                                        : "bg-white")
                                                }
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            {fit === "contain" && (
                                <div className="absolute inset-0 pointer-events-none ring-2 ring-dashed ring-white/60" />
                            )}
                        </div>
                    </div>
                    {draggable && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 leading-snug">
                            <Move className="h-3 w-3" />
                            Drag inside the source — or press the arrow keys (shift = bigger
                            step) — to fine-tune the crop position.
                            {isCustomFocal && (
                                <span className="font-mono ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                    Custom
                                </span>
                            )}
                        </p>
                    )}
                    {imgError && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {imgError}
                        </p>
                    )}
                    {smartCrop && (
                        <p className="text-[11px] rounded-md bg-primary/5 border border-primary/30 text-primary px-2 py-1 flex items-center gap-1.5">
                            {position === "attention" ? (
                                <Zap className="h-3 w-3 shrink-0" />
                            ) : (
                                <Scan className="h-3 w-3 shrink-0" />
                            )}
                            <span className="leading-snug">
                                Smart crop — Sharp picks the region at generate time.
                                Overlay shows the center-anchored fallback.
                            </span>
                        </p>
                    )}
                </div>

                {/* Output */}
                <div className="flex flex-col gap-1.5 min-h-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                        <span>{presetName ?? "Output"}</span>
                        <span className="font-mono normal-case text-muted-foreground/80">
                            {formatDimensions(dstWidth, dstHeight)}
                        </span>
                    </p>
                    <div className="relative flex-1 min-h-0 rounded-lg border border-border bg-[conic-gradient(at_top_left,_rgba(0,0,0,0.08)_0deg,_rgba(0,0,0,0.12)_90deg,_rgba(0,0,0,0.08)_180deg,_rgba(0,0,0,0.12)_270deg)] bg-muted/20 overflow-hidden flex items-center justify-center p-2">
                        <canvas
                            ref={canvasRef}
                            className="max-w-full max-h-full block"
                            style={{
                                aspectRatio:
                                    fit === "inside"
                                        ? undefined
                                        : `${dstWidth} / ${dstHeight}`,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
