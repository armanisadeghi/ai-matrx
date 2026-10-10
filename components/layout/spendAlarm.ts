import type { SystemAnnouncement } from "@/types/feedback.types";

/**
 * Spend alarms ride the existing super-admin delivery rail: a targeted
 * `users.system_announcements` row written by aidream's
 * `services/billing/spend_alarm.py`. `metadata.alarm === true` marks the row.
 */
export type SpendAlarm = {
  id: string;
  /** Acknowledgement key. A repeat of the same alarm changes `count`, so it asks again. */
  ackKey: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  link: string | null;
  count: number;
  lastAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toSpendAlarm(a: SystemAnnouncement): SpendAlarm | null {
  const meta = asRecord(a.metadata);
  if (!meta || meta.alarm !== true) return null;
  const count = typeof meta.count === "number" ? meta.count : 1;
  const link = typeof meta.link === "string" && meta.link ? meta.link : null;
  return {
    id: a.id,
    ackKey: `${a.id}:${count}`,
    severity: meta.severity === "error" ? "error" : "warning",
    title: a.title,
    detail: a.message.split("\n\nOpen: ")[0],
    link,
    count,
    lastAt: typeof meta.last_at === "string" ? meta.last_at : a.updated_at,
  };
}

/** Errors first, then most recent. */
export function sortSpendAlarms(alarms: SpendAlarm[]): SpendAlarm[] {
  return [...alarms].sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === "error" ? -1 : 1;
    return y.lastAt.localeCompare(x.lastAt);
  });
}
