import React, { ErrorInfo } from "react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

// Error boundary component for catching React errors
export class MarkdownErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    fallback: React.ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
  },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      "[MarkdownStream] Error caught by boundary:",
      error,
      errorInfo,
    );
    captureReactRenderError(error, {
      boundary: "MarkdownErrorBoundary",
      componentStack: errorInfo.componentStack ?? null,
    });
    this.props.onError?.(error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
