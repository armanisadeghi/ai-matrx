"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: React.ReactNode; fallbackMessage?: string };
type State = { hasError: boolean; error: Error | null };

export class CxDashboardErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[CX Dashboard Error]", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            {this.props.fallbackMessage || "Something went wrong loading this section."}
          </p>
          <pre className="text-xs text-muted-foreground max-w-md truncate">
            {this.state.error?.message}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
