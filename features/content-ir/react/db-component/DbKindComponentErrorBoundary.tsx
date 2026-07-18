"use client";

/**
 * DbKindComponentErrorBoundary — guards a compiled DB kind component.
 *
 * A user-authored component that throws during render must never crash the
 * surface (chat, notes, admin preview). The boundary catches, renders the
 * fallback (the kind's generic structured viewer — the R6 disposition, never
 * a blank hole), and SCREAMS: a recovery firing means a real bug got past
 * authoring. Modeled on tool-viz's ToolRendererErrorBoundary.
 */
import React from "react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

interface Props {
  kind: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class DbKindComponentErrorBoundary extends React.Component<
  Props,
  State
> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
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
