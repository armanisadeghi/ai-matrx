"use client";

/**
 * ErrorBoundaryWithCapture — the canonical React error boundary.
 *
 * Catches a render error, feeds it to the systemwide Error Inspector
 * (`captureReactRenderError`), and renders a fallback. Use this instead of
 * hand-rolling a `componentDidCatch` class — every new boundary gets capture
 * for free, and the existing bespoke boundaries should migrate here over time
 * (they currently each call `captureReactRenderError` directly, which this
 * primitive centralizes).
 *
 *   <ErrorBoundaryWithCapture boundary="MessageList" relation={messageId}
 *     fallback={(err, reset) => <Failed err={err} onRetry={reset} />}>
 *     {children}
 *   </ErrorBoundaryWithCapture>
 */

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

interface ErrorBoundaryWithCaptureProps {
  children: React.ReactNode;
  /** Name shown in the Inspector (e.g. "MessageList", "ToolRenderer"). */
  boundary: string;
  /** What this guards — a message id, `tool:<name>`, route, etc. */
  relation?: string;
  /**
   * Fallback UI. A render-prop receives `(error, reset)` so the callsite can
   * offer a retry; a plain node is rendered as-is. Omitted → a compact default.
   */
  fallback?:
    | React.ReactNode
    | ((error: Error, reset: () => void) => React.ReactNode);
  /** Optional extra side effect (logging, telemetry) — capture already happens. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /**
   * When any value in this array changes, the boundary clears its error and
   * re-renders children (so a new id / route recovers without a remount).
   */
  resetKeys?: ReadonlyArray<unknown>;
}

interface ErrorBoundaryWithCaptureState {
  error: Error | null;
}

function DefaultFallback() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>This section could not be displayed.</span>
    </div>
  );
}

export class ErrorBoundaryWithCapture extends React.Component<
  ErrorBoundaryWithCaptureProps,
  ErrorBoundaryWithCaptureState
> {
  override state: ErrorBoundaryWithCaptureState = { error: null };

  static getDerivedStateFromError(
    error: Error,
  ): ErrorBoundaryWithCaptureState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureReactRenderError(error, {
      boundary: this.props.boundary,
      relation: this.props.relation,
      componentStack: info.componentStack ?? null,
    });
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(prev: ErrorBoundaryWithCaptureProps): void {
    if (this.state.error === null) return;
    const a = prev.resetKeys;
    const b = this.props.resetKeys;
    if (a && b && (a.length !== b.length || a.some((v, i) => v !== b[i]))) {
      this.reset();
    }
  }

  private reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    if (this.state.error !== null) {
      const fb = this.props.fallback;
      if (typeof fb === "function") return fb(this.state.error, this.reset);
      return fb ?? <DefaultFallback />;
    }
    return this.props.children;
  }
}

export default ErrorBoundaryWithCapture;
