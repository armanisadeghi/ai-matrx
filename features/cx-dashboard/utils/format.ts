// Formatting utilities for CX Dashboard

import { parseTimestamp } from "@/utils/datetime";

export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number | null | undefined): string {
  if (!tokens) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatDate(dateStr: string | null | undefined): string {
  const d = parseTimestamp(dateStr);
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateFull(dateStr: string | null | undefined): string {
  const d = parseTimestamp(dateStr);
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - (parseTimestamp(dateStr)?.getTime() ?? NaN);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export function computeDuration(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  storedDuration: number | null | undefined,
): number | null {
  if (storedDuration && storedDuration > 0) return storedDuration;
  if (startDate && endDate) {
    return new Date(endDate).getTime() - new Date(startDate).getTime();
  }
  return null;
}

export function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-emerald-500";
    case "pending":
      return "text-amber-500";
    case "error":
    case "failed":
      return "text-red-500";
    case "active":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

export function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "pending":
      return "secondary";
    case "error":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function truncateId(
  id: string | null | undefined,
  chars: number = 8,
): string {
  if (!id) return "";
  return id.slice(0, chars);
}
