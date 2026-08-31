"use client";

import { useEffect, type ReactNode } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setCanvasAvailable } from "@/features/canvas/redux/canvasSlice";

/**
 * Marks the global side canvas unavailable while an immersive canvas viewer
 * already owns the viewport. This keeps nested artifact renderers from
 * advertising an impossible second "Open in canvas" action.
 */
export function CanvasUnavailableBoundary({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setCanvasAvailable(false));
    return () => {
      dispatch(setCanvasAvailable(true));
    };
  }, [dispatch]);

  return children;
}
