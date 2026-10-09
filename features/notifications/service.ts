/**
 * features/notifications/service.ts — the Inbox's reads and writes.
 *
 * THE HOME OF EVERY NOTICE IS `communication.notification`. Reads/writes go
 * React → Supabase directly (CLAUDE.md § Data flow), through signed-in doors that
 * resolve `auth.uid()` inside their bodies.
 *
 * TWO GENERATIONS OF DOOR, ONE READER.
 *   triage (migration `notifications_inbox_triage.sql`):
 *     inbox_notifications(p_state, p_limit, p_before, p_before_id, p_unread_only, p_org_id)
 *     my_inbox_summary() · mark_inbox_seen() · set_notifications_state(ids, action, until)
 *     my_inbox_organizations()
 *   pre-triage (2026-09-19): my_notifications · my_notification_unread_count ·
 *     mark_my_notifications_read · mark_notification_read
 *
 * The triage doors are applied on the nightly clone and wait for the owner before
 * they reach the main database. Until they do, every read here falls back to the
 * pre-triage door and SAYS SO (`triage: false` on the answer): the UI then offers
 * no Done, no Snooze and no Done/Snoozed tabs — an absent control, never one that
 * pretends (Law 4). The fallback fires only on "no such function" (PGRST202 /
 * 42883); any other error is an error. A door with a working fallback is called
 * through `allowAbsentDoor`, so its absence is not filed in the Error Inspector
 * as a failure on every page load; the stand-in announces itself once per page
 * in the console with its remedy instead.
 *
 * None of these doors is in `types/database.types.ts` yet (it regenerates from the
 * main database), so the calls use the house `as never` seam and every answer is
 * checked at the boundary.
 */

import { TRIAGE_DOORS_LIVE } from "./triage-live";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { allowAbsentDoor, isAbsentDoorFailure } from "@/lib/diagnostics/supabaseErrorCapture";
import { bucketFor, isNoticeBucket } from "./presentation";
import type {
  InboxNotification,
  InboxState,
  InboxSummary,
  TriageAction,
} from "./types";

const IN_APP_CHANNEL = "in_app";

function communication() {
  return createClient().schema("communication");
}

/** What an RPC not yet in the generated types answers with — asserted below. */
type UntypedRpcResult = { data: unknown; error: PostgrestError | null };

/**
 * `fallsBack`: this caller answers with the pre-triage door when the door is
 * absent, so an absent door is not an incident (every other error still is).
 */
async function rpc(
  name: string,
  args: Record<string, unknown>,
  options: { fallsBack?: boolean } = {},
): Promise<UntypedRpcResult> {
  // A door already proven absent this session is not asked again: one probe,
  // not a 404 on every page and every poll.
  if (options.fallsBack && triageDoorKnownAbsent()) {
    if (!TRIAGE_DOORS_LIVE) announceStandIn();
    return { data: null, error: { code: "PGRST202", message: `communication.${name} is absent`, details: "", hint: "", name: "PostgrestError" } as PostgrestError };
  }
  const call = communication().rpc(name as never, args as never);
  const answered = (await (options.fallsBack ? allowAbsentDoor(call) : call)) as UntypedRpcResult;
  if (options.fallsBack && isMissingDoor(answered.error)) {
    rememberTriageDoorAbsent();
    announceStandIn();
  }
  return answered;
}

const ABSENT_KEY = "notifications.triageDoorAbsentAt";
const ABSENT_TTL_MS = 10 * 60 * 1000;
let absentAt = 0;
function triageDoorKnownAbsent(): boolean {
  if (!TRIAGE_DOORS_LIVE) return true; // the doors are a held draft: never ask live for them
  if (absentAt && Date.now() - absentAt < ABSENT_TTL_MS) return true;
  try {
    const stored = Number(globalThis.sessionStorage?.getItem(ABSENT_KEY) ?? 0);
    if (stored && Date.now() - stored < ABSENT_TTL_MS) {
      absentAt = stored;
      return true;
    }
  } catch {
    /* storage unavailable: probe again */
  }
  return false;
}
/** Forget what was learned about the triage doors (a test, or a migration just applied). */
export function forgetTriageDoorAbsence(): void {
  absentAt = 0;
  try {
    globalThis.sessionStorage?.removeItem(ABSENT_KEY);
  } catch {
    /* nothing kept */
  }
}
function rememberTriageDoorAbsent(): void {
  absentAt = Date.now();
  try {
    globalThis.sessionStorage?.setItem(ABSENT_KEY, String(absentAt));
  } catch {
    /* storage unavailable: module flag still holds */
  }
}

