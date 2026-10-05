"use client";

import { StateChip, type ChipTone } from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";

import { Spinner } from "@/components/ui/loaders/Spinner";
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
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
