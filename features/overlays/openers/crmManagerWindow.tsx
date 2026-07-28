"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "crmManagerWindow" as const;

export interface CrmManagerWindowHandle {
  close: () => void;
}

export function useOpenCrmManagerWindow() {
  const dispatch = useAppDispatch();
  return (): CrmManagerWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  };
}

export function CrmManagerWindowController(): null {
  const open = useOpenCrmManagerWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
