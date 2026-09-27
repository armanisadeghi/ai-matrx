"use client";

/**
 * Opener for the `resourcePickerWindow` overlay — the resource picker in a
 * window, opened at one view with the host's own handlers (see
 * `features/overlays/callbacks/resourcePickerWindow.ts`). The overlay owns
 * the callback group's lifetime and disposes it on close.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createResourcePickerWindowCallbackGroup,
  type ResourcePickerWindowCallbackGroup,
} from "@/features/overlays/callbacks/resourcePickerWindow";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";

export interface OpenResourcePickerWindowOptions extends ResourcePickerWindowCallbackGroup {
  initialView: Exclude<ResourcePickerViewId, null>;
}

export interface ResourcePickerWindowOverlayData {
  callbackGroupId: string;
  initialView: Exclude<ResourcePickerViewId, null>;
}

export function useOpenResourcePickerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    ({ initialView, ...group }: OpenResourcePickerWindowOptions) => {
      const { callbackGroupId } = createResourcePickerWindowCallbackGroup(group);
      const data: ResourcePickerWindowOverlayData = { callbackGroupId, initialView };
      dispatch(openOverlay({ overlayId: "resourcePickerWindow", data }));
    },
    [dispatch],
  );
}
