"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  toggleOverlay,
  openOverlay,
  closeOverlay,
  selectIsOverlayOpen,
  DEFAULT_INSTANCE_ID,
} from "@/lib/redux/slices/overlaySlice";
import type { VoicePadOverlayVariant } from "@/lib/redux/slices/voicePadSlice";

function makeHook(overlayId: VoicePadOverlayVariant) {
  return function useVariant(instanceId: string = DEFAULT_INSTANCE_ID) {
    const dispatch = useAppDispatch();
    const isOpen = useAppSelector((state) =>
      selectIsOverlayOpen(state, overlayId, instanceId),
    );

    const toggle = useCallback(() => {
      dispatch(toggleOverlay({ overlayId, instanceId }));
    }, [dispatch, instanceId]);

    const open = useCallback(() => {
      dispatch(openOverlay({ overlayId, instanceId }));
    }, [dispatch, instanceId]);

    const close = useCallback(() => {
      dispatch(closeOverlay({ overlayId, instanceId }));
    }, [dispatch, instanceId]);

    return { isOpen, toggle, open, close };
  };
}

/** Simple voice pad — defaults to singleton instance. */
export const useVoicePad = makeHook("voicePad");
export const useVoicePadAdvanced = makeHook("voicePadAdvanced");
export const useTranscriptionCleanup = makeHook("transcriptionCleanup");
