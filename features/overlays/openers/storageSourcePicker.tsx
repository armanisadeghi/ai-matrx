"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createStorageSourcePickerCallbackGroup,
  type StorageSourcePickerHandlers,
} from "@/features/overlays/callbacks/storageSourcePicker";

const OVERLAY_ID = "storageSourcePicker" as const;

export interface OpenStorageSourcePickerOptions
  extends StorageSourcePickerHandlers {
  destinationFolderPath: string;
  accept?: string;
  multiple?: boolean;
}

export function useOpenStorageSourcePicker() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenStorageSourcePickerOptions) => {
      const callbacks = createStorageSourcePickerCallbackGroup(options);
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            callbackGroupId: callbacks.callbackGroupId,
            destinationFolderPath: options.destinationFolderPath,
            accept: options.accept ?? null,
            multiple: options.multiple ?? true,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
        dispose: callbacks.dispose,
      };
    },
    [dispatch],
  );
}
