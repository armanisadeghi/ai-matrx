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

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Globe, Hourglass, Loader2, RotateCw } from "lucide-react";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { isWaitingForCapacity, type CloudBrowserLoadError } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** How often the panel asks again while every browser slot is taken. */
export const CAPACITY_RETRY_MS = 10_000;
/** A burst refusal clears in seconds; ask again sooner. */
export const STORM_RETRY_MS = 4_000;
/** After this the wait stops being a wait and becomes a failure with a button. */
export const CAPACITY_WAIT_LIMIT_MS = 10 * 60_000;

function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
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

/**
 * Every browser slot is taken (or too many are starting this second). Not a
 * failure: the panel keeps the person's place, says so, and asks again on its
 * own until a slot frees. Before this the person got the same red card as a
 * real failure and a "Try again" button they had to keep pressing.
 */
export function CloudBrowserWaitingForCapacity({
  error,
  retrying,
  onRetry,
  onGiveUp,
}: {
  error: CloudBrowserLoadError;
  retrying: boolean;
  onRetry: () => void;
  onGiveUp: () => void;
}) {
  const seconds = useElapsedSeconds(true);
  const [attempts, setAttempts] = useState(0);
  const retryingRef = useRef(retrying);
  useEffect(() => {
    retryingRef.current = retrying;
  }, [retrying]);
  const interval =
    error.code === "admission_storm_rate_exceeded" ? STORM_RETRY_MS : CAPACITY_RETRY_MS;

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= CAPACITY_WAIT_LIMIT_MS) {
        window.clearInterval(timer);
        onGiveUp();
        return;
      }
      if (retryingRef.current) return;
      setAttempts((n) => n + 1);
      onRetry();
    }, interval);
    return () => window.clearInterval(timer);
    // The wait is one continuous episode per refusal; changing callbacks must
    // not restart its clock.
  }, [interval]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div className="relative">
        <Hourglass className="h-8 w-8 text-muted-foreground" aria-hidden />
        <Loader2
          className="absolute -right-2 -bottom-2 h-4 w-4 animate-spin text-primary"
          aria-hidden
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Waiting for a free browser
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">{error.message}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You keep your place. This panel asks again every {formatDurationMs(interval, { style: "long" })}
          and starts your browser the moment one frees up.
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {seconds}s waited{attempts ? ` · asked ${attempts} ${attempts === 1 ? "time" : "times"}` : ""}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        {retrying ? "Asking now" : "Ask now"}
      </Button>
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
  // A capacity refusal is a wait the panel carries out itself; it only becomes
  // this failure card once the wait has gone on too long.
  const [gaveUpOn, setGaveUpOn] = useState<CloudBrowserLoadError | null>(null);
  if (gaveUpOn !== error && isWaitingForCapacity(error)) {
    return (
      <CloudBrowserWaitingForCapacity
        error={error}
        retrying={retrying}
        onRetry={onRetry}
        onGiveUp={() => setGaveUpOn(error)}
      />
    );
  }
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Your cloud browser could not start
          <ErrorAlchemyMenu />
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
