// features/admin/spend-alarms/spendAlarms.ts
//
// THE spend alarm record (Arman, 2026-10-10): every alarm is ONE durable row in
// `billing.spend_alarm` (one per kind + subject, shared by every super admin), with an
// occurrence row per write in `billing.spend_alarm_occurrence`. aidream's
// `services/billing/spend_alarm.py` is the only writer (through `billing.spend_alarm_raise`);
// the panel, the list and the record page all open `/administration/billing/alarms/<id>`.
//
// `refs` carries the blocked thing's own ids. `refLinks` turns each into the exact record's
// door, `alarmActions` decides which actions apply. Both are pure so the guard tests can
// prove every kind opens something real.

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { adminScheduleHref } from "@/features/scheduling/constants/routes";

export type AlarmLevel = "critical" | "warning" | "info";
export type AlarmStatus = "open" | "snoozed" | "resolved";

export const SPEND_ALARMS_PATH = "/administration/billing/alarms";
export const spendAlarmHref = (id: string) => `${SPEND_ALARMS_PATH}/${id}`;

/** Every ref key the writer may send (aidream `REF_KEYS`). */
export type AlarmRefs = Partial<
  Record<
    | "task_id"
    | "run_id"
    | "trigger_id"
    | "workflow_run_id"
    | "execution_id"
    | "agent_id"
    | "mandate_key"
    | "user_id"
    | "organization_id"
    | "approval_id"
    | "source_kind"
    | "source_id"
    | "document_id"
    | "file_id"
    | "batch_id"
    | "handler"
    | "driver"
    | "actor"
    | "sms_message_id"
    | "provider"
    | "operation"
    | "knob"
    | "conversation_id"
    | "request_id"
    | "scope"
    | "window"
    | "subject_kind"
    | "subject_ref",
    string
  >
>;

export interface SpendAlarmRecord {
  id: string;
  kind: string;
  level: AlarmLevel;
  title: string;
  detail: string;
  rule: string | null;
  fix: string | null;
  subject_type: string;
  subject_id: string;
  subject_name: string | null;
  refs: AlarmRefs;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  cost_usd: number | null;
  cost_avoided_usd: number | null;
  status: AlarmStatus;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  reopened_count: number;
}

export interface SpendAlarmOccurrence {
  id: string;
  occurred_at: string;
  repeat_count: number;
  run_id: string | null;
  execution_id: string | null;
  refs: AlarmRefs;
  detail: string | null;
  cost_usd: number | null;
}

const RECORD_COLUMNS =
  "id, kind, level, title, detail, rule, fix, subject_type, subject_id, subject_name, refs, occurrence_count, first_seen_at, last_seen_at, cost_usd, cost_avoided_usd, status, snoozed_until, resolved_at, resolved_by, resolution_note, reopened_count";

function asRefs(value: unknown): AlarmRefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out as AlarmRefs;
}

function toRecord(row: Record<string, unknown>): SpendAlarmRecord {
  return {
    ...(row as unknown as SpendAlarmRecord),
    refs: asRefs(row.refs),
    cost_usd: row.cost_usd == null ? null : Number(row.cost_usd),
    cost_avoided_usd: row.cost_avoided_usd == null ? null : Number(row.cost_avoided_usd),
  };
}

function billing() {
  // billing.spend_alarm* are read through the platform-admin lane (RLS platform_admin_read).
  return supabase.schema("billing");
}

export async function fetchSpendAlarm(id: string): Promise<SpendAlarmRecord | null> {
  const { data, error } = await billing().from("spend_alarm").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw pgErrorToError(error);
  return data ? toRecord(data as Record<string, unknown>) : null;
}

export async function fetchSpendAlarms(): Promise<SpendAlarmRecord[]> {
  const { data, error } = await billing()
    .from("spend_alarm")
    .select(RECORD_COLUMNS)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(1000);
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => toRecord(r as Record<string, unknown>));
}

/** Status of the records behind the panel's alarms: resolved and snoozed ones stay quiet. */
export async function fetchSpendAlarmStatuses(
  ids: string[],
): Promise<Map<string, Pick<SpendAlarmRecord, "status" | "snoozed_until">>> {
  const out = new Map<string, Pick<SpendAlarmRecord, "status" | "snoozed_until">>();
  if (ids.length === 0) return out;
  const { data, error } = await billing().from("spend_alarm").select("id, status, snoozed_until").in("id", ids);
  if (error) throw pgErrorToError(error);
  for (const r of data ?? []) {
    const row = r as { id: string; status: AlarmStatus; snoozed_until: string | null };
    out.set(row.id, { status: row.status, snoozed_until: row.snoozed_until });
  }
  return out;
}

