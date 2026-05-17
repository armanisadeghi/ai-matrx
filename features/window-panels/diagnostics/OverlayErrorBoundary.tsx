"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLazyLoadError } from "@/lib/redux/middleware/overlayDiagnostics";

/**
 * Catches errors thrown during the lazy import or initial render of an
 * overlay component. Without this, a chunk-load failure or render-time
 * exception bubbles up to the nearest framework boundary and reads as a
 * blank window with no actionable signal. We reroute it through the
 * overlay diagnostics channel so the failure carries the same `overlayId`
 * context as the middleware's timeout report.
 *
 * On error: log via `reportLazyLoadError` (which prints with overlay
 * context) and render `null` so the rest of the app stays interactive.
 */
interface Props {
  overlayId: string;
  instanceId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class OverlayErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportLazyLoadError(this.props.overlayId, this.props.instanceId, error);
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
