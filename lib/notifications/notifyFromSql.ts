/**
 * THE frontend server's door to the notification spine.
 *
 * A server route that needs to tell somebody something writes the FACTS here and nothing else:
 * `communication.notify_from_sql` queues one row per channel the event's registry row turns on,
 * the aidream render lane writes the WORDS from the event's declared templates
 * (`aidream/services/notifications/declarations.py`), and the pairing rule adds the DM for every
 * user recipient — an email to a platform user never goes without a DM.
 *
 * Never render an email or call Resend from a route for a notice; declare the event instead.
 *
 * Server code only: every caller passes the SERVICE-ROLE client it built. No `server-only`
 * import here — a `"use server"` actions file reaches this module, and its client-side import
 * chain (settings → FeedbackSettingsPage → feedback.actions) must stay loadable in tests.
 * Canonical: `aidream/aidream/services/notifications/FEATURE.md`.
 */

import type { createAdminClient } from "@/utils/supabase/adminClient";
import type { Database, Json } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** What the DM leg carries beyond the words (stored on its `metadata.dm`). */
export interface NoticeDm {
  /** The person who caused it; absent → the Matrx System bot. */
  sender_user_id?: string;
  /** A structured chip on the message (the same shape `sendDm` takes). */
  action_data?: Record<string, Json>;
  when_sender_is_recipient?: "system_bot" | "skip";
}

export interface NotifyFromSqlArgs {
  organizationId: string;
  eventKey: string;
  /** Set whenever the recipient has an account — this is what makes the DM fire. */
  recipientUserId: string | null;
  /** The email address (an address-only notice when there is no account). */
  toAddress: string | null;
  recipientLabel?: string | null;
  /** Every key the event's templates name, each non-empty (the renderer is strict). */
  payload: Record<string, Json>;
  /** A same-app path (`/invitations/…`); the spine makes it absolute and names the org. */
  deepLink?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  /** Re-sending the same key queues nothing new (`already_queued`). */
  dedupeKey?: string | null;
  dm?: NoticeDm;
  /** Channels the recipient turned off in a preference this route holds. */
  optedOut?: string[];
}

export interface NotifyFromSqlResult {
  /** Channels that will be delivered (`email`, `dm`, `in_app`). */
  queued: string[];
  skipped: { channel: string; why: string }[];
  /** One sentence for the person who caused the notice. */
  say: string;
}

type NotifyFromSqlRpcArgs =
  Database["communication"]["Functions"]["notify_from_sql"]["Args"] & {
    p_options: Json;
  };

function readResult(data: Json): NotifyFromSqlResult {
  const row = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as {
    queued?: Json;
    skipped?: Json;
    say?: Json;
  };
  const queued = Array.isArray(row.queued)
    ? row.queued.filter((c): c is string => typeof c === "string")
    : [];
  const skipped = Array.isArray(row.skipped)
    ? row.skipped.flatMap((s) =>
        s && typeof s === "object" && !Array.isArray(s)
          ? [{ channel: String(s.channel ?? ""), why: String(s.why ?? "") }]
          : [],
      )
    : [];
  return {
    queued,
    skipped,
    say: typeof row.say === "string" ? row.say : "Nothing could be sent to them.",
  };
}

/**
 * Queue a notice. Throws on a database error (the caller decides what the person is told);
 * a notice the spine declined is NOT an error — it comes back in `skipped` with its reason.
 */
export async function notifyFromSql(
  admin: AdminClient,
  args: NotifyFromSqlArgs,
): Promise<NotifyFromSqlResult> {
  const options: Record<string, Json> = {};
  if (args.dm) options.dm = args.dm as unknown as Json;
  if (args.optedOut?.length) options.opted_out = args.optedOut;

  const rpcArgs: NotifyFromSqlRpcArgs = {
    p_organization_id: args.organizationId,
    p_event_key: args.eventKey,
    // The generated Args type marks every parameter required and non-null; SQL NULL is the
    // documented "absent" for each of these (address-only notice, no label, no target).
    p_recipient_user_id: args.recipientUserId as string,
    p_to_address: args.toAddress as string,
    p_recipient_label: (args.recipientLabel ?? null) as string,
    p_payload: args.payload,
    p_deep_link: (args.deepLink ?? null) as string,
    p_target_kind: (args.targetKind ?? null) as string,
    p_target_id: (args.targetId ?? null) as string,
    p_dedupe_key: (args.dedupeKey ?? null) as string,
    p_options: options,
  };
  const { data, error } = await admin
    .schema("communication")
    .rpc("notify_from_sql", rpcArgs);
  if (error) {
    throw new Error(`notify_from_sql(${args.eventKey}) failed: ${error.message}`);
  }
  return readResult(data);
}

/** True when the email leg is on its way. */
export function emailQueued(result: NotifyFromSqlResult): boolean {
  return result.queued.includes("email");
}

/**
 * The account behind an email address, through the canonical lookup
 * (`public.lookup_user_by_email`, the one sharing and inviting use). Null = no account,
 * so the notice is email-only.
 */
export async function userIdForEmail(
  admin: AdminClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("lookup_user_by_email", {
    lookup_email: email,
  });
  if (error) {
    throw new Error(`lookup_user_by_email failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row?.user_id ?? null;
}

/** "October 9, 2026" — the date words every invitation template shows. */
export function noticeDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The response every invitation route returns: the old `emailSent` / `emailError` /
 * `acceptUrl` contract the invite dialogs read (the copy-the-link state when the email is
 * not on its way), plus the spine's own `queued` / `skipped` / `say`.
 */
export function invitationOutcome(result: NotifyFromSqlResult, acceptUrl: string) {
  const emailSent = emailQueued(result);
  return {
    success: true,
    emailSent,
    queued: result.queued,
    skipped: result.skipped,
    say: result.say,
    ...(emailSent ? {} : { emailError: result.say, acceptUrl }),
  };
}

/** The display name of the signed-in person who caused a notice. */
export function actorName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null },
  fallback: string,
): string {
  const meta = user.user_metadata ?? {};
  const full = typeof meta.full_name === "string" ? meta.full_name : null;
  const name = typeof meta.name === "string" ? meta.name : null;
  return full || name || user.email || fallback;
}

/** The legacy per-family email switches in `users.user_email_preferences`. */
export type LegacyEmailSwitch =
  | "task_notifications"
  | "comment_notifications"
  | "sharing_notifications"
  | "feedback_notifications";

/**
 * A person's own "no email for this" from Settings › Email, as the spine's `opted_out` list.
 * The email leg becomes a named `skipped / opted_out` row and the DM still goes — the switch
 * was always about email. No row = every switch on. A read that fails withholds the email, the
 * same conservative answer the retired senders gave.
 */
export async function legacyEmailOptOut(
  admin: AdminClient,
  userId: string,
  column: LegacyEmailSwitch,
): Promise<string[]> {
  const { data, error } = await admin
    .schema("users")
    .from("user_email_preferences")
    .select(column)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`user_email_preferences.${column} read failed — email withheld:`, error.message);
    return ["email"];
  }
  const value = data ? (data as Record<string, unknown>)[column] : undefined;
  return value === false ? ["email"] : [];
}

/** The email address on a person's account, or null. */
export async function accountEmail(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("auth user read failed:", error.message);
    return null;
  }
  return data.user?.email ?? null;
}

/** At most `max` characters, with an ellipsis when cut — the preview rule every notice uses. */
export function preview(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
