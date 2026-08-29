"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "liveIntegrationsWindow" as const;

export interface LiveIntegrationsWindowHandle {
  close: () => void;
}

export function useOpenLiveIntegrationsWindow() {
  const dispatch = useAppDispatch();
  return (): LiveIntegrationsWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  };
}

/** Declarative form for callers that own the window's mount lifecycle. */
export function LiveIntegrationsWindowController(): null {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return () => {
      dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
    };
  }, [dispatch]);
  return null;
}
