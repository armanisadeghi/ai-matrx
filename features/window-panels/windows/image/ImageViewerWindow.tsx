"use client";

/**
 * ImageViewer — generic image viewer with zoom, pan, keyboard nav, and download.
 *
 * Exports:
 *   ImageViewer        — pure body component (images + toolbar). Embed anywhere.
 *   ImageViewerWindow  — ImageViewer inside a floating WindowPanel. Accepts onClose callback.
 *
 * The dispatcher helper used to live here too, but importing it from a
 * route-level consumer would pull <WindowPanel> and the entire window-
 * panels chunk graph along with it. It now lives in
 * `./openImageViewer.ts` — a light file with no window-panel-system
 * imports. Consumers should import the helper from there:
 *
 *   import { openImageViewer } from
 *     "@/features/window-panels/windows/image/openImageViewer";
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "../../WindowPanel";
import {
  applyImageViewerTransformAction,
  getImageViewerTransformStyle,
  initialImageViewerTransform,
} from "./imageViewerTransforms";
import { InlineMediaRef } from "@/features/files";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageViewerProps {
  /** URLs of the images to display. */
  images: string[];
  /** Index of the image to show first. Defaults to 0. */
  initialIndex?: number;
  /** Optional alt text per image. Falls back to "Image N". */
  alts?: string[];
  /** Controlled index — when provided, the viewer uses this instead of internal state. */
  activeIndex?: number;
  /** Callback when the active index changes (for controlled mode). */
  onIndexChange?: (index: number) => void;
}

export interface ImageViewerWindowProps extends ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional window title. Auto-generated from image count if omitted. */
  title?: string;
  /** Unique WindowPanel id. Defaults to "image-viewer-default". */
  instanceId?: string;
}

// ─── Pure body ────────────────────────────────────────────────────────────────

