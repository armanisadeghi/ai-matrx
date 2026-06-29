"use client";

/**
 * ToolRendererErrorBoundary — guards a compiled DB tool renderer.
 *
 * A DB-authored component that throws during render must never crash the chat.
 * This boundary catches the error and renders the `fallback` (the callsite
 * passes the GenericRenderer). The failure is logged loudly — a recovery firing
 * means a real bug got past authoring, so it screams rather than swallowing.
 */
import React from "react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

interface Props {
  toolName: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ToolRendererErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[ToolRendererErrorBoundary] DB renderer for "${this.props.toolName}" threw at render:`,
      error,
      errorInfo.componentStack,
    );
    captureReactRenderError(error, {
      boundary: "ToolRendererErrorBoundary",
      componentStack: errorInfo.componentStack ?? null,
      relation: `tool:${this.props.toolName}`,
    });
  }

  override render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
