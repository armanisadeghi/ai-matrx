"use client";

/**
 * DbKindComponentErrorBoundary — guards a compiled DB kind component.
 *
 * A user-authored component that throws during render must never crash the
 * surface (chat, notes, admin preview). The boundary catches, renders the
 * fallback (the kind's generic structured viewer — the R6 disposition, never
 * a blank hole), and SCREAMS: a recovery firing means a real bug got past
 * authoring. Modeled on tool-viz's ToolRendererErrorBoundary.
 *
 * `resetSignal` (the component's `updated_at`) un-latches the boundary when a
 * NEW component version arrives: an author who fixes a throwing component must
 * see the fix on the next re-render, not stay stuck on the fallback until a
 * full unmount. Without this the error state is sticky for the whole session —
 * the "broke, then magically fixed itself minutes later" class. React error
 * boundaries never self-clear, so a version change is the only safe signal
 * (`hasError` alone can't tell a fixed version from the same broken one).
 */
import React from "react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

interface Props {
  kind: string;
  /** The resolved component's `updated_at`; a change means a new version. */
  resetSignal: string | null;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  /**
   * The `resetSignal` seen on the LAST render — tracked every render (not just
   * on error) so that at throw time it already holds the version that threw.
   * `getDerivedStateFromError` cannot read props, so this is how the boundary
   * knows which version to un-latch away from.
   */
  signalAtLastRender: string | null;
}

export class DbKindComponentErrorBoundary extends React.Component<
  Props,
  State
> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, signalAtLastRender: props.resetSignal };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetSignal === state.signalAtLastRender) return null;
    // The version changed. If we were latched on the old version, un-latch so
    // the new (hopefully fixed) component gets a fresh render attempt; either
    // way, record the new signal as the one now rendering.
    return { hasError: false, signalAtLastRender: props.resetSignal };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[DbKindComponentErrorBoundary] DB kind component for "${this.props.kind}" threw at render — falling back to the generic structured viewer:`,
      error,
      errorInfo.componentStack,
    );
    captureReactRenderError(error, {
      boundary: "DbKindComponentErrorBoundary",
      componentStack: errorInfo.componentStack ?? null,
      relation: `kind:${this.props.kind}`,
    });
  }

  override render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
