"use client";

/**
 * CaptureModeBar — the three-equal-width capture source row (Photo · Video ·
 * Upload) shared by every full-screen capture surface (commerce-intake
 * IntakeCaptureScreen, product-capture CaptureScreen — standard AND instant
 * lanes render the same component).
 *
 * Photo and Video are the persistent MODES; Upload is an immediate action and
 * never takes the active state. The active mode is shown by ONE sliding thumb
 * (a white pill) that springs to the tapped segment — CSS `transform:
 * translateX` only (no layout work), a `linear()` spring curve with a small
 * overshoot bounce (fallback: an overshooting cubic-bezier where `linear()`
 * is unsupported), snapping instantly under `prefers-reduced-motion`.
 *
 * Deliberately NOT built on `SegmentedControl` from `@ai-matrx/design-system`: that
 * primitive has no animated thumb, uses the light-theme token palette, and
 * cannot model the mode+action mix — this bar lives on camera chrome (white
 * on the live frame, matching the rest of the capture overlay).
 */

import React from "react";
import { Camera as CameraIcon, ImagePlus, Video } from "lucide-react";
import { cn } from "@/lib/utils";

export type CaptureMediaMode = "photo" | "video";

/**
 * Spring curve with ~8% overshoot and a settle bounce (generated spring
 * approximation for CSS `linear()`). Applied inline so the class-level
 * overshooting cubic-bezier survives as the fallback in engines without
 * `linear()` support.
 */
const SPRING_EASING =
  "linear(0, 0.0047 0.71%, 0.0189 1.44%, 0.0755 2.93%, 0.1692 4.49%, " +
  "0.3921 7.55%, 0.8121 12.94%, 0.9804 15.49%, 1.0946 18.14%, 1.1423 20.16%, " +
  "1.1568 21.62%, 1.1541 23.03%, 1.1113 26.4%, 1.0322 31.83%, 0.9902 36.25%, " +
  "0.9769 40.24%, 0.9844 45.87%, 1.0028 55.35%, 1.0075 63.42%, 1.0006 85.48%, 1)";

const SEGMENT_BUTTON_CLASS =
  "relative z-10 flex h-11 min-w-0 touch-manipulation items-center justify-center " +
  "gap-1.5 rounded-full px-2 text-sm font-medium transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 " +
  "disabled:opacity-40";

export interface CaptureModeBarProps {
  mediaMode: CaptureMediaMode;
  onModeChange: (mode: CaptureMediaMode) => void;
  /** The Upload action (opens the device gallery/files picker). */
  onUpload: () => void;
  /** Disables the Photo/Video mode switch (e.g. while recording). */
  modeDisabled?: boolean;
  /** Disables the Upload action independently of the modes. */
  uploadDisabled?: boolean;
}

export function CaptureModeBar({
  mediaMode,
  onModeChange,
  onUpload,
  modeDisabled = false,
  uploadDisabled = false,
}: CaptureModeBarProps) {
  const activeIndex = mediaMode === "photo" ? 0 : 1;

  return (
    <div className="relative grid w-full max-w-sm grid-cols-3 rounded-full bg-white/10 p-1">
      {/* The sliding active thumb — transform-only, springs with overshoot,
          instant under prefers-reduced-motion. Width = one third of the
          padded track; translateX moves in multiples of its own width. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white shadow-sm transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
          transitionTimingFunction: SPRING_EASING,
        }}
      />
      <button
        type="button"
        onClick={() => onModeChange("photo")}
        disabled={modeDisabled}
        aria-pressed={mediaMode === "photo"}
        className={cn(
          SEGMENT_BUTTON_CLASS,
          mediaMode === "photo"
            ? "text-black"
            : "text-white/80 hover:text-white active:text-white",
        )}
      >
        <CameraIcon className="h-4 w-4 shrink-0" />
        Photo
      </button>
      <button
        type="button"
        onClick={() => onModeChange("video")}
        disabled={modeDisabled}
        aria-pressed={mediaMode === "video"}
        className={cn(
          SEGMENT_BUTTON_CLASS,
          mediaMode === "video"
            ? "text-black"
            : "text-white/80 hover:text-white active:text-white",
        )}
      >
        <Video className="h-4 w-4 shrink-0" />
        Video
      </button>
      <button
        type="button"
        onClick={onUpload}
        disabled={modeDisabled || uploadDisabled}
        aria-label="Upload photos or videos from this device"
        className={cn(
          SEGMENT_BUTTON_CLASS,
          "text-white/80 transition-[color,transform] hover:text-white active:scale-95 active:text-white",
        )}
      >
        <ImagePlus className="h-4 w-4 shrink-0" />
        Upload
      </button>
    </div>
  );
}
