// components/admin/debug/AdminDebugContextCollector.tsx
//
// Layout-level client island. Place it once inside AdminIndicatorWrapper so it
// only renders for admins. It auto-captures:
//
//   - Current pathname + search params (on every navigation)
//   - Browser viewport and user agent
//   - console.error calls (intercepted while mounted)
//   - window onerror / unhandledrejection events
//
// Nothing here is expensive — the console intercept is a simple wrapper and
// the pathname effect only runs on navigation. Zero cost for non-admins because
// this component is a child of AdminIndicatorWrapper which returns null for them.

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";
import {
  setRouteContext,
  appendConsoleError,
  type ConsoleErrorEntry,
} from "@/lib/redux/slices/adminDebugSlice";
import { isKnownThirdPartyNoise } from "@/lib/console-noise";
import { v4 as uuidv4 } from "uuid";

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

  // ── Console error capture ─────────────────────────────────────────────
  useEffect(() => {
    const originalError = console.error.bind(console);

    // Defer dispatch off the current call stack. console.error can fire
    // synchronously from inside React's render phase (e.g. the "setState
    // during render" warning). Dispatching Redux actions synchronously in
    // that context can cascade into additional warnings or subscriber work
    // mid-render. queueMicrotask gets us out of the current frame safely.
    const scheduleAppend = (entry: ConsoleErrorEntry) => {
      queueMicrotask(() => {
        dispatch(appendConsoleError(entry));
      });
    };

    console.error = (...args: unknown[]) => {
      originalError(...args);
      // Drop documented third-party dev warnings (see lib/console-noise.ts)
      // so the admin debug panel stays focused on signal. The same predicate
      // is checked by the global console.error wrapper installed at the
      // Filerobot loader, but we re-check here so the panel stays clean
      // regardless of which wrapper landed on top of the other.
      if (isKnownThirdPartyNoise(args)) return;
      const message = args
        .map((a) =>
          typeof a === "string"
            ? a
            : a instanceof Error
              ? a.message
              : JSON.stringify(a),
        )
        .join(" ");
      const errArg = args.find((a) => a instanceof Error) as Error | undefined;
      scheduleAppend({
        id: uuidv4(),
        message,
        source: "console.error",
        stack: errArg?.stack,
        capturedAt: Date.now(),
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      scheduleAppend({
        id: uuidv4(),
        message: extractErrorMessage(reason),
        source: "unhandledrejection",
        stack: reason instanceof Error ? reason.stack : undefined,
        capturedAt: Date.now(),
      });
    };

    const handleErrorEvent = (event: ErrorEvent) => {
      scheduleAppend({
        id: uuidv4(),
        message: event.message,
        source: "error-event",
        stack: event.error?.stack,
        capturedAt: Date.now(),
      });
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleErrorEvent);

    return () => {
      console.error = originalError;
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
      window.removeEventListener("error", handleErrorEvent);
    };
  }, [dispatch]);

  return null;
}
