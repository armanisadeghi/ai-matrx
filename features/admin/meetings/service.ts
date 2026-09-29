// features/admin/meetings/service.ts
//
// Reads for the platform Meetings admin page (/administration/users/meetings).
// Every read here rides the ADMIN LANE: the browser client stamps
// `x-matrx-admin-lane: 1` on requests fired from /administration/**, and the
// two doors below refuse unless `public.is_platform_admin()` (identity AND an
// open lane). Called from any other page they answer 42501.
//
//   communication.meet_admin_usage(p_from, p_to)          -> jsonb {totals, by_org}
//   communication.meet_admin_meetings(p_query, p_org, ...) -> rows + total_count
//   platform.retention_policy                              -> platform_admin_read RLS

import { supabase } from "@/utils/supabase/client";
import { isJsonArray, isJsonObject, type JsonObject } from "@/types/json";
import type { Database } from "@/types/database.types";

// ── Usage ─────────────────────────────────────────────────────────────────────

export interface MeetUsageNumbers {
  meetings_held: number;
  meeting_minutes: number;
  unique_participants: number;
  guests: number;
  recordings: number;
  recording_bytes: number;
  transcript_segments: number;
  live_now: number;
}

export interface MeetUsageOrgRow extends MeetUsageNumbers {
  organization_id: string;
  organization_name: string | null;
}

export interface MeetUsageReport {
  from: string;
  to: string;
  totals: MeetUsageNumbers;
  byOrg: MeetUsageOrgRow[];
}

const NUMBER_KEYS: readonly (keyof MeetUsageNumbers)[] = [
  "meetings_held",
  "meeting_minutes",
  "unique_participants",
  "guests",
  "recordings",
  "recording_bytes",
  "transcript_segments",
  "live_now",
];

/** Postgres numerics arrive as numbers (bigint/numeric through jsonb). Anything else is a contract break. */
function readNumbers(source: JsonObject, where: string): MeetUsageNumbers {
  const out = {} as MeetUsageNumbers;
  for (const key of NUMBER_KEYS) {
    const value = source[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      throw new Error(`meet_admin_usage returned a non-number for ${where}.${key}`);
    }
    out[key] = parsed;
  }
  return out;
}

/** Validates the jsonb answer of `communication.meet_admin_usage` — Json is narrowed, never asserted. */
export function parseMeetUsage(data: unknown): MeetUsageReport {
  if (!isJsonObject(data)) throw new Error("meet_admin_usage returned no report object");
  const totals = data.totals;
  const byOrg = data.by_org;
  if (!isJsonObject(totals)) throw new Error("meet_admin_usage returned no totals");
  if (!isJsonArray(byOrg)) throw new Error("meet_admin_usage returned no per-organization rows");
  return {
    from: typeof data.from === "string" ? data.from : "",
    to: typeof data.to === "string" ? data.to : "",
    totals: readNumbers(totals, "totals"),
    byOrg: byOrg.map((row, index) => {
      if (!isJsonObject(row) || typeof row.organization_id !== "string") {
        throw new Error(`meet_admin_usage returned a malformed organization row at ${index}`);
      }
      return {
        organization_id: row.organization_id,
        organization_name: typeof row.organization_name === "string" ? row.organization_name : null,
        ...readNumbers(row, `by_org[${index}]`),
      };
    }),
  };
}

