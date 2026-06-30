/**
 * features/files/components/surfaces/PreviewErrorBoundary.tsx
 *
 * Last-resort error boundary around <FilePreview/>. Previewers can throw for
 * many reasons we don't fully control — the PDF worker may fail to fetch a
 * worker script, an image URL may resolve to an HTML error page, signed URLs
 * may expire mid-render, etc.
 *
 * Without this, an unhandled previewer error bubbles to a route boundary
 * and the user sees a full-screen "Something went wrong" with no way back.
 * With this, the rest of the cloud-files shell (sidebar, list, header,
 * close button) stays interactive — the failure is contained to this pane.
 *
 * Recovery flow:
 *   • Click "Try again" → resets the boundary's local state and remounts the
 *     previewer with a fresh React subtree.
 *   • Click "Open in new tab" → opens a fresh signed URL in a tab; if the
 *     issue was just an expired URL, the user can read the file there.
 *   • Click "Close preview" → tells the parent to close the pane.
 */

"use client";

import React from "react";
import { AlertCircle, ExternalLink, RefreshCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";
import { getStore } from "@/lib/redux/store-singleton";
import { setActiveFileId } from "@/features/files/redux/slice";
import { getSignedUrl } from "@/features/files/redux/thunks";

interface PreviewErrorBoundaryProps {
  fileId: string;
  children: React.ReactNode;
}

interface State {
  errorMessage: string | null;
  resetCount: number;
}

export class PreviewErrorBoundary extends React.Component<
  PreviewErrorBoundaryProps,
  State
> {
  override state: State = { errorMessage: null, resetCount: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const errorMessage =
      error instanceof Error
        ? error.message || error.name
        : typeof error === "string"
          ? error
          : "Unknown error";
    return { errorMessage };
  }

  override componentDidCatch(error: unknown, info: unknown): void {
    // Surface to console so it's still discoverable in dev / Sentry.
    // eslint-disable-next-line no-console
    console.error("[PreviewErrorBoundary]", error, info);
    captureReactRenderError(error, {
      boundary: "PreviewErrorBoundary",
      relation: `file:${this.props.fileId}`,
      componentStack:
        (info as React.ErrorInfo | undefined)?.componentStack ?? null,
    });
  }

  override componentDidUpdate(prev: PreviewErrorBoundaryProps): void {
    // If the parent swaps to a different file, clear the error so the new
    // file gets a fresh render.
    if (prev.fileId !== this.props.fileId && this.state.errorMessage) {
      this.setState({ errorMessage: null });
    }
  }

  reset = (): void => {
    this.setState((s) => ({
      errorMessage: null,
      resetCount: s.resetCount + 1,
    }));
  };

  openInNewTab = async (): Promise<void> => {
    const store = getStore();
    if (!store) return;
    try {
      const result = await store
        // dispatch is loosely typed here (we don't pull AppDispatch to avoid a
        // class-component generic) — runtime works exactly the same.
        .dispatch(
          getSignedUrl({ fileId: this.props.fileId, expiresIn: 3600 }) as never,
        );
      const url =
        (result as { payload?: { url?: string } } | undefined)?.payload?.url ??
        null;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore — the user can fall back to Close
    }
  };

  closePreview = (): void => {
    getStore()?.dispatch(setActiveFileId(null));
  };

  override render(): React.ReactNode {
    if (!this.state.errorMessage) {
      // Re-mounting via key={resetCount} forces previewers to redo any
      // useEffect setup (e.g. re-fetch signed URLs) on retry.
      return (
        <React.Fragment key={this.state.resetCount}>
          {this.props.children}
        </React.Fragment>
      );
    }

    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
        )}
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Couldn't preview this file</h3>
          <p className="max-w-md text-xs text-muted-foreground">
            {this.state.errorMessage}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => void this.openInNewTab()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </button>
          <button
            type="button"
            onClick={this.closePreview}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <X className="h-3.5 w-3.5" />
            Close preview
          </button>
        </div>
      </div>
    );
  }
}
