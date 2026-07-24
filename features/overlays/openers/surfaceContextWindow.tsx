"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "surfaceContextWindow" as const;

export interface OpenSurfaceContextWindowOptions {
  surfaceName: string;
  isEditable?: boolean;
}

export function useOpenSurfaceContextWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSurfaceContextWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            surfaceName: options.surfaceName,
            isEditable: options.isEditable === true,
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

export function SurfaceContextWindowController(
  props: OpenSurfaceContextWindowOptions,
): null {
  const open = useOpenSurfaceContextWindow();
  useEffect(() => {
    const handle = open(props);
    return () => {
      handle.close();
    };
  }, [open, props.isEditable, props.surfaceName]);
  return null;
}
