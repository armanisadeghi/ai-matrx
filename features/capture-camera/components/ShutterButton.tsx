"use client";

/**
 * ShutterButton — the iPhone shutter: a thin white ring with a filled inner
 * circle. Photo = white fill; video idle = red circle; video recording = the
 * inner shape morphs to a small red rounded square (the iOS stop affordance).
 * Press feedback is a scale-down of the INNER fill only, like iOS.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { CaptureCameraMode } from "../types";

export interface ShutterButtonProps {
  mode: CaptureCameraMode;
  recording: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function ShutterButton({
  mode,
  recording,
  disabled = false,
  onPress,
}: ShutterButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={
        mode === "photo"
          ? "Take photo"
          : recording
            ? "Stop recording"
            : "Start recording"
      }
      className={cn(
        "group flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full",
        "border-[3.5px] border-white transition-opacity",
        disabled && "opacity-30",
      )}
    >
      <span
        className={cn(
          "block transition-all duration-200 ease-out group-active:scale-90",
          mode === "photo"
            ? "h-[62px] w-[62px] rounded-full bg-white"
            : recording
              ? "h-8 w-8 rounded-md bg-[#FF3B30]"
              : "h-[62px] w-[62px] rounded-full bg-[#FF3B30]",
        )}
      />
    </button>
  );
}