export async function fetchSpendAlarmOccurrences(alarmId: string): Promise<SpendAlarmOccurrence[]> {
  const { data, error } = await billing()
    .from("spend_alarm_occurrence")
    .select("id, occurred_at, repeat_count, run_id, execution_id, refs, detail, cost_usd")
    .eq("alarm_id", alarmId)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...(row as unknown as SpendAlarmOccurrence),
      refs: asRefs(row.refs),
      cost_usd: row.cost_usd == null ? null : Number(row.cost_usd),
    };
  });
}

/** Resolve (for everyone; it reopens if it happens again), snooze, or reopen. */
export async function setSpendAlarmStatus(
  id: string,
  status: AlarmStatus,
  options: { note?: string; snoozeHours?: number } = {},
): Promise<void> {
  const { error } = await billing().rpc("spend_alarm_set_status", {
    p_id: id,
    p_status: status,
    p_note: options.note || undefined,
    p_snooze_hours: options.snoozeHours ?? 24,
  });
  if (error) throw pgErrorToError(error);
}

/** Whether a record should ring now: open, or snoozed past its time. */
export function isRinging(r: Pick<SpendAlarmRecord, "status" | "snoozed_until">, now: number = Date.now()): boolean {
  if (r.status === "open") return true;
  if (r.status === "snoozed") return !r.snoozed_until || Date.parse(r.snoozed_until) <= now;
  return false;
}

// ── Doors: each ref opens the exact record ─────────────────────────────────

export interface RefLink {
  key: keyof AlarmRefs;
  label: string;
  value: string;
  /** The exact record's page; null only for ids with no page anywhere (they stay copyable). */
  href: string | null;
  /** Registry token for an EntityRef, when one fits. */
  token?: string;
}

const SOURCE_KIND_HREF: Record<string, (id: string) => string> = {
  note: (id) => `/notes/${id}`,
  cx_message: (id) => `/chat/${id}`,
};

const REF_LABEL: Record<keyof AlarmRefs, string> = {
  task_id: "Scheduled task",
  run_id: "Run",
  trigger_id: "Workflow trigger",
  workflow_run_id: "Workflow run",
  execution_id: "Execution",
  agent_id: "Agent",
  mandate_key: "Mandate",
  user_id: "Account",
  organization_id: "Organization",
  approval_id: "Spend approval",
  source_kind: "Source kind",
  source_id: "Source",
  document_id: "Document",
  file_id: "File",
  batch_id: "Batch",
  handler: "Handler",
  driver: "Started by",
  actor: "Actor",
  sms_message_id: "SMS",
  provider: "Provider",
  operation: "Operation",
  knob: "Price knob",
  conversation_id: "Conversation",
  request_id: "Request",
  scope: "Scope",
  window: "Window",
  subject_kind: "Subject kind",
  subject_ref: "Subject",
};

/** The page each ref opens. Values are the blocked thing's own ids. */
export function refHref(key: keyof AlarmRefs, value: string, refs: AlarmRefs = {}): string | null {
  switch (key) {
    case "task_id":
      return adminScheduleHref(value);
    case "run_id":
      // A scheduled run has no page of its own: its task's page lists its runs live.
      return refs.task_id ? adminScheduleHref(refs.task_id) : null;
    case "workflow_run_id":
      return `/workflows/runs/${value}`;
    case "execution_id":
      return `/administration/usage?def=ai_usage_executions&f.execution=${encodeURIComponent(value)}`;
    case "agent_id":
      return `/administration/agents/system-agents/agents/${value}/build`;
    case "mandate_key":
      return `/administration/intelligence/mandates/${encodeURIComponent(value)}`;
    case "user_id":
      return `/administration/users/usage?user=${encodeURIComponent(value)}`;
    case "organization_id":
      return `/administration/scopes-context/organizations/${value}`;
    case "approval_id":
      return `/administration/billing/approvals?id=${encodeURIComponent(value)}`;
    case "source_id": {
      const build = refs.source_kind ? SOURCE_KIND_HREF[refs.source_kind] : undefined;
      return build ? build(value) : null;
    }
    case "conversation_id":
      return `/chat/${value}`;
    default:
      return null;
  }
}

