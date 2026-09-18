"use client";

/**
 * Opener for the `siteQuickViewWindow` overlay — one site's Quick view, opened
 * from nothing but its id, so a reader who meets a site anywhere (a Search
 * Console answer in chat, a reference chip, a table cell) can look at it
 * without leaving what they were reading (F-87).
 *
 * The window wraps the canonical `SitePeekWindow`; see
 * `features/window-panels/windows/marketing/SiteQuickViewWindow.tsx`.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "siteQuickViewWindow" as const;

export interface OpenSiteQuickViewWindowOptions {
  siteId: string;
  /** The site's name if the caller already knows it — shown while it loads. */
  siteLabel?: string | null;
}

export function useOpenSiteQuickViewWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSiteQuickViewWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            siteId: options.siteId,
            siteLabel: options.siteLabel ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}

/** Declarative form — lifecycle = mount/unmount. */
export function SiteQuickViewWindowController(
  props: OpenSiteQuickViewWindowOptions,
): null {
  const open = useOpenSiteQuickViewWindow();
  useEffect(() => {
    const handle = open({ siteId: props.siteId, siteLabel: props.siteLabel });
    return () => {
      handle.close();
    };
  }, [open, props.siteId, props.siteLabel]);
  return null;
}