let standInAnnounced = false;
function announceStandIn(): void {
  if (standInAnnounced) return;
  standInAnnounced = true;
  console.warn(
    "[notifications] The inbox triage doors are not on this database; the inbox runs on the " +
      "pre-triage doors (no Done, Snooze or organization filter). Remedy: apply " +
      "migrations/notifications_inbox_triage.sql to the main database.",
  );
}

/** The door is not on this database (yet) — the only error that may fall back. */
export function isMissingDoor(error: PostgrestError | null): boolean {
  return isAbsentDoorFailure(error);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Narrow one door row; either generation. Throws when the contract is broken. */
function toNotification(value: unknown): InboxNotification {
  if (typeof value !== "object" || value === null) {
    throw new Error("a notice row was not an object");
  }
  const row = value as Record<string, unknown>;
  const id = str(row.id);
  const eventKey = str(row.event_key);
  const createdAt = str(row.created_at);
  if (!id || !eventKey || !createdAt) {
    throw new Error(
      "a notice row came back without id/event_key/created_at — the door's RETURNS TABLE and features/notifications/types.ts disagree.",
    );
  }
  return {
    id,
    event_key: eventKey,
    event_label: str(row.event_label),
    bucket: isNoticeBucket(row.event_bucket) ? row.event_bucket : bucketFor(eventKey),
    subject: str(row.subject),
    body: str(row.body),
    deep_link: str(row.deep_link),
    target_kind: str(row.target_kind),
    target_id: str(row.target_id),
    organization_id: str(row.organization_id),
    organization_name: str(row.organization_name),
    actor_id: str(row.actor_id),
    actor_name: str(row.actor_name),
    actor_avatar: str(row.actor_avatar),
    created_at: createdAt,
    sort_at: str(row.sort_at) ?? createdAt,
    seen_at: str(row.seen_at),
    read_at: str(row.read_at),
    done_at: str(row.done_at),
    snoozed_until: str(row.snoozed_until),
    acted_at: str(row.acted_at),
    outcome: str(row.outcome),
  };
}

function toRows(data: unknown, door: string): InboxNotification[] {
  if (!Array.isArray(data)) {
    throw new Error(`communication.${door} returned ${typeof data}; expected rows.`);
  }
  return data.map(toNotification);
}

export interface FetchInboxArgs {
  state?: InboxState;
  limit?: number;
  /** Keyset cursor — rows before (sort time, id). */
  before?: string | null;
  beforeId?: string | null;
  unreadOnly?: boolean;
  /** The page's organization filter — null is All organizations. Never the active org. */
  orgId?: string | null;
}

export interface InboxPage {
  rows: InboxNotification[];
  /** False when the triage doors are not on this database: Done/Snooze are absent. */
  triage: boolean;
}

/** The recipient's in-app notices for one view, newest first. */
export async function fetchInbox(args: FetchInboxArgs = {}): Promise<InboxPage> {
  const state = args.state ?? "inbox";
  const limit = args.limit ?? 50;
  const { data, error } = await rpc("inbox_notifications", {
    p_state: state,
    p_limit: limit,
    p_before: args.before ?? null,
    p_before_id: args.beforeId ?? null,
    p_unread_only: args.unreadOnly ?? false,
    p_org_id: args.orgId ?? null,
  }, { fallsBack: true });
  if (!error) {
    try {
      return { rows: toRows(data, "inbox_notifications"), triage: true };
    } catch (cause) {
      throw operationFailed("load your notifications", cause);
    }
  }
  if (!isMissingDoor(error)) throw operationFailed("load your notifications", error);

  // PRE-TRIAGE DOOR. It has no Done or Snoozed rows to give and no organization
  // filter, so those views answer empty-and-unavailable, never a wrong list.
  if (state !== "inbox") return { rows: [], triage: false };
  const legacy = await rpc("my_notifications", {
    p_limit: limit,
    p_before: args.before ?? null,
    p_unread_only: args.unreadOnly ?? false,
  });
  if (legacy.error) throw operationFailed("load your notifications", legacy.error);
  try {
    const rows = toRows(legacy.data, "my_notifications");
    return {
      rows: args.orgId ? rows.filter((row) => row.organization_id === args.orgId) : rows,
      triage: false,
    };
  } catch (cause) {
    throw operationFailed("load your notifications", cause);
  }
}

export interface SummaryAnswer {
  summary: InboxSummary;
  triage: boolean;
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The badge (unseen needs-you + for-you), the updates dot, and the tab counts. */
export async function fetchInboxSummary(): Promise<SummaryAnswer> {
  const { data, error } = await rpc("my_inbox_summary", {}, { fallsBack: true });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    if (typeof row !== "object" || row === null) {
      throw operationFailed(
        "count your notifications",
        new Error("communication.my_inbox_summary returned no row."),
      );
    }
    const r = row as Record<string, unknown>;
    return {
      triage: true,
      summary: {
        unseenNeedsYou: int(r.unseen_needs_you),
        unseenDirect: int(r.unseen_direct),
        unseenUpdates: int(r.unseen_updates),
        unread: int(r.unread),
        inbox: int(r.inbox),
        snoozed: int(r.snoozed),
        done: int(r.done),
      },
    };
  }
  if (!isMissingDoor(error)) throw operationFailed("count your notifications", error);

  // PRE-TRIAGE: there is no "seen", so the badge counts unread notices. Honest
  // about what it is, and it still clears when they are read.
  const legacy = await rpc("my_notification_unread_count", {});
  if (legacy.error) throw operationFailed("count your notifications", legacy.error);
  const unread = int(legacy.data);
  return {
    triage: false,
    summary: {
      unseenNeedsYou: 0,
      unseenDirect: unread,
      unseenUpdates: 0,
      unread,
      inbox: unread,
      snoozed: 0,
      done: 0,
    },
  };
}

/** Opening the bell or the inbox: everything shown leaves the badge. */
export async function markInboxSeen(): Promise<number> {
  const { data, error } = await rpc("mark_inbox_seen", {}, { fallsBack: true });
  if (error) {
    if (isMissingDoor(error)) return 0;
    throw operationFailed("clear the notification badge", error);
  }
  return int(data);
}

/** Done / undone / read / unread / snooze / unsnooze for up to 500 notices. */
export async function setNoticesState(
  ids: readonly string[],
  action: TriageAction,
  until?: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await rpc("set_notifications_state", {
    p_ids: ids,
    p_action: action,
    p_until: until ? until.toISOString() : null,
  }, { fallsBack: action === "read" });
  if (!error) return int(data);
  if (isMissingDoor(error) && action === "read") {
    // Read is the one triage action the pre-triage doors can do.
    let changed = 0;
    for (const id of ids) {
      if (await markNotificationRead(id)) changed += 1;
    }
    return changed;
  }
  throw operationFailed(
    action === "done"
      ? "mark it done"
      : action === "snooze"
        ? "snooze it"
        : `mark it ${action}`,
    error,
  );
}

export interface InboxOrganization {
  id: string;
  name: string;
  notices: number;
}

/** The organizations the person's notices come from — the filter's choices. */
export async function fetchInboxOrganizations(): Promise<InboxOrganization[] | null> {
  const { data, error } = await rpc("my_inbox_organizations", {}, { fallsBack: true });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw operationFailed("list your notices' organizations", error);
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((value) => {
    const row = value as Record<string, unknown>;
    const id = str(row.organization_id);
    if (!id) return [];
    return [{ id, name: str(row.organization_name) ?? "Organization", notices: int(row.notices) }];
  });
}

/**
 * WHAT WAITS ON THIS PERSON IN THE RECORD STORE, per organization — `custom.inbox_counts`, the
 * SAME predicate the inbox screen (`custom.work_inbox`) lists with and the reminder tick reminds
 * from (lane S5-PRIME-2). Every organization the person belongs to. An organization with nothing
 * is not listed.
 */
export interface WorkWaiting {
  organization_id: string;
  organization_name: string | null;
  waiting: number;
  snoozed: number;
  overdue: number;
}

function isWorkWaiting(value: unknown): value is WorkWaiting {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.organization_id === "string" && typeof row.waiting === "number";
}

export async function fetchMyWorkWaiting(): Promise<WorkWaiting[]> {
  // `custom` is the record store's schema, reached by its doors only and absent from the generated
  // `Database` type (the same untyped-door shape as the calls above; the answer is checked below).
  const { data, error } = (await createClient()
    .schema("custom" as never)
    .rpc("inbox_counts" as never, {} as never)) as UntypedRpcResult;
  if (error) throw operationFailed("count what is waiting on you", error);
  if (!Array.isArray(data) || !data.every(isWorkWaiting)) {
    throw operationFailed(
      "count what is waiting on you",
      new Error("custom.inbox_counts did not answer one row per organization."),
    );
  }
  return data;
}

/** Stamp one notice read (pre-triage door). Returns whether a row changed. */
export async function markNotificationRead(id: string): Promise<boolean> {
  const { data, error } = await communication().rpc("mark_notification_read", {
    p_notification_id: id,
    p_channel: IN_APP_CHANNEL,
  });
  if (error) throw operationFailed("mark the notification read", error);
  return data === true;
}

/** Stamp every unread in-app notice read. Returns how many rows changed. */
export async function markAllMyNotificationsRead(): Promise<number> {
  const { data, error } = await rpc("mark_my_notifications_read", {});
  if (error) throw operationFailed("mark your notifications read", error);
  return int(data);
}

/** One kind of notice in the Inbox, with its count (`communication.my_inbox_kinds`). */
export interface InboxKind {
  eventKey: string;
  label: string | null;
  bucket: string;
  notices: number;
  unseen: number;
}

/** Every kind in the person's Inbox (not Done, not snoozed), newest kind first. */
export async function fetchInboxKinds(): Promise<InboxKind[]> {
  const { data, error } = await rpc("my_inbox_kinds", {});
  if (error) throw operationFailed("group your notifications", error);
  if (!Array.isArray(data)) return [];
  return data.flatMap((value) => {
    const row = value as Record<string, unknown>;
    const eventKey = str(row.event_key);
    if (!eventKey) return [];
    return [{
      eventKey,
      label: str(row.event_label),
      bucket: str(row.event_bucket) ?? "direct",
      notices: int(row.notices),
      unseen: int(row.unseen),
    }];
  });
}

/** What a whole-inbox clear may do. Undo goes back through `setNoticesState` with the ids. */
export type ClearAction = "done" | "read" | "snooze";

/**
 * Done / read / snooze EVERY Inbox notice of the given kinds (null = every kind) in one call —
 * across every page, not only the loaded rows. Returns the ids it changed (for Undo).
 */
export async function clearInbox(
  action: ClearAction,
  eventKeys: readonly string[] | null = null,
  until?: Date,
): Promise<string[]> {
  const { data, error } = await rpc("clear_inbox", {
    p_action: action,
    p_event_keys: eventKeys ? [...eventKeys] : null,
    p_until: until ? until.toISOString() : null,
  });
  if (error) throw operationFailed(action === "done" ? "clear your inbox" : `${action} your inbox`, error);
  return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}
