"use client";

/**
 * Opener for the `brandChannelWindow` overlay — one client's owned YouTube
 * channel in a floating panel, so a reader comparing clients keeps their list
 * on screen. The window wraps the canonical `BrandChannelPanel`.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "brandChannelWindow" as const;

export interface OpenBrandChannelWindowOptions {
  brandId: string;
  /** The client's name, for the title — no read needed to render. */
  brandLabel?: string | null;
}

export function useOpenBrandChannelWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenBrandChannelWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            brandId: options.brandId,
            brandLabel: options.brandLabel ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