export async function fetchMeetUsage(from: Date, to: Date): Promise<MeetUsageReport> {
  const { data, error } = await supabase
    .schema("communication")
    .rpc("meet_admin_usage", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  return parseMeetUsage(data);
}

// ── History ───────────────────────────────────────────────────────────────────

export const MEETING_STATES = ["live", "ended", "scheduled", "cancelled", "archived"] as const;
export type MeetingState = (typeof MEETING_STATES)[number];

export function isMeetingState(value: unknown): value is MeetingState {
  return typeof value === "string" && (MEETING_STATES as readonly string[]).includes(value);
}

type GeneratedMeetingRow =
  Database["communication"]["Functions"]["meet_admin_meetings"]["Returns"][number];

/**
 * One history row. The generator marks every RETURNS TABLE column non-null; the
 * function returns NULL for a meeting never started (times, duration), a host
 * with no auth row, or an organization that is gone — so those are widened
 * here, at ingress, instead of trusted.
 */
export interface AdminMeetingRow {
  id: string;
  title: string;
  slug: string | null;
  kind: string | null;
  organization_id: string;
  organization_name: string | null;
  host_user_id: string | null;
  host_name: string | null;
  host_email: string | null;
  state: MeetingState;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  participants: number;
  recordings: number;
  ai_enabled: boolean;
}

function orNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export function toAdminMeetingRow(row: GeneratedMeetingRow): AdminMeetingRow {
  if (!isMeetingState(row.state)) throw new Error(`meet_admin_meetings returned an unknown state "${String(row.state)}"`);
  return {
    id: row.id,
    title: row.title,
    slug: orNull(row.slug),
    kind: orNull(row.kind),
    organization_id: row.organization_id,
    organization_name: orNull(row.organization_name),
    host_user_id: orNull(row.host_user_id),
    host_name: orNull(row.host_name),
    host_email: orNull(row.host_email),
    state: row.state,
    scheduled_for: orNull(row.scheduled_for),
    started_at: orNull(row.started_at),
    ended_at: orNull(row.ended_at),
    duration_minutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    participants: Number(row.participants ?? 0),
    recordings: Number(row.recordings ?? 0),
    ai_enabled: Boolean(row.ai_enabled),
  };
}

export interface MeetingSearch {
  query: string;
  organizationId: string | null;
  state: MeetingState | null;
  from: string | null;
  to: string | null;
}

export const HISTORY_PAGE_SIZE = 200;

export async function searchAdminMeetings(
  search: MeetingSearch,
  offset: number,
): Promise<{ rows: AdminMeetingRow[]; total: number }> {
  const args: Database["communication"]["Functions"]["meet_admin_meetings"]["Args"] = {
    p_limit: HISTORY_PAGE_SIZE,
    p_offset: offset,
  };
  if (search.query.trim()) args.p_query = search.query.trim();
  if (search.organizationId) args.p_org = search.organizationId;
  if (search.state) args.p_state = search.state;
  if (search.from) args.p_from = new Date(`${search.from}T00:00:00`).toISOString();
  if (search.to) args.p_to = new Date(`${search.to}T23:59:59.999`).toISOString();
  const { data, error } = await supabase.schema("communication").rpc("meet_admin_meetings", args);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { rows: rows.map(toAdminMeetingRow), total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

// ── Retention ─────────────────────────────────────────────────────────────────

export const MEET_RETENTION_TOKENS = [
  "meet_meeting",
  "meet_recording",
  "meet_transcript_segment",
  "meet_chat_message",
  "meet_note",
  "meet_participant",
  "meet_invitee",
] as const;

/** The custody selector of the Meet recording bytes policy (entity `file`). */
export const MEET_RECORDING_SOURCE_KIND = "meet_room_recording";

export type RetentionPolicyRow = Pick<
  Database["platform"]["Tables"]["retention_policy"]["Row"],
  | "id"
  | "scope"
  | "entity_token"
  | "trigger_kind"
  | "mode"
  | "retention_days"
  | "warn_days"
  | "legal_hold"
  | "enabled"
  | "label"
  | "description"
  | "basis"
  | "set_by"
  | "review_due"
  | "effective_from"
  | "custody_selector"
  | "updated_at"
>;

const RETENTION_COLUMNS =
  "id, scope, entity_token, trigger_kind, mode, retention_days, warn_days, legal_hold, enabled, label, description, basis, set_by, review_due, effective_from, custody_selector, updated_at";

/**
 * Every policy row that governs Meet data: entity rows for the meet tokens, the
 * file-custody row for Meet recording bytes, and the global floor that answers
 * for any token with no row of its own.
 */
export async function fetchMeetRetentionPolicies(): Promise<RetentionPolicyRow[]> {
  const [entityRows, fileRows, globalRows] = await Promise.all([
    supabase.schema("platform").from("retention_policy").select(RETENTION_COLUMNS).eq("scope", "entity").in("entity_token", [...MEET_RETENTION_TOKENS]),
    supabase.schema("platform").from("retention_policy").select(RETENTION_COLUMNS).eq("scope", "entity").eq("entity_token", "file").not("custody_selector", "is", null),
    supabase.schema("platform").from("retention_policy").select(RETENTION_COLUMNS).eq("scope", "global"),
  ]);
  for (const result of [entityRows, fileRows, globalRows]) {
    if (result.error) throw new Error(result.error.message);
  }
  const custody = (fileRows.data ?? []).filter((row) => {
    const selector = row.custody_selector;
    return isJsonObject(selector) && selector.source_kind === MEET_RECORDING_SOURCE_KIND;
  });
  return [...(entityRows.data ?? []), ...custody, ...(globalRows.data ?? [])];
}
