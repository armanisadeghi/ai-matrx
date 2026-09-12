"use client";

/**
 * Opener for the `referencePicker` overlay — "Add a reference".
 *
 * `useOpenReferencePicker()` returns an imperative opener. The pick handler is
 * registered as a callback group (`features/overlays/callbacks/referencePicker`)
 * and only its id travels through Redux. The overlay owns the callback group's
 * lifetime so a transient opener (such as the mobile menu sheet) may unmount
 * while the picker remains open.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createReferencePickerCallbackGroup } from "@/features/overlays/callbacks/referencePicker";
import type {
  ReferenceDelivery,
  ReferencePick,
} from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

const OVERLAY_ID = "referencePicker" as const;

export interface OpenReferencePickerOptions {
  /** `insert` when the caller can write into a surface (copy stays offered); `copy` otherwise. */
  mode: ReferenceDelivery;
  onPicked: (pick: ReferencePick) => void;
  onCancelled?: () => void;
}

export interface ReferencePickerHandle {
  callbackGroupId: string;
  close: () => void;
  dispose: () => void;
}

export interface ReferencePickerOverlayData {
  callbackGroupId: string;
  mode: ReferenceDelivery;
}

export function useOpenReferencePicker() {
  const dispatch = useAppDispatch();

  return useCallback(
    (opts: OpenReferencePickerOptions): ReferencePickerHandle => {
      let disposed = false;
      let disposeGroup = () => {};
      const detach = () => {
        if (disposed) return;
        disposed = true;
        disposeGroup();
      };
      const { callbackGroupId, dispose } = createReferencePickerCallbackGroup({
        onPicked: (pick) => {
          opts.onPicked(pick);
          detach();
        },
        onCancelled: () => {
          opts.onCancelled?.();
          detach();
        },
      });
      disposeGroup = dispose;

      const data: ReferencePickerOverlayData = { callbackGroupId, mode: opts.mode };
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data }));

      return {
        callbackGroupId,
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
          detach();
        },
        dispose: detach,
      };
    },
    [dispatch],
  );
}
