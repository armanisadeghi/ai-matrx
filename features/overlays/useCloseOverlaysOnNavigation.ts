"use client";

/**
 * Closes every page-bound overlay (catalogue `closesOnNavigation`) when the
 * route changes. Mounted ONCE, in the OverlayController — the only place every
 * overlay renders — so no opener has to remember to close its window on
 * unmount, and a window that belongs to one page never floats over the next.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlaysBoundToPage } from "@/lib/redux/slices/overlaySlice";

export function useCloseOverlaysOnNavigation(): void {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    dispatch(closeOverlaysBoundToPage());
  }, [dispatch, pathname]);
}
