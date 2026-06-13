/**
 * Shared formatters for the Observational Memory UI.
 *
 * All values are admin-debug facing, so we lean toward precision over
 * prettified rounding — fractional cents and exact token counts matter.
 */

import { parseTimestamp } from "@/utils/datetime";

export function formatCostUsd(
  cost: number | null | undefined,
  fractionDigits = 4,
): string {
  if (cost == null || Number.isNaN(cost)) return "—";
  if (cost === 0) return "$0.0000";
  if (cost < 0.0001) return `$${cost.toExponential(2)}`;
  return `$${cost.toFixed(fractionDigits)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = parseTimestamp(iso);
  if (!d) return iso ?? "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  const then = parseTimestamp(iso)?.getTime() ?? NaN;
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