/** Ordered: the blocked thing first, then who and where, then the carriers. */
const REF_ORDER: (keyof AlarmRefs)[] = [
  "task_id",
  "run_id",
  "trigger_id",
  "workflow_run_id",
  "execution_id",
  "approval_id",
  "agent_id",
  "mandate_key",
  "source_id",
  "source_kind",
  "document_id",
  "file_id",
  "batch_id",
  "handler",
  "driver",
  "actor",
  "user_id",
  "organization_id",
  "sms_message_id",
  "provider",
  "operation",
  "knob",
  "conversation_id",
  "request_id",
  "scope",
  "window",
  "subject_kind",
  "subject_ref",
];

export function refLinks(refs: AlarmRefs): RefLink[] {
  const out: RefLink[] = [];
  for (const key of REF_ORDER) {
    const value = refs[key];
    if (!value) continue;
    out.push({ key, label: REF_LABEL[key], value, href: refHref(key, value, refs) });
  }
  return out;
}

// ── Actions: shown only when they apply ─────────────────────────────────────

export type AlarmActionId =
  | "run_now"
  | "pause"
  | "resume"
  | "approve"
  | "reject"
  | "open_agent"
  | "open_mandate"
  | "open_source";

export interface AlarmActionContext {
  /** The scheduled task's live state, when the record names one (null = unreadable/missing). */
  task?: { enabled: boolean } | null;
  /** The spend approval's live status, when the record names one. */
  approvalStatus?: string | null;
}

export function alarmActions(record: Pick<SpendAlarmRecord, "refs">, ctx: AlarmActionContext = {}): AlarmActionId[] {
  const r = record.refs;
  const out: AlarmActionId[] = [];
  if (r.task_id && ctx.task) {
    out.push("run_now");
    out.push(ctx.task.enabled ? "pause" : "resume");
  }
  if (r.approval_id) {
    if (ctx.approvalStatus !== "approved") out.push("approve");
    if (ctx.approvalStatus !== "rejected") out.push("reject");
  }
  if (r.agent_id) out.push("open_agent");
  if (r.mandate_key) out.push("open_mandate");
  if (r.source_id && refHref("source_id", r.source_id, r)) out.push("open_source");
  return out;
}

export async function fetchTaskState(taskId: string): Promise<{ enabled: boolean; title: string; user_id: string } | null> {
  const { data, error } = await supabase
    .schema("scheduler")
    .from("sch_task")
    .select("enabled, title, user_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw pgErrorToError(error);
  return (data as { enabled: boolean; title: string; user_id: string } | null) ?? null;
}

// ── Copy for AI: everything an agent needs to investigate ──────────────────

export function alarmAgentData(record: SpendAlarmRecord, occurrences: SpendAlarmOccurrence[] = [], origin = "") {
  return {
    alarm: {
      id: record.id,
      page: `${origin}${spendAlarmHref(record.id)}`,
      kind: record.kind,
      level: record.level,
      status: record.status,
      snoozed_until: record.snoozed_until,
      title: record.title,
      what_happened: record.detail,
      rule: record.rule,
      fix: record.fix,
      subject: { type: record.subject_type, id: record.subject_id, name: record.subject_name },
      count: record.occurrence_count,
      first_seen_at: record.first_seen_at,
      last_seen_at: record.last_seen_at,
      cost_usd: record.cost_usd,
      cost_avoided_usd: record.cost_avoided_usd,
      resolved: record.resolved_at ? { at: record.resolved_at, by: record.resolved_by, note: record.resolution_note } : null,
    },
    blocked: refLinks(record.refs).map((l) => ({ what: l.label, id: l.value, link: l.href ? `${origin}${l.href}` : null })),
    occurrences: occurrences.map((o) => ({
      at: o.occurred_at,
      repeats: o.repeat_count,
      run_id: o.run_id,
      execution_id: o.execution_id,
      refs: o.refs,
      links: refLinks(o.refs)
        .filter((l) => l.href)
        .map((l) => ({ what: l.label, id: l.value, link: `${origin}${l.href}` })),
      cost_usd: o.cost_usd,
    })),
  };
}
