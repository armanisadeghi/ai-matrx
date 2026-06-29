/**
 * captureReactError.ts
 *
 * Adapter for React render errors caught by an error boundary. Error
 * boundaries SWALLOW the error (it never reaches `window` 'error'), so the
 * global listener can't see it — a boundary must opt in by calling this.
 *
 * Any boundary in the app can adopt it: call `captureReactRenderError` from
 * `componentDidCatch` and the failure shows up in the Error Inspector with the
 * component stack. Wired into `OverlayErrorBoundary` today; other boundaries
 * can follow the same one-liner.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { extractErrorMessage } from "@/utils/errors";

interface ReactErrorContext {
  /** A name for the boundary that caught it (e.g. "OverlayErrorBoundary"). */
  boundary?: string;
  /** React's component stack from `ErrorInfo`. */
  componentStack?: string | null;
  /** For lazy overlays: the dynamic-import module path that failed. */
  modulePath?: string | null;
}

export function captureReactRenderError(
  error: unknown,
  ctx: ReactErrorContext = {},
): void {
  try {
    captureError({
      source: "react-render",
      relation: ctx.boundary ?? ctx.modulePath ?? undefined,
      message: extractErrorMessage(error) || "React render error",
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      // The component stack is the "where in the tree" answer — surface it as
      // the call-site, mirroring the Supabase call-site field.
      callSite: ctx.componentStack ?? undefined,
      raw: {
        boundary: ctx.boundary,
        modulePath: ctx.modulePath,
        componentStack: ctx.componentStack,
        name: error instanceof Error ? error.name : undefined,
        message: extractErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  } catch {
    /* capture must never break the boundary */
  }
}
