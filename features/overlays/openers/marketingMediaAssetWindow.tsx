"use client";

/** Typed, callback-aware opener for crawled-media asset details. */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createMarketingMediaAssetCallbackGroup,
  type MarketingMediaAssetWindowHandlers,
} from "@/features/overlays/callbacks/marketingMediaAssetWindow";

const OVERLAY_ID = "marketingMediaAssetWindow" as const;

export interface OpenMarketingMediaAssetWindowOptions extends MarketingMediaAssetWindowHandlers {
  siteId: string;
  assetSrc: string;
  /** Stable id when a caller wants to focus/reuse one particular window. */
  windowInstanceId?: string;
}

export interface MarketingMediaAssetWindowHandle {
  instanceId: string;
  close: () => void;
  dispose: () => void;
}

interface LiveHandle {
  instanceId: string;
  dispose: () => void;
}

export function useOpenMarketingMediaAssetWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<LiveHandle>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const handle of handles) handle.dispose();
      handles.clear();
    };
  }, []);

  return (
    options: OpenMarketingMediaAssetWindowOptions,
  ): MarketingMediaAssetWindowHandle => {
    let releaseClosedHandle = () => {};
    const instanceId =
      options.windowInstanceId ??
      `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { callbackGroupId, dispose } = createMarketingMediaAssetCallbackGroup(
      {
        ...options,
        onWindowClose: (event) => {
          options.onWindowClose?.(event);
          releaseClosedHandle();
        },
      },
    );

    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        instanceId,
        data: {
          callbackGroupId,
          siteId: options.siteId,
          assetSrc: options.assetSrc,
        },
      }),
    );

    const liveHandle: LiveHandle = { instanceId, dispose };
    handlesRef.current.add(liveHandle);
    releaseClosedHandle = () => handlesRef.current.delete(liveHandle);

    const close = () => {
      dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
      dispose();
      handlesRef.current.delete(liveHandle);
    };
    const detach = () => {
      dispose();
      handlesRef.current.delete(liveHandle);
    };

    return { instanceId, close, dispose: detach };
  };
}
