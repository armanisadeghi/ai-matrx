"use client";

/**
 * EmitRendererErrorBoundary — guards a compiled DB emit renderer.
 *
 * A DB-authored component that throws during render must never crash the run
 * view. This boundary catches the error and renders the `fallback` (the
 * callsite passes the `GenericEmitRenderer`). The failure is logged loudly — a
 * recovery firing means a real bug got past authoring, so it screams rather
 * than swallowing. Cloned from
 * `tool-call-visualization/db-renderer/ToolRendererErrorBoundary.tsx`.
 */
import React from "react";

interface Props {
  componentRef: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class EmitRendererErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[EmitRendererErrorBoundary] emit renderer for "${this.props.componentRef}" threw at render:`,
      error,
      errorInfo.componentStack,
    );
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
