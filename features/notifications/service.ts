/**
 * features/notifications/service.ts — the Inbox's reads and writes.
 *
 * THE HOME OF EVERY NOTICE IS `communication.notification`. This module reads
 * the recipient's own in-app rows through three signed-in doors applied on
 * 2026-09-19 (each resolves `auth.uid()` inside its body and is declared in
 * `platform.client_callable_door`):
 *
 *   communication.my_notifications(p_limit, p_before, p_unread_only)
 *   communication.my_notification_unread_count()
 *   communication.mark_my_notifications_read()
 *
 * plus the pre-existing `communication.mark_notification_read(id, channel)`
 * for a single row. Doors, not table policies: the recipient RLS arm on the
 * table is routed to the DB-rules owner (notification-system HANDOFF,
 * 2026-08-26), and a door does not decertify the table.
 *
 * The three new doors are not yet in `types/database.types.ts` — that file
 * regenerates from the live database with `pnpm db-types`, which this session
 * could not run (no Supabase access token in the sandbox). Until then the
 * calls use the same `as never` seam the HR doors use
 * (`features/hr/settings/service.ts`) and this module asserts the row shape at
 * the boundary. Regenerating the types and deleting the seam is the named
 * follow-up in `./FEATURE.md`.
 *
 * Reads/writes go React → Supabase directly (CLAUDE.md § Data flow).
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import type { InboxNotification } from "./types";

const IN_APP_CHANNEL = "in_app";

function communication() {
  return createClient().schema("communication");
}

/** What an RPC not yet in the generated types answers with — asserted below. */
type UntypedRpcResult = { data: unknown; error: PostgrestError | null };

function isInboxNotification(value: unknown): value is InboxNotification {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.event_key === "string" &&
    typeof row.created_at === "string"
  );
}

export interface FetchMyNotificationsArgs {
  limit?: number;
  /** Keyset cursor — rows created strictly before this ISO timestamp. */
  before?: string | null;
  unreadOnly?: boolean;
}

/** The recipient's delivered in-app notices, newest first. */
export async function fetchMyNotifications(
  args: FetchMyNotificationsArgs = {},
): Promise<InboxNotification[]> {
  const { data, error } = (await communication().rpc(
    "my_notifications" as never,
    {
      p_limit: args.limit ?? 50,
      p_before: args.before ?? null,
      p_unread_only: args.unreadOnly ?? false,
    } as never,
  )) as UntypedRpcResult;
  if (error) throw operationFailed("load your notifications", error);
  if (!Array.isArray(data)) {
    throw operationFailed(
      "load your notifications",
      new Error(
        `communication.my_notifications returned ${typeof data}; expected rows.`,
      ),
    );
  }
  const rows: InboxNotification[] = [];
  for (const row of data) {
    if (!isInboxNotification(row)) {
      throw operationFailed(
        "load your notifications",
        new Error(
          "communication.my_notifications returned a row without id/event_key/created_at — the door's RETURNS TABLE and features/notifications/types.ts disagree.",
        ),
      );
    }
    rows.push(row);
  }
  return rows;
}

/** The badge number: delivered in-app notices with no `read_at`. */
export async function fetchMyUnreadNotificationCount(): Promise<number> {
  const { data, error } = (await communication().rpc(
    "my_notification_unread_count" as never,
    {} as never,
  )) as UntypedRpcResult;
  if (error) throw operationFailed("count your unread notifications", error);
  if (typeof data !== "number") {
    throw operationFailed(
      "count your unread notifications",
      new Error(
        `communication.my_notification_unread_count returned ${typeof data}; expected a number.`,
      ),
    );
  }
  return data;
}

/** Stamp one notice read (the person opened it). Returns whether a row changed. */
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
  const { data, error } = (await communication().rpc(
    "mark_my_notifications_read" as never,
    {} as never,
  )) as UntypedRpcResult;
  if (error) throw operationFailed("mark your notifications read", error);
  return typeof data === "number" ? data : 0;
}
