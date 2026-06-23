"use client";

/**
 * Opener for the `audioDevices` overlay (mic / speaker picker + permission +
 * live input meter + speaker test).
 *
 * - `useOpenAudioDevices()` — imperative hook. Call to open; returns a handle
 *   with a `close()` method.
 * - `<AudioDevicesController />` — declarative wrapper. Mount to open, unmount
 *   to close.
 *
 * Follows the canonical no-prop opener shape (see pdfExtractorWindow.tsx).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "audioDevices" as const;

export type OpenAudioDevicesOptions = Record<string, never>;

export interface AudioDevicesHandle {
  close: () => void;
}

export function useOpenAudioDevices() {
  const dispatch = useAppDispatch();
  return useCallback(
    (_opts: OpenAudioDevicesOptions = {}): AudioDevicesHandle => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID }));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function AudioDevicesController(
  props: OpenAudioDevicesOptions,
): null {
  const open = useOpenAudioDevices();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
