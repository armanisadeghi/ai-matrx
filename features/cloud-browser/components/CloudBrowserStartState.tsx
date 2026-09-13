"use client";

/**
 * CloudBrowserStartState — what the Live area shows before there is a browser.
 *
 * Starting a browser holds one request open while the worker restores the saved
 * session and launches Chromium; in production that took ~53 s (2026-09-12).
 * The panel used to render its full chrome with empty faces for that whole
 * time, then — when a start failed — one small red line under the tab area and
 * no way to try again. Both are the same defect: a screen that does not say
 * what is happening or what to do next.
 *
 * Two honest states:
 *   - starting: says what is happening, how long it has been, and what to expect;
 *   - failed:   says what went wrong in the server's own words, offers Try again
 *               when the server says a retry can work, and shows the request id
 *               to quote when it cannot.
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, Globe, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudBrowserLoadError } from "../types";

function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    setSeconds(0);
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return seconds;
}

export function CloudBrowserStarting() {
  const seconds = useElapsedSeconds(true);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div className="relative">
        <Globe className="h-8 w-8 text-muted-foreground" aria-hidden />
        <Loader2
          className="absolute -right-2 -bottom-2 h-4 w-4 animate-spin text-primary"
          aria-hidden
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Starting your cloud browser
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Restoring your saved session so you stay signed in. This can take up
          to a minute.
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {seconds}s
      </p>
    </div>
  );
}

export function CloudBrowserStartFailed({
  error,
  retrying,
  onRetry,
}: {
  error: CloudBrowserLoadError;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Your cloud browser could not start
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {error.message}
        </p>
      </div>
      {error.retryable ? (
        <Button size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          {retrying ? "Trying again" : "Try again"}
        </Button>
      ) : (
        <p className="max-w-sm text-xs text-muted-foreground">
          Trying again will not fix this one.
          {error.requestId
            ? " If it keeps happening, report it with the reference below."
            : null}
        </p>
      )}
      {error.requestId ? (
        <p className="text-[11px] text-muted-foreground/80">
          Reference: <span className="font-mono">{error.requestId}</span>
        </p>
      ) : null}
    </div>
  );
}
