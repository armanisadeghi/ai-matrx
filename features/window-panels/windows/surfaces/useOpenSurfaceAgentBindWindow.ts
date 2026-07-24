"use client";

/**
 * useOpenSurfaceAgentBindWindow — surface-first "add agent to this surface".
 *
 *   const openBind = useOpenSurfaceAgentBindWindow();
 *   openBind({
 *     surfaceName: "matrx-user/pdf-extractor",
 *     onBound: (e) => refreshBoundAgents(),
 *   });
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createSurfaceAgentBindCallbackGroup,
  type SurfaceAgentBindHandlers,
  type SurfaceAgentBindWindowData,
} from "./callbacks";

const OVERLAY_ID = "surfaceAgentBindWindow" as const;

export interface OpenSurfaceAgentBindWindowOptions extends SurfaceAgentBindHandlers {
  surfaceName: string;
  initialAgentId?: string | null;
  instanceId?: string;
}

export interface SurfaceAgentBindWindowHandle {
  overlayId: string;
  instanceId: string;
  callbackGroupId: string;
  close: () => void;
  dispose: () => void;
}

type HandleRef = {
  instanceId: string;
  callbackGroupId: string;
  dispose: () => void;
};

export function useOpenSurfaceAgentBindWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (
      options: OpenSurfaceAgentBindWindowOptions,
    ): SurfaceAgentBindWindowHandle => {
      const instanceId =
        options.instanceId ??
        `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const { callbackGroupId, dispose } = createSurfaceAgentBindCallbackGroup({
        onBound: options.onBound,
        onWindowClose: options.onWindowClose,
        onEvent: options.onEvent,
      });

      const data: SurfaceAgentBindWindowData = {
        surfaceName: options.surfaceName,
        initialAgentId: options.initialAgentId ?? null,
        callbackGroupId,
      };
      dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));

      const handleRef: HandleRef = {
        instanceId,
        callbackGroupId,
        dispose,
      };
      handlesRef.current.add(handleRef);

      const close = () => {
        dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
        dispose();
        handlesRef.current.delete(handleRef);
      };

      const detach = () => {
        dispose();
        handlesRef.current.delete(handleRef);
      };

      return {
        overlayId: OVERLAY_ID,
        instanceId,
        callbackGroupId,
        close,
        dispose: detach,
      };
    },
    [dispatch],
  );
}
