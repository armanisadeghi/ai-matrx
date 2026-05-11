"use client";

import React from "react";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import StoreProvider from "@/providers/StoreProvider";
import type { BaseReduxState } from "@/types/reduxTypes";
import { PublicAuthSync } from "./PublicAuthSync";
import UnifiedOverlayController from "@/features/window-panels/UnifiedOverlayController";
import LegacyPromptOverlaysController from "@/features/prompts/components/results-display/LegacyPromptOverlaysController";
import { ConfirmDialogHost } from "@/components/dialogs/confirm/ConfirmDialogHost";

// Thin static shell — the heavy bits (window registry traversal, prompt
// surfaces) are dynamic-loaded INSIDE each leaf widget's own file, not at
// this wrapper level. See `UnifiedOverlayController.tsx` and
// `LegacyPromptOverlaysController.tsx` for the shell+Impl pattern.

interface PublicProvidersProps {
  children: React.ReactNode;
  initialState?: Partial<BaseReduxState>;
}

/**
 * Minimal client boundary for public routes.
 *
 * Server-rendered children (layout shell, header markup, page content)
 * pass through as already-rendered React nodes — they are NOT converted
 * to client components. Only the provider wrappers themselves ship JS.
 *
 * Auth sync runs after a 100ms delay inside PublicAuthSync so it never
 * blocks the initial paint.
 */
export function PublicProviders({
  children,
  initialState,
}: PublicProvidersProps) {
  return (
    <ReactQueryProvider>
      <StoreProvider initialState={initialState}>
        <TooltipProvider delayDuration={200}>
          <PublicAuthSync />
          <UnifiedOverlayController />
          <LegacyPromptOverlaysController />
          {/* See app/Providers.tsx for the rationale. */}
          <ConfirmDialogHost />
          {children}
        </TooltipProvider>
      </StoreProvider>
    </ReactQueryProvider>
  );
}
