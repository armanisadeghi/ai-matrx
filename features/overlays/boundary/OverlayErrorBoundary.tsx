"use client";

/**
 * OverlayErrorBoundary
 *
 * A React error boundary scoped to a single lazily-loaded overlay. `next/dynamic`
 * gives us a Suspense boundary (the `loading` fallback) but NOT an error
 * boundary — so a rejected dynamic import (ChunkLoadError) propagates upward and
 * the overlay silently renders nothing. This closes that hole: paired with the
 * canonical loading fallback inside {@link lazyOverlay}, it makes it impossible
 * for the overlay area to render nothing. The outcomes are exactly two:
 * the component, or a meaningful error.
 *
 * On catch it screams (console.error — loud recovery per CLAUDE.md) and renders
 * {@link OverlayErrorFallback}, which carries the admin full-state dump + the
 * "Copy for AI" payload.
 */

import * as React from "react";
import { OverlayErrorFallback } from "@/features/overlays/boundary/OverlayErrorFallback";
import { normalizeError } from "@/features/overlays/boundary/overlayErrorReport";

interface OverlayErrorBoundaryProps {
  /** Module path of the wrapped dynamic import, for diagnostics. */
  modulePath: string | null;
  /**
   * Called when the user clicks "Try again". The parent (lazyOverlay) uses this
   * to build a FRESH loadable so the import is genuinely re-attempted — without
   * it, a cached failed import would replay the same error.
   */
  onRetry?: () => void;
  /**
   * Dismiss this overlay instance (the controller's `closeOverlay` dispatch).
   * When present, the fallback shows a "Close" button so a failed overlay never
   * traps the user into a full page reload.
   */
  onClose?: () => void;
  /** The lazy overlay subtree this boundary protects. */
  children: React.ReactNode;
}

interface OverlayErrorBoundaryState {
  error: unknown | null;
  componentStack: string | null;
}

export class OverlayErrorBoundary extends React.Component<
  OverlayErrorBoundaryProps,
  OverlayErrorBoundaryState
> {
  state: OverlayErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(
    error: unknown,
  ): Partial<OverlayErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const e = normalizeError(error);
    this.setState({ componentStack: info.componentStack ?? null });
    // LOUD recovery: a caught overlay error means a real bug (or a broken
    // deploy/chunk graph) got past the proactive layer. Never swallow it.
    console.error(
      "[Track Overlay] B6, OverlayErrorBoundary.tsx — CAUGHT: overlay threw, showing error fallback",
      {
        modulePath: this.props.modulePath,
        errorName: e.name,
        message: e.message,
        isChunkLoadError: e.isChunkLoadError,
        componentStack: info.componentStack,
      },
    );
  }

  private handleReset = (): void => {
    // Ask the parent to swap in a fresh loadable BEFORE we clear our error, so
    // when we re-render children they trigger a genuine new import.
    this.props.onRetry?.();
    this.setState({ error: null, componentStack: null });
  };

  render(): React.ReactNode {
    if (this.state.error !== null) {
      return (
        <OverlayErrorFallback
          modulePath={this.props.modulePath}
          error={this.state.error}
          componentStack={this.state.componentStack}
          onReset={this.handleReset}
          onClose={this.props.onClose}
        />
      );
    }
    return this.props.children;
  }
}

export default OverlayErrorBoundary;
