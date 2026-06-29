// components/admin/debug/AdminDebugContextCollector.tsx
//
// Layout-level client island. Place it once inside AdminIndicatorWrapper so it
// only renders for admins. It auto-captures route context:
//
//   - Current pathname + search params (on every navigation)
//   - Browser viewport and user agent
//
// Global runtime errors (console.error, window 'error', unhandledrejection) are
// NO LONGER captured here — that moved to the single, all-users installer
// `lib/diagnostics/globalErrorCapture.ts`, which feeds the systemwide
// `errorCaptureStore` (read by the Error Inspector and by LargeIndicator's
// "Copy Context"). Keeping listeners here too would be a parallel system.
//
// Nothing here is expensive — the pathname effect only runs on navigation.
// Zero cost for non-admins because this component is a child of
// AdminIndicatorWrapper which returns null for them.

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setRouteContext } from "@/lib/redux/preferences/adminDebugSlice";

export function AdminDebugContextCollector() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const renderCountRef = useRef(0);

  // ── Route context capture ─────────────────────────────────────────────
  useEffect(() => {
    renderCountRef.current += 1;
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    dispatch(
      setRouteContext({
        pathname,
        searchParams: params,
        capturedAt: Date.now(),
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        renderCount: renderCountRef.current,
      }),
    );
  }, [pathname, searchParams, dispatch]);

  return null;
}
