"use client";

/**
 * Typed durable opener for the file share-link manager. The overlay controller
 * owns the dialog, so callers may close/unmount transient popovers immediately
 * after dispatch without also destroying the manager.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "shareLinkDialog" as const;

interface OpenShareLinkDialogOptions {
  resourceId: string;
}

export function useOpenShareLinkDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    ({ resourceId }: OpenShareLinkDialogOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { resourceId },
        }),
      );
    },
    [dispatch],
  );
}
