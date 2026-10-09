"use client";

import { StateChip, type ChipTone } from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { durationMsBetween, formatDurationMs } from "@ai-matrx/kit/format";
const SPINE_TONE: Record<string, ChipTone> = {
  completed: "good",
  failed: "bad",
  cancelled: "neutral",
  running: "accent",
  pending: "neutral",
};

const SPINE_LABEL: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  running: "Running",
  pending: "Queued",
};

export function SpineStatusChip({ status }: { status: string }) {
  return (
    <StateChip
      label={SPINE_LABEL[status] ?? status}
      tone={SPINE_TONE[status] ?? "neutral"}
      icon={status === "running" ? <Spinner size="xs" className="text-current" /> : undefined}
    />
  );
}

/** "1m 12s" between two instants; "—" when either is missing. */
export function formatDuration(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return "—";
  const ms = durationMsBetween(from, to);
  if (ms == null || ms < 0) return "—";
  return formatDurationMs(ms, { style: "compact" });
}
