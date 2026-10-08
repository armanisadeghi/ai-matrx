// features/employee-performance-reviews/review-360/service.ts — lane HR-360 (2026-10-08)
//
// THE 360 REVIEW, ON PLATFORM PRIMITIVES. Nothing here is a second store or a second inbox:
//   · rows live in two Confidential typed tables (review-360.typed-table.ts);
//   · each respondent's half is a store assignment (custom.work_assign: assignee + due date +
//     access) — it lands in her work inbox and the store's reminder tick reminds her;
//   · the gather ("both are in → tell HR") is two store automations declared beside the tables
//     (ensureAppAutomations), run by the store's own change feed as the writer;
//   · settings are knobs (hr.performance/review_360_*), never constants.
// Every write goes through @ai-matrx/records, which refuses until the organization's copy is
// Confidential (FAIL CLOSED). Rows are found by id, never by scanning.

import type { RecordsClient } from "@ai-matrx/records/core";
import {
  confidentialGate,
  confidentialRequest,
  confidentialState,
  confidentialRefusal,
  ensureAppAutomations,
  ensureTypedTable,
  listAppRows,
  upsertAppRow,
  type AnyTypedTableDef,
  type ConfidentialRequest,
  type RowOf,
} from "@ai-matrx/records/typed-table";

import { supabase } from "@/utils/supabase/client";

import { review360, review360Track, TRACK_TITLE } from "../review-360.typed-table";

export type Review360Row = RowOf<typeof review360>;
export type TrackKind = "self" | "manager";

type Ok<T> = { ok: true; data: T };
type No = { ok: false; message: string };
export type R360<T> = Ok<T> | No;

const no = (message: string): No => ({ ok: false, message });

/** The host's server step (aidream `POST /typed-tables/confidential`). */
export type ConfidentialServerStep = (body: ConfidentialRequest) => Promise<void>;

// ── knobs ────────────────────────────────────────────────────────────────────────────────────

export interface Review360Knobs {
  daysToComplete: number;
  reminderLeadDays: number;
  /** The hour of the due day, UTC, a half is due (knob review_360_due_hour_utc). */
  dueHourUtc: number;
  meetingHour: number;
  meetingMinutes: number;
  meetingLobby: boolean;
  meetingJoinBeforeHost: boolean;
}

export const REVIEW_360_KNOB_KEYS = {
  daysToComplete: "review_360_days_to_complete",
  reminderLeadDays: "review_360_reminder_lead_days",
  dueHourUtc: "review_360_due_hour_utc",
  meetingHour: "review_360_meeting_hour",
  meetingMinutes: "review_360_meeting_minutes",
  meetingLobby: "review_360_meeting_lobby",
  meetingJoinBeforeHost: "review_360_meeting_join_before_host",
} as const;

export async function readReview360Knobs(organizationId: string, userId: string): Promise<R360<Review360Knobs>> {
  const read = (key: string) =>
    supabase.schema("platform").rpc("knob_resolve", {
      p_feature: "hr.performance",
      p_key: key,
      p_organization_id: organizationId,
      p_user_id: userId,
    });
  const entries = Object.entries(REVIEW_360_KNOB_KEYS) as Array<[keyof Review360Knobs, string]>;
  const answers = await Promise.all(entries.map(([, key]) => read(key)));
  const failure = answers.find((x) => x.error)?.error;
  if (failure) return no(`The 360 review settings could not be read: ${failure.message}`);
  const raw = (v: unknown) => (v && typeof v === "object" && "value" in (v as Record<string, unknown>) ? (v as { value: unknown }).value : v);
  const out: Partial<Record<keyof Review360Knobs, number | boolean>> = {};
  for (let i = 0; i < entries.length; i++) {
    const [name, key] = entries[i]!;
    const v = raw(answers[i]!.data);
    const want = name === "meetingLobby" || name === "meetingJoinBeforeHost" ? "boolean" : "number";
    const n = want === "number" && typeof v === "string" ? Number(v) : v;
    if (want === "boolean" ? typeof n !== "boolean" : typeof n !== "number" || !Number.isFinite(n)) {
      return no(`The 360 review setting ${key} answered no ${want}.`);
    }
    out[name] = n as number | boolean;
  }
  return { ok: true, data: out as unknown as Review360Knobs };
}

