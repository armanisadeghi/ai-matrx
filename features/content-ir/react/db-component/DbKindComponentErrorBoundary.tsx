"use client";

/**
 * DbKindComponentErrorBoundary — THE MATRIX BINDING of the shared boundary.
 *
 * The boundary itself — catch → fallback (never a blank hole) → scream, with
 * the `resetSignal` un-latch when a NEW component version arrives — lives in
 * `@ai-matrx/content-ir-react` (`db-component/DbKindComponentErrorBoundary`),
 * absorbed from this module per C22. Read the semantics there.
 *
 * What stays here is our scream wiring, bound through the `onCaught` seam:
 *  - the structured render-error capture (`captureReactRenderError`) — this IS
 *    the scream; it is deliberately not mirrored through console.error, which
 *    the production console adapter would persist AGAIN as a generic
 *    `console-error` symptom (binding `onCaught` replaces the package's
 *    console default, which is exactly what we want);
 *  - the durable incident (`reportKindComponentIncident`) — the capture serves
 *    an admin watching THIS browser; the incident reaches whoever can fix the
 *    component, which matters when the person who hit the bug is an ordinary
 *    user (kindComponentIncident.ts).
 */
import React from "react";
import { DbKindComponentErrorBoundary as SharedDbKindComponentErrorBoundary } from "@ai-matrx/content-ir-react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";
import { reportKindComponentIncident } from "./kindComponentIncident";

interface Props {
  kind: string;
  /** The resolved component's `updated_at`; a change means a new version. */
  resetSignal: string | null;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

export function DbKindComponentErrorBoundary({
  kind,
  resetSignal,
  fallback,
  children,
}: Props): React.ReactElement {
  return (
    <SharedDbKindComponentErrorBoundary
      kind={kind}
      resetSignal={resetSignal}
      fallback={fallback}
      onCaught={(error, info) => {
        captureReactRenderError(error, {
          boundary: "DbKindComponentErrorBoundary",
          componentStack: info.componentStack,
          relation: `kind:${kind}`,
        });
        reportKindComponentIncident({
          kind,
          errorType: "render_throw",
          message: error instanceof Error ? error.message : String(error),
          componentUpdatedAt: resetSignal,
          stack: info.componentStack,
        });
      }}
    >
      {children}
    </SharedDbKindComponentErrorBoundary>
  );
}
