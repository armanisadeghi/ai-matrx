"use client";

// features/notifications/service.ts
//
// THE ONLY MODULE IN THE APP THAT NAMES WHERE AN IN-APP NOTIFICATION LIVES.
//
// This is the DIRECT lane — React → Supabase (CLAUDE.md § Data flow). The four
// doors are `SECURITY DEFINER` functions in the `communication` schema, already
// granted to `authenticated`, reached through
// `client.schema("communication").rpc(...)`:
//
//   my_notifications(p_limit, p_before, p_unread_only) → TABLE(...)
//   my_notification_unread_count()                     → integer
//   mark_notification_read(p_notification_id, p_channel)→ boolean
//   mark_my_notifications_read()                        → integer
//
// 🚨 NOTHING HERE THROWS AND NOTHING HERE SWALLOWS. `rpc` resolves with
// `{data, error}` but REJECTS on a network failure or an unparseable response;
// a rejection that escapes leaves the bell spinning forever. Every failure
// comes back as `{ok:false}` with a sentence the bell prints.
//
// 🚨 NOTHING HERE INVENTS COPY FOR A REFUSAL. A door that refuses (signed out,
// RLS) writes its own sentence; these wrappers carry it through untouched.
//
// 🚨 NOTHING HERE CASTS A PAYLOAD INTO A HAND-WRITTEN TYPE. Three of the four
// doors are live in the database but absent from `types/database.types.ts`
// (only `mark_notification_read` made the last generation), so the cast below
// buys exactly the right to NAME the function — nothing about the answer, which
// stays `unknown` until `toNotification` proves it field by field.

import { createClient } from "@/utils/supabase/client";
import type { NotificationResult, PlatformNotification } from "./types";

/** PostgREST's code for "your role may not do that" — a refusal, not a crash. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

/** How many rows one bell opening reads. The bell is a peek, not an archive. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** The channel these reads and writes belong to — the bell is the in-app one. */
const IN_APP_CHANNEL = "in_app";

function failed(
  message: string,
  code?: string | null,
  technical?: string | null,
): NotificationResult<never> {
  return {
    ok: false,
    message,
    code: code ?? null,
    technical: technical?.trim() || null,
  };
}

type DoorError = { code?: string; message?: string } | null;

/**
 * Call ONE `communication` door and hand back the raw payload.
 *
 * The cast is deliberate and contained to this function; see the file header.
 */
async function callDoor(
  fn: string,
  args: Record<string, unknown>,
  whatFailed: string,
): Promise<NotificationResult<unknown>> {
  const communication = createClient().schema(
    "communication",
  ) as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: DoorError }>;
  };

  let data: unknown = null;
  let error: DoorError = null;
  try {
    ({ data, error } = await communication.rpc(fn, args));
  } catch (thrown) {
    return failed(
      `${whatFailed} did not reach the server.`,
      null,
      thrown instanceof Error ? thrown.message : String(thrown),
    );
  }

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      // The door refused the caller's standing before it ran. Its own sentence
      // is the best one available, so it is the one the person sees.
      return failed(
        error.message?.trim() || `${whatFailed} was refused.`,
        error.code,
        null,
      );
    }
    return failed(
      error.message?.trim() || `${whatFailed} failed.`,
      error.code ?? null,
      null,
    );
  }

  return { ok: true, value: data };
}

// ── Payload readers — assert nothing, prove everything ──────────────────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNotification(row: unknown): PlatformNotification | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const createdAt = str(r.created_at);
  // A row with no identity or no time is a row nothing can render or order.
  if (!id || !createdAt) return null;
  return {
    id,
    eventKey: str(r.event_key) ?? "",
    subject: str(r.subject) ?? "Notification",
    body: str(r.body),
    deepLink: str(r.deep_link),
    targetKind: str(r.target_kind),
    targetId: str(r.target_id),
    organizationId: str(r.organization_id),
    createdAt,
    deliveredAt: str(r.delivered_at),
    readAt: str(r.read_at),
    actedAt: str(r.acted_at),
    outcome: str(r.outcome),
  };
}

// ── The four doors ──────────────────────────────────────────────────────────

/** The newest notifications addressed to the signed-in person. */
export async function listMyNotifications(options?: {
  limit?: number;
  before?: string | null;
  unreadOnly?: boolean;
}): Promise<NotificationResult<PlatformNotification[]>> {
  const result = await callDoor(
    "my_notifications",
    {
      p_limit: options?.limit ?? NOTIFICATION_PAGE_SIZE,
      p_before: options?.before ?? null,
      p_unread_only: options?.unreadOnly ?? false,
    },
    "Loading your notifications",
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.value)) {
    return failed(
      "The notifications door answered in a shape this screen cannot read.",
    );
  }
  const rows = result.value
    .map(toNotification)
    .filter((row): row is PlatformNotification => row !== null);
  return { ok: true, value: rows };
}

/** How many are unread — the badge's ONE source. */
export async function getMyUnreadCount(): Promise<NotificationResult<number>> {
  const result = await callDoor(
    "my_notification_unread_count",
    {},
    "Counting your unread notifications",
  );
  if (!result.ok) return result;
  const count =
    typeof result.value === "number"
      ? result.value
      : Number.parseInt(String(result.value ?? ""), 10);
  if (!Number.isFinite(count)) {
    return failed(
      "The unread-count door answered in a shape this screen cannot read.",
    );
  }
  return { ok: true, value: count };
}

/** Mark ONE notification read. `true` means the door recorded it. */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationResult<boolean>> {
  const result = await callDoor(
    "mark_notification_read",
    { p_notification_id: notificationId, p_channel: IN_APP_CHANNEL },
    "Marking that notification read",
  );
  if (!result.ok) return result;
  return { ok: true, value: result.value === true };
}

/** Mark every unread notification read; the door returns how many it changed. */
export async function markAllMyNotificationsRead(): Promise<
  NotificationResult<number>
> {
  const result = await callDoor(
    "mark_my_notifications_read",
    {},
    "Marking your notifications read",
  );
  if (!result.ok) return result;
  const changed =
    typeof result.value === "number"
      ? result.value
      : Number.parseInt(String(result.value ?? ""), 10);
  return { ok: true, value: Number.isFinite(changed) ? changed : 0 };
}