// ── provisioning: tables, assignment columns, automations, Confidential ────────────────────────

/** One typed table of the family: the organization's copy exists and is Confidential (fail closed). */
export async function provisionConfidentialTable(
  client: RecordsClient,
  def: AnyTypedTableDef,
  organizationId: string,
  serverStep: ConfidentialServerStep,
): Promise<R360<string>> {
  const made = await ensureTypedTable(client, def, { organizationId });
  if (!made.ok) return no(made.error.message);
  return ensureConfidential(client, def, organizationId, serverStep);
}

async function ensureConfidential(
  client: RecordsClient,
  def: AnyTypedTableDef,
  organizationId: string,
  serverStep: ConfidentialServerStep,
): Promise<R360<string>> {
  const state = await confidentialState(client, def, { organizationId });
  if (!state.ok) return no(state.error.message);
  if (confidentialRefusal(def, state.data) !== null) {
    try {
      await serverStep(confidentialRequest(def, organizationId));
    } catch (thrown) {
      return no(`${def.name} could not be made Confidential: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
    }
  }
  const gate = await confidentialGate(client, def, { organizationId });
  return gate.ok ? { ok: true, data: gate.data } : no(gate.error.message);
}

/** Make this organization ready: both tables, the Track's real assignment columns, the gather, Confidential. */
async function retireAutomations(
  client: RecordsClient,
  organizationId: string,
  plan: Array<[AnyTypedTableDef, string[]]>,
): Promise<R360<true>> {
  for (const [def, names] of plan) {
    const t = await ensureTypedTable(client, def, { organizationId });
    if (!t.ok) return no(t.error.message);
    const list = await client.automations({ table_id: t.data.table });
    if (!list.ok) return no(list.error.message);
    for (const a of list.data.automations) {
      if (!names.includes(a.name) || a.archived_at) continue;
      const done = await client.automationArchive({ automation_id: a.id });
      if (!done.ok) return no(done.error.message);
    }
  }
  return { ok: true, data: true };
}

export async function provisionReview360(
  client: RecordsClient,
  organizationId: string,
  serverStep: ConfidentialServerStep,
): Promise<R360<{ reviewTable: string; trackTable: string }>> {
  for (const def of [review360, review360Track]) {
    const made = await ensureTypedTable(client, def, { organizationId });
    if (!made.ok) return no(made.error.message);
  }
  const trackTable = await ensureTypedTable(client, review360Track, { organizationId });
  if (!trackTable.ok) return no(trackTable.error.message);
  const here = client.config.organizationId === organizationId ? client : null;
  if (!here) return no("The records client is bound to another organization.");
  const has = await here.workHasAssignment({ table_id: trackTable.data.table });
  if (!has.ok) return no(has.error.message);
  if (!has.data) {
    const took = await here.workTakeAssignment({ table_id: trackTable.data.table });
    if (!took.ok) return no(took.error.message);
  }

  const gather = await ensureAppAutomations(
    client,
    review360Track,
    [
      {
        name: "360: tell the respondent",
        trigger: { on: "property_edited", field: "link" },
        actions: [{ do: "notify", to: { field: "respondent_login" }, text: `${TRACK_TITLE}: {{link}}` }],
      },
      // THE HR NOTICE, per half: a respondent READS the review row and may not stamp it, so the
      // half is reported from the track itself; the review page works "both in" out from the tracks.
      {
        name: "360: a response is in",
        trigger: { on: "property_edited", field: "submitted_at" },
        condition: { op: "present", args: [{ field: "submitted_at" }] },
        actions: [{ do: "notify", to: { field: "hr_manager_login" }, text: "A 360 review response is in: {{review_link}}" }],
      },
    ],
    { organizationId },
  );
  if (!gather.ok) return no(gather.error.message);
  // The wave-1 gather wrote the review row as the respondent; respondents are viewers there now.
  const retired = await retireAutomations(client, organizationId, [
    [review360Track, ["360: self half is in", "360: manager half is in"]],
    [review360, ["360: both halves are in (self last)", "360: both halves are in (manager last)"]],
  ]);
  if (!retired.ok) return retired;

  const reviewTable = await ensureConfidential(client, review360, organizationId, serverStep);
  if (!reviewTable.ok) return reviewTable;
  const tracks = await ensureConfidential(client, review360Track, organizationId, serverStep);
  if (!tracks.ok) return tracks;
  return { ok: true, data: { reviewTable: reviewTable.data, trackTable: tracks.data } };
}

// ── start ────────────────────────────────────────────────────────────────────────────────────

export interface StartReview360Args {
  client: RecordsClient;
  organizationId: string;
  serverStep: ConfidentialServerStep;
  hrUserId: string;
  employee: { employeeId: string; name: string; userId: string | null };
  manager: { name: string | null; userId: string | null } | null;
  knobs: Review360Knobs;
  origin: string;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function respondHref(trackId: string, organizationId: string): string {
  return `/hr/performance/respond/${trackId}?org=${organizationId}`;
}

export async function startReview360(a: StartReview360Args): Promise<R360<{ reviewRef: string }>> {
  if (!a.employee.userId) return no(`${a.employee.name} has no login in this organization, so they cannot complete a self review.`);
  if (!a.manager) return no(`${a.employee.name} has no manager on their HR record.`);
  if (!a.manager.userId) return no(`${a.manager.name ?? "Their manager"} has no login in this organization.`);
  const ready = await provisionReview360(a.client, a.organizationId, a.serverStep);
  if (!ready.ok) return ready;

  const person = async (userId: string): Promise<R360<string>> => {
    const p = await a.client.workPerson({ user_id: userId, create: true });
    if (!p.ok) return no(p.error.message);
    return p.data ? { ok: true, data: p.data } : no("That person has no place in this organization.");
  };
  const [emp, mgr, hr] = await Promise.all([person(a.employee.userId), person(a.manager.userId), person(a.hrUserId)]);
  for (const p of [emp, mgr, hr]) if (!p.ok) return p;
  const ids = { emp: (emp as Ok<string>).data, mgr: (mgr as Ok<string>).data, hr: (hr as Ok<string>).data };

  const reviewRef = crypto.randomUUID();
  const dueOn = addDays(a.knobs.daysToComplete);
  const opts = { organizationId: a.organizationId };
  const review = await upsertAppRow(
    a.client,
    review360,
    {
      review_ref: reviewRef,
      employee: { token: "hr_employee", id: a.employee.employeeId } as never,
      employee_name: a.employee.name,
      status: "collecting",
      due_on: dueOn,
      employee_user: ids.emp,
      manager_user: ids.mgr,
      hr_manager: ids.hr,
      hr_manager_login: a.hrUserId,
    },
    opts,
  );
  if (!review.ok) return no(review.error.message);

  const halves: Array<{ kind: TrackKind; respondent: string; respondentUser: string; counterpart: string }> = [
    { kind: "self", respondent: ids.emp, respondentUser: a.employee.userId, counterpart: ids.mgr },
    { kind: "manager", respondent: ids.mgr, respondentUser: a.manager.userId, counterpart: ids.emp },
  ];
  const trackIds: Partial<Record<TrackKind, string>> = {};
  for (const h of halves) {
    const made = await upsertAppRow(
      a.client,
      review360Track,
      {
        title: TRACK_TITLE,
        review_ref: reviewRef,
        track: h.kind,
        respondent: h.respondent,
        hr_manager: ids.hr,
        counterpart: h.counterpart,
        respondent_login: h.respondentUser,
        hr_manager_login: a.hrUserId,
        review_link: `${a.origin}/hr/performance/${review.data}?org=${a.organizationId}`,
        shared: false,
      },
      opts,
    );
    if (!made.ok) return no(made.error.message);
    trackIds[h.kind] = made.data;
    const assigned = await a.client.workAssign({ record_id: made.data, user_id: h.respondentUser, dueDate: `${dueOn}T${String(a.knobs.dueHourUtc).padStart(2, "0")}:00:00.000Z` });
    if (!assigned.ok) return no(assigned.error.message);
    const linked = await a.client.recordUpdate({
      record_id: made.data,
      patch: { link: `${a.origin}${respondHref(made.data, a.organizationId)}` },
    });
    if (!linked.ok) return no(linked.error.message);
  }
  const stamped = await a.client.recordUpdate({
    record_id: review.data,
    patch: { self_track: trackIds.self, manager_track: trackIds.manager },
  });
  if (!stamped.ok) return no(stamped.error.message);
  return { ok: true, data: { reviewRef } };
}

// ── reading and writing a track ──────────────────────────────────────────────────────────────

const unwrap = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>) ? (v as { value: unknown }).value : v;

export interface TrackView {
  id: string;
  kind: TrackKind | null;
  reviewRef: string | null;
  document: string | null;
  submittedAt: string | null;
  dueOn: string | null;
  shared: boolean;
}

export async function readTrack(client: RecordsClient, trackId: string): Promise<R360<TrackView>> {
  const read = await client.recordRead({ record_id: trackId });
  if (!read.ok) return no(read.error.message);
  const d = read.data.document as Record<string, unknown>;
  const s = (k: string) => {
    const v = unwrap(d[k]);
    return typeof v === "string" && v ? v : null;
  };
  const kind = s("track");
  return {
    ok: true,
    data: {
      id: trackId,
      kind: kind === "self" || kind === "manager" ? kind : null,
      reviewRef: s("review_ref"),
      document: s("document"),
      submittedAt: s("submitted_at"),
      dueOn: s("due_date")?.slice(0, 10) ?? null,
      shared: unwrap(d.shared) === true,
    },
  };
}

/** Save (and optionally submit) the respondent's own half — gated on the copy being Confidential. */
/** The one sentence a write to a submitted half is refused with (the store refuses it too). */
export const SUBMITTED_REFUSAL = "This review was submitted and can no longer be changed.";

export async function saveTrack(
  client: RecordsClient,
  organizationId: string,
  trackId: string,
  document: string,
  submit: boolean,
): Promise<R360<true>> {
  const gate = await confidentialGate(client, review360Track, { organizationId });
  if (!gate.ok) return no(gate.error.message);
  const now = await readTrack(client, trackId);
  if (!now.ok) return now;
  if (now.data.submittedAt) return no(SUBMITTED_REFUSAL);
  const patch: Record<string, unknown> = { document };
  if (submit) patch.submitted_at = new Date().toISOString();
  const res = await client.recordUpdate({ record_id: trackId, patch });
  return res.ok ? { ok: true, data: true } : no(res.error.message);
}

// ── the HR manager's side ────────────────────────────────────────────────────────────────────

export async function listReviews360(client: RecordsClient, organizationId: string): Promise<R360<Review360Row[]>> {
  const rows = await listAppRows(client, review360, { organizationId });
  return rows.ok ? { ok: true, data: rows.data.rows } : no(rows.error.message);
}

export async function readReview360(
  client: RecordsClient,
  reviewId: string,
): Promise<R360<{ doc: Record<string, unknown>; self: TrackView | null; manager: TrackView | null }>> {
  const read = await client.recordRead({ record_id: reviewId });
  if (!read.ok) return no(read.error.message);
  const doc = Object.fromEntries(Object.entries(read.data.document as Record<string, unknown>).map(([k, v]) => [k, unwrap(v)]));
  const one = async (id: unknown) => {
    if (typeof id !== "string" || !id) return null;
    const t = await readTrack(client, id);
    // A non-reader gets the store's header ({id, exists, submitted_at = when the ROW was made}),
    // never the row: no `track` means "not yours to read", never "submitted".
    return t.ok && t.data.kind ? t.data : null;
  };
  return { ok: true, data: { doc, self: await one(doc.self_track), manager: await one(doc.manager_track) } };
}

/** HR shares both halves: each track's `shared` turns on, which opens it to the counterpart. */
export async function shareReview360(
  client: RecordsClient,
  reviewId: string,
  trackIds: string[],
): Promise<R360<true>> {
  for (const id of trackIds) {
    const res = await client.recordUpdate({ record_id: id, patch: { shared: true } });
    if (!res.ok) return no(res.error.message);
  }
  const res = await client.recordUpdate({ record_id: reviewId, patch: { status: "shared", shared_at: new Date().toISOString() } });
  return res.ok ? { ok: true, data: true } : no(res.error.message);
}
