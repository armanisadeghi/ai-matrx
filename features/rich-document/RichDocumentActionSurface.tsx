"use client";

// features/rich-document/RichDocumentActionSurface.tsx
//
// PHASE 0 — skeleton. Subscribes to the top-of-stack provider for a
// surfaceId and renders... nothing yet. Phase 2 wires the variant renderers
// (bar / mini-bar / menu) so a remote surface can mirror the inline UX.
//
// Diagnostic shape: when no provider is registered, optionally renders a
// `fallback`. When in dev + the surface has no providers, logs once to help
// debug "why doesn't my header toolbar show anything?" cases.

import * as React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTopProvider } from "./redux/actionSurfacesSlice";
import { cn } from "@/lib/utils";

export interface RichDocumentActionSurfaceProps {
  surfaceId: string;
  /** Phase 2 — currently ignored, the slot is reserved on the API. */
  variant?: "bar" | "mini-bar" | "menu";
  className?: string;
  /** Rendered when no provider is currently registered. */
  fallback?: React.ReactNode;
}

export function RichDocumentActionSurface(
  props: RichDocumentActionSurfaceProps,
): React.ReactElement | null {
  const { surfaceId, className, fallback = null } = props;

  const provider = useAppSelector((state) =>
    selectTopProvider(state, surfaceId),
  );

  if (!provider) {
    return <>{fallback}</>;
  }

  // PHASE 0: variant rendering not implemented yet. Render a tiny diagnostic
  // marker in dev so the wiring is observable without committing to layout.
  if (process.env.NODE_ENV !== "production") {
    return (
      <div
        className={cn("rich-document-action-surface", className)}
        data-rd-surface={surfaceId}
        data-rd-provider={provider.providerId}
        data-rd-source-type={provider.sourceType}
        data-rd-action-count={provider.computedActionSpecs.length}
      />
    );
  }

  // Production: silent until Phase 2.
  return null;
}

export default RichDocumentActionSurface;