export function ImageViewer({
  images,
  initialIndex = 0,
  alts,
  activeIndex,
  onIndexChange,
}: ImageViewerProps) {
  const [internalIndex, setInternalIndex] = useState(initialIndex);
  const index = activeIndex ?? internalIndex;
  const setIndex = onIndexChange ?? setInternalIndex;
  const [zoom, setZoom] = useState(1);
  const [imageTransform, setImageTransform] = useState(
    initialImageViewerTransform,
  );
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });

  const url = images[index] ?? "";
  const alt = alts?.[index] ?? `Image ${index + 1}`;
  const hasMany = images.length > 1;

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImageTransform(initialImageViewerTransform);
  }, [index]);

  const prev = useCallback(
    () => setIndex((index - 1 + images.length) % images.length),
    [index, images.length, setIndex],
  );
  const next = useCallback(
    () => setIndex((index + 1) % images.length),
    [index, images.length, setIndex],
  );
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4)), []);
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const n = Math.max(z - 0.25, 0.25);
      if (n <= 1) setOffset({ x: 0, y: 0 });
      return n;
    });
  }, []);
  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImageTransform(initialImageViewerTransform);
  }, []);
  const rotateLeft = useCallback(() => {
    setImageTransform((current) =>
      applyImageViewerTransformAction(current, "rotateLeft"),
    );
  }, []);
  const rotateRight = useCallback(() => {
    setImageTransform((current) =>
      applyImageViewerTransformAction(current, "rotateRight"),
    );
  }, []);
  const flipHorizontal = useCallback(() => {
    setImageTransform((current) =>
      applyImageViewerTransformAction(current, "flipHorizontal"),
    );
  }, []);
  const flipVertical = useCallback(() => {
    setImageTransform((current) =>
      applyImageViewerTransformAction(current, "flipVertical"),
    );
  }, []);
  const isDefaultView =
    zoom === 1 &&
    offset.x === 0 &&
    offset.y === 0 &&
    imageTransform.rotation === 0 &&
    !imageTransform.flipHorizontal &&
    !imageTransform.flipVertical;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetView();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, zoomIn, zoomOut, resetView]);

  // Pan when zoomed (pointer events for touch + mouse)
  const onPanStart = useCallback(
    (e: React.PointerEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    },
    [zoom, offset],
  );
  const onPanMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setOffset({
        x: dragStart.ox + e.clientX - dragStart.x,
        y: dragStart.oy + e.clientY - dragStart.y,
      });
    },
    [dragging, dragStart],
  );
  const onPanEnd = useCallback(() => setDragging(false), []);

  // Scroll to zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const n = e.deltaY < 0 ? Math.min(z + 0.1, 4) : Math.max(z - 0.1, 0.25);
      if (n <= 1) setOffset({ x: 0, y: 0 });
      return n;
    });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Image area */}
      <div
        className={cn(
          "relative flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-black/5 dark:bg-black/20",
          zoom > 1 ? "cursor-grab" : "cursor-default",
          dragging && "cursor-grabbing",
        )}
        style={zoom > 1 ? { touchAction: "none" } : undefined}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerLeave={onPanEnd}
        onPointerCancel={onPanEnd}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          draggable={false}
          style={{
            transform: getImageViewerTransformStyle({
              zoom,
              offset,
              transform: imageTransform,
            }),
            transition: dragging ? "none" : "transform 0.15s ease",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            userSelect: "none",
          }}
        />

        {hasMany && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {hasMany && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/40 text-white text-[11px] font-mono">
            {index + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="relative shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/20">
        <div className="flex items-center gap-1">
          <ToolbarBtn
            onClick={zoomOut}
            label="Zoom out"
            disabled={zoom <= 0.25}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <ToolbarBtn onClick={zoomIn} label="Zoom in" disabled={zoom >= 4}>
            <ZoomIn className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={resetView}
            label="Reset view"
            disabled={isDefaultView}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
          <ToolbarBtn onClick={rotateLeft} label="Rotate left">
            <RotateCcw className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={rotateRight} label="Rotate right">
            <RotateCw className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={flipHorizontal} label="Flip horizontal">
            <FlipHorizontal className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={flipVertical} label="Flip vertical">
            <FlipVertical className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>

        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download"
          title="Download"
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// ─── Thumbnail sidebar ────────────────────────────────────────────────────────

function ThumbnailSidebar({
  images,
  alts,
  activeIndex,
  onSelect,
}: {
  images: string[];
  alts?: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 p-1 h-full min-h-0">
      {images.map((url, i) => (
        <button
          key={`${url}-${i}`}
          type="button"
          onClick={() => onSelect(i)}
          className={cn(
            "shrink-0 rounded overflow-hidden border-2 transition-all",
            "hover:border-primary/60",
            i === activeIndex
              ? "border-primary ring-1 ring-primary/30"
              : "border-transparent opacity-60 hover:opacity-100",
          )}
          title={alts?.[i] ?? `Image ${i + 1}`}
          aria-label={alts?.[i] ?? `Image ${i + 1}`}
        >
          <InlineMediaRef
            ref={url}
            alt={alts?.[i] ?? `Image ${i + 1}`}
            size="fill"
            fit="cover"
            rounded="none"
            className="w-full aspect-square"
          />
        </button>
      ))}
    </div>
  );
}

// ─── Window shell ─────────────────────────────────────────────────────────────

export function ImageViewerWindow({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
  alts,
  title,
  instanceId = "default",
}: ImageViewerWindowProps) {
  const [index, setIndex] = useState(initialIndex);
  const hasMany = images.length > 1;

  if (!isOpen || images.length === 0) return null;

  const windowTitle =
    title ?? (hasMany ? `Images (${images.length})` : "Image Viewer");

  return (
    <WindowPanel
      id={`image-viewer-${instanceId}`}
      title={windowTitle}
      onClose={onClose}
      minWidth={320}
      minHeight={240}
      width={700}
      height={520}
      overlayId="imageViewer"
      onCollectData={() => ({ images, initialIndex: index })}
      sidebar={
        hasMany ? (
          <ThumbnailSidebar
            images={images}
            alts={alts}
            activeIndex={index}
            onSelect={setIndex}
          />
        ) : undefined
      }
      sidebarDefaultSize={200}
      sidebarMinSize={150}
      defaultSidebarOpen={hasMany}
    >
      <ImageViewer
        images={images}
        initialIndex={initialIndex}
        alts={alts}
        activeIndex={index}
        onIndexChange={setIndex}
      />
    </WindowPanel>
  );
}

// `openImageViewer` + its payload type live in `./openImageViewer.ts` —
// a separate light file with no window-panel-system imports. Route-level
// consumers should import the helper from there to avoid pulling
// <WindowPanel> into their bundle. Back-compat re-export kept here so
// any straggler import path still resolves.
export {
  openImageViewer,
  type OpenImageViewerPayload,
} from "./openImageViewer";
