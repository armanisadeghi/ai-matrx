"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "masterworkYourWordsWindow" as const;

export interface OpenMasterworkYourWordsWindowOptions {
  rulebookId: string;
}

export interface MasterworkYourWordsWindowHandle {
  close: () => void;
}

export function useOpenMasterworkYourWordsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenMasterworkYourWordsWindowOptions,
    ): MasterworkYourWordsWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { rulebookId: opts.rulebookId },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function MasterworkYourWordsWindowController(
  props: OpenMasterworkYourWordsWindowOptions,
): null {
  const open = useOpenMasterworkYourWordsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.rulebookId]);
  return null;
}
