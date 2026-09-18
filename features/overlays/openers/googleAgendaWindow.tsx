"use client";

/**
 * Opener for the agenda window (Google-native PLAN §4.6).
 *
 * `useOpenGoogleAgenda()` — the imperative hook; the Controller component is the
 * declarative face for a caller whose lifecycle is mount/unmount. Singleton:
 * opening again reveals the one window rather than stacking a copy. It carries no
 * data, because the agenda's subject is the signed-in person and their window
 * knob — nothing a caller has to supply.
 */

import { useCallback, useEffect } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "googleAgendaWindow" as const;

export interface GoogleAgendaWindowHandle {
  close: () => void;
}

export function useOpenGoogleAgenda() {
  const dispatch = useAppDispatch();
  return useCallback((): GoogleAgendaWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
  }, [dispatch]);
}

export function GoogleAgendaWindowController() {
  const open = useOpenGoogleAgenda();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
