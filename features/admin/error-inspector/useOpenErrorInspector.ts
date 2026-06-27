"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  openOverlay,
  closeOverlay,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";

export const ERROR_INSPECTOR_OVERLAY_ID = "errorInspectorWindow" as const;

/**
 * Canonical opener for the admin Supabase Error Inspector. Reuse this anywhere
 * an entry point needs to open the inspector (menu item, floating badge, future
 * deep-links) rather than dispatching the overlay id by hand.
 */
export function useOpenErrorInspector() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(openOverlay({ overlayId: ERROR_INSPECTOR_OVERLAY_ID }));
  }, [dispatch]);
}

export function useToggleErrorInspector() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(toggleOverlay({ overlayId: ERROR_INSPECTOR_OVERLAY_ID }));
  }, [dispatch]);
}

export function useCloseErrorInspector() {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(closeOverlay({ overlayId: ERROR_INSPECTOR_OVERLAY_ID }));
  }, [dispatch]);
}
