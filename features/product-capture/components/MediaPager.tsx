"use client";

/**
 * MediaPager — the full-screen media viewer for a capture item's photos and
 * videos: swipe left/right (or arrow keys / on-screen chevrons on desktop)
 * to move between files, swipe DOWN to dismiss (iOS Photos), with a position
 * counter and optional Delete.
 *
 * Slides render through the durable-ref stack (`CaptureThumb` →
 * `InlineMediaRef` by file_id); freshly captured artifacts that only have a
 * local object URL render that directly. Modeled on the existing
 * `components/image/gallery/mobile/MobileImageViewer.tsx` motion pattern,
 * reshaped for file_ids and a finite (non-wrapping) strip.
 */

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { cn } from "@/lib/utils";

export interface PagerMedia {
  key: string;
  kind: "photo" | "video";
  fileId?: string;
  /** Tracked object URL for a just-captured artifact (wins over fileId). */
  previewUrl?: string;
}

// Tuned on a real phone (2026-08-29): 60px/400 felt dead — a natural iOS
// Photos flick is a short fast drag, so the distance OR a modest velocity
// must page.
const SWIPE_TRIGGER_PX = 40;
const SWIPE_TRIGGER_VELOCITY = 200;
const DISMISS_TRIGGER_PX = 110;

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0.6,
  }),
  center: { x: 0, y: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0.6,
  }),
};

export function MediaPager({
  media,
  initialIndex,
  onClose,
  onDelete,
  onEdit,
}: {
  media: PagerMedia[];
  initialIndex: number;
  onClose: () => void;
  /** When provided, the Delete control shows; the pager advances (or closes
   *  when the last file goes) — the caller owns the actual removal. */
  onDelete?: (item: PagerMedia) => void;
  /** When provided, PHOTO slides show an Edit control (instant crop/rotate
   *  via the capture-camera ImageEditSheet); the caller owns the editor. */
  onEdit?: (item: PagerMedia) => void;
}) {
  const [[index, direction], setPage] = useState<[number, number]>([
    Math.min(Math.max(initialIndex, 0), Math.max(media.length - 1, 0)),
    0,
  ]);

  const count = media.length;
  const current = media[index];

  const go = useCallback(
    (dir: 1 | -1) => {
      setPage(([i]) => {
        const next = i + dir;
        if (next < 0 || next >= count) return [i, 0];
        return [next, dir];
      });
    },
    [count],
  );

  // The list can shrink underneath us (a delete) — clamp, close on empty.
  // Deferred a tick so the effect never sets state synchronously.
  useEffect(() => {
    if (count > 0 && index < count) return;
    const timer = setTimeout(() => {
      if (count === 0) onClose();
      else setPage([count - 1, -1]);
    }, 0);
    return () => clearTimeout(timer);
  }, [count, index, onClose]);

  // Desktop keyboard: arrows page, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close viewer"
        >
          <X className="h-5 w-5" />
        </Button>
        <span className="rounded-full bg-black/50 px-3 py-1 text-sm tabular-nums text-white/90">
          {index + 1} / {count}
        </span>
        <span className="flex items-center gap-1">
          {/* Edit needs local pixels (previewUrl); persisted-only slides
              hide it rather than dead-ending. */}
          {onEdit && current.kind === "photo" && current.previewUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => onEdit(current)}
              aria-label="Edit this photo"
            >
              <Pencil className="h-5 w-5" />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => onDelete(current)}
              aria-label="Delete this file"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          ) : (
            <span className="h-10 w-10" aria-hidden />
          )}
        </span>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={current.key}
            className="absolute inset-0 touch-none"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 320, damping: 32 },
              opacity: { duration: 0.15 },
            }}
            drag
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              const { x, y } = info.offset;
              // Vertical fling → iOS Photos dismiss.
              if (Math.abs(y) > Math.abs(x) && Math.abs(y) > DISMISS_TRIGGER_PX) {
                onClose();
                return;
              }
              if (
                x < -SWIPE_TRIGGER_PX ||
                (x < -10 && info.velocity.x < -SWIPE_TRIGGER_VELOCITY)
              ) {
                go(1);
              } else if (
                x > SWIPE_TRIGGER_PX ||
                (x > 10 && info.velocity.x > SWIPE_TRIGGER_VELOCITY)
              ) {
                go(-1);
              }
            }}
          >
            <PagerSlide item={current} />
          </motion.div>
        </AnimatePresence>

        {/* Neighbor preload layer — the adjacent slides stay MOUNTED but
            invisible, so their bytes are fetched and their pixels decoded
            BEFORE the swipe lands. Without this every page turn (revisits
            included) paid a mount + resolve + full-size JPEG decode, which
            reads as lag on a phone. Photos only get ±2; videos ±1 (a mounted
            hidden <video> still buffers metadata, which is the win). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0">
          {[index - 2, index - 1, index + 1, index + 2]
            .filter((i) => i >= 0 && i < count)
            .map((i) => media[i])
            .filter(
              (m): m is PagerMedia =>
                m !== undefined &&
                (m.kind === "photo" ||
                  m === media[index - 1] ||
                  m === media[index + 1]),
            )
            .map((m) => (
              <div key={m.key} className="absolute inset-0">
                <PagerSlide item={m} />
              </div>
            ))}
        </div>

        {/* Desktop chevrons (hidden on touch-first small screens) */}
        {index > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white sm:flex"
            onClick={() => go(-1)}
            aria-label="Previous file"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}
        {index < count - 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white sm:flex"
            onClick={() => go(1)}
            aria-label="Next file"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        )}
      </div>

      {/* Position dots (small counts only — the counter covers the rest) */}
      {count > 1 && count <= 12 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 mb-safe flex justify-center gap-1.5">
          {media.map((m, i) => (
            <span
              key={m.key}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === index ? "bg-white" : "bg-white/35",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PagerSlide({ item }: { item: PagerMedia }) {
  if (item.previewUrl) {
    if (item.kind === "video") {
      return (
        <video
          src={item.previewUrl}
          controls
          playsInline
          className="pointer-events-auto absolute inset-0 h-full w-full object-contain"
        />
      );
    }
    return (
      <img
        src={item.previewUrl}
        alt="Captured photo"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-contain"
      />
    );
  }
  if (item.fileId) {
    return <PagerFileSlide fileId={item.fileId} />;
  }
  return null;
}

/**
 * Leaf over `InlineMediaRef` receiving ONLY the id — same reason as
 * media-capture's `CaptureThumb` (the compiler's ref analysis would taint any
 * object whose field flows into the `ref=` prop). Full-frame contain fit;
 * `InlineMediaRef` infers `<img>`/`<video controls>` from the file's mime.
 */
function PagerFileSlide({ fileId }: { fileId: string }) {
  return (
    <div className="absolute inset-0">
      <InlineMediaRef ref={fileId} size="fill" fit="contain" alt="Captured file" />
    </div>
  );
}
