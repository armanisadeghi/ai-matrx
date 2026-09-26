"use client";

/**
 * GenerationJobCard — a video generation renders as a JOB until the stream's
 * own end event lands the player.
 *
 * A video takes 10 seconds to several minutes and streams nothing while the
 * provider renders, so the card says what is happening, which model is doing
 * it, how long it has been, and what it will cost:
 *
 *   Generating a video · Veo 3.1                      1:12
 *   ▰▰▰▰▱▱▱▱▱▱  (indeterminate — providers report no percentage)
 *   8 s · 16:9 · ≈ $3.20 ($0.40/s × 8 s)
 *
 * The cost is an ESTIMATE from the routing offering's per-second price and the
 * requested duration (a literal setting or a variable-bound control), labelled
 * as one; the billed figure arrives with the finished run. When no price or
 * duration is known the line says so instead of inventing a number.
 *
 * Reuses the run-wait lane's job state (`activeRequests.generationJob`,
 * `startedAt`); renders nothing for any run that is not a video job.
 */

import { useEffect, useMemo, useState } from "react";
import { Clapperboard } from "lucide-react";
import { Progress } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  selectRequest,
  selectRequestGenerationJob,
  selectRequestStartedAt,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectCurrentSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  selectInstanceVariableDefinitions,
  selectResolvedVariables,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectRunModelId } from "@/features/agents/runtime/generation-job";
import { useVideoSecondPrice } from "./useVideoSecondPrice";

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The value a control resolves to for this run: a variable bound to the
 *  control key wins (the run form's answer), else the literal setting. */
export function resolvedControl(
  key: string,
  settings: Record<string, unknown> | undefined,
  definitions: { name: string; control?: { key?: string } }[],
  values: Record<string, unknown>,
): unknown {
  const bound = definitions.find((d) => d.control?.key === key);
  if (bound) {
    const value = values[bound.name];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return settings?.[key];
}

export interface VideoJobEstimate {
  seconds: number | null;
  pricePerSecond: number | null;
  usd: number | null;
}

export function estimateVideoJob(
  duration: unknown,
  pricePerSecond: number | null,
): VideoJobEstimate {
  const parsed =
    typeof duration === "number"
      ? duration
      : typeof duration === "string" && duration.trim() !== ""
        ? Number(duration)
        : NaN;
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  return {
    seconds,
    pricePerSecond,
    usd: seconds !== null && pricePerSecond !== null ? seconds * pricePerSecond : null,
  };
}

export function describeEstimate(estimate: VideoJobEstimate): string {
  if (estimate.usd !== null && estimate.pricePerSecond !== null) {
    return `≈ $${estimate.usd.toFixed(2)} ($${estimate.pricePerSecond.toFixed(2)}/s × ${estimate.seconds} s)`;
  }
  if (estimate.seconds === null) {
    return "Cost shows when the video lands (duration set by the model)";
  }
  return "Cost shows when the video lands (no catalog price for this model)";
}

export function GenerationJobCard({
  requestId,
  className,
}: {
  requestId: string;
  className?: string;
}) {
  const job = useAppSelector(selectRequestGenerationJob(requestId));
  const startedAt = useAppSelector(selectRequestStartedAt(requestId));
  const conversationId = useAppSelector(
    (state) => selectRequest(requestId)(state)?.conversationId ?? "",
  );
  const settings = useAppSelector(selectCurrentSettings(conversationId)) as
    | Record<string, unknown>
    | undefined;
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const resolvedSelector = useMemo(
    () => selectResolvedVariables(conversationId),
    [conversationId],
  );
  const values = useAppSelector(resolvedSelector);
  // The same model the job was labelled from (override, else the agent's own,
  // honouring a pinned version) — reading the agent record directly missed it
  // on /agents/[id]/run and the card claimed "no catalog price".
  const modelId = useAppSelector((state) => selectRunModelId(state, conversationId));
  const price = useVideoSecondPrice(job?.kind === "video" ? modelId : null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (job?.kind !== "video") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?.kind]);

  if (job?.kind !== "video") return null;

  const started = startedAt ? Date.parse(startedAt) : NaN;
  const elapsed = Number.isFinite(started) ? formatElapsed(now - started) : null;
  const duration = resolvedControl("duration_seconds", settings, definitions, values);
  const aspect = resolvedControl("aspect_ratio", settings, definitions, values);
  const estimate = estimateVideoJob(duration, price);
  const facts = [
    estimate.seconds !== null ? `${estimate.seconds} s` : null,
    typeof aspect === "string" && aspect ? aspect : null,
    describeEstimate(estimate),
  ].filter(Boolean);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="generation-job-card"
      className={cn(
        "w-full max-w-md rounded-lg border border-border bg-card p-3 text-sm",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">
          <span className="font-medium">Generating a video</span>
          {job.modelLabel && (
            <span className="text-muted-foreground"> · {job.modelLabel}</span>
          )}
        </span>
        {elapsed && (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {elapsed}
          </span>
        )}
      </div>
      {/* Indeterminate: providers report no percentage. */}
      <Progress value={null} aria-label="Generating a video" className="mt-2 h-1.5" />
      <p className="mt-2 text-xs text-muted-foreground" data-testid="generation-job-facts">
        {facts.join(" · ")}
      </p>
    </div>
  );
}
