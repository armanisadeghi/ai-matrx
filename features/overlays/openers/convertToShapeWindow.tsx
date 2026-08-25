"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "convertToShapeWindow" as const;

export interface OpenConvertToShapeWindowOptions {
  initialJsonContent: string;
}

export function useOpenConvertToShapeWindow() {
  const dispatch = useAppDispatch();

  return useCallback(
    ({ initialJsonContent }: OpenConvertToShapeWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { initialJsonContent },
        }),
      );
      return {
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
        },
      };
    },
    [dispatch],
  );
}

export function ConvertToShapeWindowController({
  initialJsonContent,
}: OpenConvertToShapeWindowOptions): null {
  const open = useOpenConvertToShapeWindow();

  useEffect(() => {
    const handle = open({ initialJsonContent });
    return () => {
      handle.close();
    };
  }, [initialJsonContent, open]);

  return null;
}
