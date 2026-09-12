// features/overlays/openers/dailySpendWindow.tsx
//
// The ONE way to raise the daily spend popover. New code opens it through this
// hook, never a raw `dispatch(openOverlay(...))`.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useCallback } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "dailySpendWindow" as const;

export function useOpenDailySpendWindow() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID, data: {} }));
    return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
  }, [dispatch]);
}
