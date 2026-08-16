"use client";

/**
 * CaptureGapAlert — the loud half of capture-gap detection.
 *
 * A silent bridge is the failure this exists for: Claude Code treats a failed
 * MCP hook as non-blocking, so mirroring can stop for a day while every screen
 * keeps looking normal. Passive wallpaper ("No recent activity" in a status
 * card) is what we had, and it did not surface a 23.5-hour outage.
 *
 * Renders NOTHING while capture is healthy or merely quiet. That restraint is
 * the feature: a banner the owner learns to ignore is the same defect as no
 * banner at all.
 */

import React from "react";
import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSessionTimestamp } from "./verdict";
import type { CaptureGapVerdict } from "./captureGap";
import { useCaptureGap } from "./useCaptureGap";

export interface CaptureGapAlertProps {
  verdict: CaptureGapVerdict;
  /** Most recent delivery, shown so the owner can judge the claim themselves. */
  lastSeenAt: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
  className?: string;
}

export function CaptureGapAlert({
  verdict,
  lastSeenAt,
  onRefresh,
  refreshing = false,
  className,
}: CaptureGapAlertProps) {
  // Healthy, quiet, and in-flight states stay silent. `unknown` is a failed or
  // pending read — the surrounding surface already shows its own read error.
  if (!verdict.isAlarm && verdict.tone !== "never") return null;

  const isNever = verdict.tone === "never";
  const isStopped = verdict.tone === "stopped";

  return (
    <div
      role={isNever ? "status" : "alert"}
      className={cn(
        "rounded-lg border p-4",
        isNever && "border-border bg-muted/40",
        verdict.tone === "suspect" &&
          "border-amber-500/50 bg-amber-500/10",
        isStopped && "border-destructive/50 bg-destructive/10",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {isNever ? (
          <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <AlertTriangle
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              isStopped
                ? "text-destructive"
                : "text-amber-600 dark:text-amber-500",
            )}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {verdict.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {verdict.detail}
          </p>

          {verdict.action ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {verdict.action}
            </p>
          ) : null}

          {lastSeenAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last delivery: {formatSessionTimestamp(lastSeenAt)}
              {verdict.calibrated
                ? null
                : " — too little history to compare against your normal pattern"}
            </p>
          ) : null}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-7 shrink-0 gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : "Check again"}
        </Button>
      </div>
    </div>
  );
}

/** Self-contained mount: reads the verdict itself so a page adds one line. */
export function CaptureGapAlertConnected({ className }: { className?: string }) {
  const { verdict, lastSeenAt, loading, refresh } = useCaptureGap();
  return (
    <CaptureGapAlert
      verdict={verdict}
      lastSeenAt={lastSeenAt}
      onRefresh={refresh}
      refreshing={loading}
      className={className}
    />
  );
}
