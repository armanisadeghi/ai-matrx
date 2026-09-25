"use client";

/**
 * Opener for the `saveKitDialog` overlay — "Save as kit": turn an agent whose
 * variables read the person's tables (plus those tables and workflows) into a kit
 * their organization can install. `editKitKey` reopens a saved kit's details.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "saveKitDialog" as const;

export interface OpenSaveKitDialogOptions {
  /** Start with this agent picked. */
  initialAgentId?: string | null;
  /** Edit an existing saved kit (its details) instead of creating one. */
  editKitKey?: string | null;
}

export function useOpenSaveKitDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSaveKitDialogOptions = {}) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            initialAgentId: opts.initialAgentId ?? null,
            editKitKey: opts.editKitKey ?? null,
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
