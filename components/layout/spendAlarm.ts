import type { SystemAnnouncement } from "@/types/feedback.types";
import { spendAlarmHref } from "@/features/admin/spend-alarms/spendAlarms";

/**
 * Spend alarms ride the existing super-admin delivery rail: a targeted
 * `users.system_announcements` row per super admin (their own "seen" state), written by aidream's
 * `billing.spend_alarm_raise`. `metadata.alarm === true` marks the row and `metadata.record_id`
 * names the ONE shared alarm record (`billing.spend_alarm`); every alarm opens that record's page.
 */
/**
 * How serious an alarm is, graded per kind by the writer (aidream `ALARM_KINDS`, the one table):
 * critical = money is going out wrongly right now; warning = something needs a decision;
 * info = a skip, or a check that ran.
 */
export type AlarmLevel = "critical" | "warning" | "info";
export const ALARM_LEVELS: readonly AlarmLevel[] = ["critical", "warning", "info"];

export type SpendAlarm = {
  id: string;
  /** The shared alarm record (billing.spend_alarm) this delivery row points at. */
  recordId: string | null;
  kind: string | null;
  /** Acknowledgement key. A repeat of the same alarm changes `count`, so it asks again. */
  ackKey: string;
  /** The legacy two-step severity older rows carry; `level` is the grade the panel shows. */
  severity: "error" | "warning";
  level: AlarmLevel;
  /** One line naming what to do about it; null on a row written before the writer graded kinds. */
  fix: string | null;
  title: string;
  detail: string;
  /** Always the record page (`/administration/billing/alarms/<id>`), or null with no record. */
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
  const recordId = typeof meta.record_id === "string" && meta.record_id ? meta.record_id : null;
  const severity = meta.severity === "error" ? "error" : "warning";
  const level: AlarmLevel = ALARM_LEVELS.find((l) => l === meta.level) ?? (severity === "error" ? "critical" : "warning");
  return {
    id: a.id,
    recordId,
    kind: typeof meta.kind === "string" ? meta.kind : null,
    ackKey: `${a.id}:${count}`,
    severity,
    level,
    fix: typeof meta.fix === "string" && meta.fix ? meta.fix : null,
    title: a.title,
    detail: a.message.split("\n\nOpen: ")[0].split("\n\nHappened ")[0],
    link: recordId ? spendAlarmHref(recordId) : null,
    count,
    lastAt: typeof meta.last_at === "string" ? meta.last_at : a.updated_at,
    subjectUserId:
      meta.subject_type === "account" && typeof meta.subject_id === "string" ? meta.subject_id : null,
  };
}

/** Critical first, then warning, then info; most recent first within a level. */
export function sortSpendAlarms(alarms: SpendAlarm[]): SpendAlarm[] {
  return [...alarms].sort((x, y) => {
    if (x.level !== y.level) return ALARM_LEVELS.indexOf(x.level) - ALARM_LEVELS.indexOf(y.level);
    return y.lastAt.localeCompare(x.lastAt);
  });
}

export function countByLevel(alarms: SpendAlarm[]): Record<AlarmLevel, number> {
  const out: Record<AlarmLevel, number> = { critical: 0, warning: 0, info: 0 };
  for (const a of alarms) out[a.level] += 1;
  return out;
}

/**
 * Rows written before the writer resolved names carry a raw user id in the title
 * and the detail. Show the person instead: swap the id (and its "Account " prefix)
 * for the name, and drop a title amount the detail already states.
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
  };
}

/** The platform's agent and test seats (mirrors `platform.agent_test_account_ids()`): alarms are for real people. */
export function isAgentSeat(person: { email: string | null; appMetadata: unknown }): boolean {
  const meta = asRecord(person.appMetadata);
  if (meta && meta.test_fixture !== undefined && meta.test_fixture !== null) return true;
  const email = (person.email ?? "").toLowerCase();
  return email === "admin@admin.com" || email === "test@test.com";
}

const CLOSED_KEY = "matrx:spendAlarmClosed";

/** Alarm keys closed for this browser session by this person; storage trouble reads as none. */
export function readClosedAlarms(userId: string): string[] {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(CLOSED_KEY) ?? "null") as { userId?: string; keys?: unknown } | null;
    return raw && raw.userId === userId && Array.isArray(raw.keys) ? raw.keys.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function writeClosedAlarms(userId: string, keys: string[]): void {
  try {
    window.sessionStorage.setItem(CLOSED_KEY, JSON.stringify({ userId, keys }));
  } catch {
    /* private mode / quota: the close still holds in memory for this page */
  }
}
