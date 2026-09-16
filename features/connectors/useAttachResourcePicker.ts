"use client";

/**
 * Opener for the `attachResourcePicker` overlay — the ONE door to the chooser.
 *
 * Every surface that offers "Choose repositories…" / "Choose files…" (the
 * composer rail's attachable chips, the Tools picker, the header summary's
 * "Add more") raises this same intent, so there is exactly one picker and one
 * attach path no matter where the person started.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { AttachableResource } from "./attachable-resources";

const OVERLAY_ID = "attachResourcePicker" as const;

export interface OpenAttachResourcePickerOptions {
  conversationId: string;
  /** The connection's catalog slug. */
  provider: string;
  /** Its display name — every sentence in the picker uses it. */
  providerName: string;
  /** What it offers, verbatim from the availability payload. */
  attachable: readonly AttachableResource[];
}

export function useAttachResourcePicker() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenAttachResourcePickerOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: options.conversationId,
            provider: options.provider,
            providerName: options.providerName,
            attachable: options.attachable.map((entry) => ({ ...entry })),
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}
