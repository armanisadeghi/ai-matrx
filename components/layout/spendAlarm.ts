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
  /** The person an account alarm is about (a user id), so a name can replace the raw id. */
  subjectUserId: string | null;
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
    subjectUserId:
      meta.subject_type === "account" && typeof meta.subject_id === "string" ? meta.subject_id : null,
  };
}

/** Errors first, then most recent. */
export function sortSpendAlarms(alarms: SpendAlarm[]): SpendAlarm[] {
  return [...alarms].sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === "error" ? -1 : 1;
    return y.lastAt.localeCompare(x.lastAt);
  });
}

const ACCOUNT_LINK_BASE = "https://manage.aimatrx.com/administration/users/usage?user=";

/**
 * Rows written before the writer resolved names carry a raw user id in the title,
 * the detail and a generic link. Show the person instead: swap the id (and its
 * "Account " prefix) for the name, drop a title amount the detail already
 * states, and send Open to that person's usage page.
 */
export function nameSpendAlarm(alarm: SpendAlarm, names: ReadonlyMap<string, string>): SpendAlarm {
  const id = alarm.subjectUserId;
  const name = id ? names.get(id) : undefined;
  if (!id || !name) return alarm;
  const swap = (text: string) => text.split(`Account ${id}`).join(name).split(id).join(name);
  const title = swap(alarm.title);
  const detail = swap(alarm.detail);
  const amount = /\s\$[\d.,]+$/.exec(title)?.[0];
  return {
    ...alarm,
    title: amount && detail.includes(amount.trim()) ? title.slice(0, -amount.length) : title,
    detail,
    link: alarm.link && alarm.link.endsWith("/administration/billing") ? ACCOUNT_LINK_BASE + id : alarm.link,
  };
}
