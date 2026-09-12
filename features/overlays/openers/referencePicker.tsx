"use client";

/**
 * Opener for the `referencePicker` overlay — "Add a reference".
 *
 * `useOpenReferencePicker()` returns an imperative opener. The pick handler is
 * registered as a callback group (`features/overlays/callbacks/referencePicker`)
 * and only its id travels through Redux. The group is disposed when the picker
 * reports a pick or a cancel, and on unmount of the owning component.
 */

import { useCallback, useEffect, useRef } from "react";
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

type HandleRef = { callbackGroupId: string; dispose: () => void };

export function useOpenReferencePicker() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (opts: OpenReferencePickerOptions): ReferencePickerHandle => {
      const handleRef: HandleRef = { callbackGroupId: "", dispose: () => {} };
      const detach = () => {
        handleRef.dispose();
        handlesRef.current.delete(handleRef);
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
      handleRef.callbackGroupId = callbackGroupId;
      handleRef.dispose = dispose;
      handlesRef.current.add(handleRef);

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
