"use client";

/**
 * ModeSelector — the iPhone mode row: uppercase, letter-spaced labels in a
 * horizontal band; the ACTIVE mode sits in a dark pill with the iOS camera
 * yellow. VIDEO and PHOTO are persistent modes; UPLOAD is an immediate
 * action (opens the host's picker) and never takes the active state — it is
 * our third lane in the slot the iPhone layout leaves open next to PHOTO.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { CaptureCameraMode } from "../types";

export interface ModeSelectorProps {
  mode: CaptureCameraMode;
  onModeChange: (mode: CaptureCameraMode) => void;
  onUpload: () => void;
  /** Locks mode switching (while recording). */
  modeDisabled?: boolean;
  uploadDisabled?: boolean;
  /** Host-injected extra entries after UPLOAD (e.g. SCAN) — immediate
   *  actions, never the active mode. */
  extraModes?: { id: string; label: string; onSelect: () => void }[];
}

const LABEL_BASE =
  "touch-manipulation rounded-full px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40";

export function ModeSelector({
  mode,
  onModeChange,
  onUpload,
  modeDisabled = false,
  uploadDisabled = false,
  extraModes = [],
}: ModeSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Capture mode"
      className="flex items-center justify-center gap-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "video"}
        disabled={modeDisabled}
        onClick={() => onModeChange("video")}
        className={cn(
          LABEL_BASE,
          mode === "video" ? "bg-white/15 text-[#FFCC00]" : "text-white",
        )}
      >
        Video
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "photo"}
        disabled={modeDisabled}
        onClick={() => onModeChange("photo")}
        className={cn(
          LABEL_BASE,
          mode === "photo" ? "bg-white/15 text-[#FFCC00]" : "text-white",
        )}
      >
        Photo
      </button>
      <button
        type="button"
        aria-label="Upload photos or videos from this device"
        disabled={modeDisabled || uploadDisabled}
        onClick={onUpload}
        className={cn(LABEL_BASE, "text-white active:text-[#FFCC00]")}
      >
        Upload
      </button>
      {extraModes.map((extra) => (
        <button
          key={extra.id}
          type="button"
          aria-label={extra.label}
          disabled={modeDisabled}
          onClick={extra.onSelect}
          className={cn(LABEL_BASE, "text-white active:text-[#FFCC00]")}
        >
          {extra.label}
        </button>
      ))}
    </div>
  );
}
