"use client";

/**
 * ScreenshotFace — "show me what's happening" (D-8 tier 2 / D-21).
 *
 * A bounded, user-initiated request for stills. Event-driven first: a fresh
 * capture the moment the agent acts on the page, a slow idle heartbeat in
 * between, and an opt-in Rapid mode for self-animating pages. Auto-off after
 * 5 minutes without interaction; always re-armable; and a visible way out at
 * all times. This is never an ambient feed.
 */

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Camera, CameraOff, RefreshCw, Eye, Zap } from "lucide-react";
import type { ScreenshotFrame } from "../types";

function Countdown({ autoOffAt }: { autoOffAt: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!autoOffAt || now === null) return null;
  const secs = Math.max(0, Math.round((autoOffAt - now) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="tabular-nums text-muted-foreground">
      auto-off in {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

export function ScreenshotFace({
  active,
  frames,
  autoOffAt,
  onStart,
  onStop,
  onRearm,
  rapid,
  onToggleRapid,
  disabled,
  className,
}: {
  active: boolean;
  frames: ScreenshotFrame[];
  autoOffAt: number | null;
  onStart: () => void;
  onStop: () => void;
  onRearm: () => void;
  /** Rapid mode: frequent timed captures for pages that animate without
   * tool activity. Normal mode is event-driven + a slow idle heartbeat. */
  rapid?: boolean;
  onToggleRapid?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const latest = frames[0];

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Eye className="h-3.5 w-3.5" />
          Screenshots on request
        </span>
        <div className="flex items-center gap-2">
          {active ? (
            <>
              <Countdown autoOffAt={autoOffAt} />
              {onToggleRapid && (
                <Button
                  size="sm"
                  variant={rapid ? "secondary" : "ghost"}
                  onClick={onToggleRapid}
                  disabled={disabled}
                  title={
                    rapid
                      ? "Rapid: capturing every couple of seconds"
                      : "Capture rapidly (for pages that change on their own)"
                  }
                >
                  <Zap className="mr-1 h-3.5 w-3.5" />
                  Rapid
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onRearm} disabled={disabled}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Keep watching
              </Button>
              <Button size="sm" variant="outline" onClick={onStop}>
                <CameraOff className="mr-1 h-3.5 w-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onStart} disabled={disabled}>
              <Camera className="mr-1 h-3.5 w-3.5" />
              Show me what's happening
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {!active && frames.length === 0 ? (
          <p className="mx-auto max-w-sm pt-8 text-center text-sm text-muted-foreground">
            Press <strong>Show me what&apos;s happening</strong> to watch the page: a fresh
            picture the moment your agent acts, plus a refresh every few seconds in between.
            It stops on its own after 5 minutes so nothing runs in the background — you can
            start it again any time.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {latest ? (
              <figure className="overflow-hidden rounded-md border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latest.previewUrl}
                  alt={`Screenshot captured ${new Date(latest.capturedAt).toLocaleTimeString()}`}
                  className="w-full"
                />
                <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                  Latest · {new Date(latest.capturedAt).toLocaleTimeString()} · redacted
                </figcaption>
              </figure>
            ) : null}
            {frames.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {frames.slice(1).map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={f.id}
                    src={f.previewUrl}
                    alt={`Earlier screenshot ${new Date(f.capturedAt).toLocaleTimeString()}`}
                    className="rounded border border-border"
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
