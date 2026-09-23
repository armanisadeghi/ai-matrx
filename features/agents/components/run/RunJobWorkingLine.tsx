"use client";

/**
 * The working line for a generation JOB (image / video / audio output):
 * "Generating an image with Gemini 3.1 Flash Image · 0:42".
 *
 * A job takes tens of seconds to minutes and streams no tokens while it works,
 * so the generic "Processing…" shimmer reads as a hang. This names what is
 * happening, who is doing it, and how long it has been — and it stays until
 * the stream's own end event lands the result. Renders nothing for a text run.
 */

import { useEffect, useState } from "react";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRequestGenerationJob,
  selectRequestStartedAt,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { runJobLabel } from "@/lib/api/run-wait";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function RunJobWorkingLine({
  requestId,
  className,
}: {
  requestId: string;
  className?: string;
}) {
  const job = useAppSelector(selectRequestGenerationJob(requestId));
  const startedAt = useAppSelector(selectRequestStartedAt(requestId));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!job) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job]);

  if (!job) return null;
  const started = startedAt ? Date.parse(startedAt) : NaN;
  const elapsed = Number.isFinite(started) ? formatElapsed(now - started) : null;

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      data-run-job={job.kind}
    >
      <ShimmerText
        text={runJobLabel(job.kind, job.modelLabel)}
        className="text-sm"
      />
      {elapsed && (
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          {elapsed}
        </span>
      )}
    </div>
  );
}

/** Whether this request is a generation job (for callers choosing a loader). */
export function useIsRunJob(requestId: string | null | undefined): boolean {
  return useAppSelector(
    requestId ? selectRequestGenerationJob(requestId) : () => null,
  ) != null;
}
