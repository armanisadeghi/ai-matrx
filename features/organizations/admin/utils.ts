/**
 * Formatting helpers for org-admin metrics. Pure, no side effects.
 */

/** Human-readable byte size. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Milli-cents → USD string. 3996 mcents = $0.04. */
export function formatMcents(mcents: number | null | undefined): string {
  if (mcents == null) return "—";
  return `$${(mcents / 100000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** USD → milli-cents for storing a budget. Returns null for empty input. */
export function usdToMcents(usd: string | number | null | undefined): number | null {
  if (usd === "" || usd == null) return null;
  const n = typeof usd === "number" ? usd : Number(usd);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100000);
}

/** GB (decimal) → bytes. Returns null for empty input. */
export function gbToBytes(gb: string | number | null | undefined): number | null {
  if (gb === "" || gb == null) return null;
  const n = typeof gb === "number" ? gb : Number(gb);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1024 * 1024 * 1024);
}

/** Bytes → GB number (for prefilling a form). */
export function bytesToGb(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  return (bytes / (1024 * 1024 * 1024)).toString();
}

/** Compact relative-time label, e.g. "3d ago", "just now", "Never". */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

/** Coarse activity bucket used for the roster "engagement" signal. */
export type ActivityBucket = "active" | "idle" | "dormant" | "never";

export function activityBucket(lastActivityIso: string | null | undefined): ActivityBucket {
  if (!lastActivityIso) return "never";
  const days = (Date.now() - new Date(lastActivityIso).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return "active";
  if (days <= 30) return "idle";
  return "dormant";
}
