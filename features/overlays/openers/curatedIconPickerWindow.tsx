"use client";

/**
 * Opener for the `curatedIconPickerWindow` overlay.
 *
 * Re-exports the canonical hand-written opener (full callback-aware API
 * via the callback registry for `onIconPick`/`onClose`).
 */
import { useEffect } from "react";
import {
  useOpenCuratedIconPickerWindow,
  type OpenCuratedIconPickerOptions,
  type CuratedIconPickerHandle,
} from "@/features/window-panels/windows/icons/useOpenCuratedIconPickerWindow";

export {
  useOpenCuratedIconPickerWindow,
  type OpenCuratedIconPickerOptions,
  type CuratedIconPickerHandle,
};

export function CuratedIconPickerWindowController(
  props: OpenCuratedIconPickerOptions,
): null {
  const open = useOpenCuratedIconPickerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.instanceId]);
  return null;
}
