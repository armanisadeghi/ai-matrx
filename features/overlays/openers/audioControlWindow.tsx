"use client";

/**
 * Opener for the `audioControlWindow` overlay — the compact "Media" panel
 * (playback queue & transport, live recording indicator, camera/capture
 * diagnostics, device pickers).
 *
 * - `useOpenAudioControlWindow()` — imperative hook. Call to open; returns a
 *   handle with a `close()` method.
 * - `<AudioControlWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 *
 * Mirrors the other singleton-window openers (e.g. `audioDevices`).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { activateAudio } from "@/features/audio/activation";

const OVERLAY_ID = "audioControlWindow" as const;

export interface AudioControlWindowHandle {
  close: () => void;
}

export function useOpenAudioControlWindow() {
  const dispatch = useAppDispatch();
  return useCallback((): AudioControlWindowHandle => {
    // Opening the Media panel is audio engagement — mount the lazy audio
    // system so the panel's mirrors (playback queue, sessions, devices) are
    // live. AudioSystemHost also gates on this overlay's Redux flag, but the
    // explicit latch covers it without a store read.
    activateAudio();
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function AudioControlWindowController(): null {
  const open = useOpenAudioControlWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
