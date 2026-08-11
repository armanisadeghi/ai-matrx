/**
 * accessRequests — file, answer, and withdraw a request for access.
 *
 * Delivery deliberately lives HERE rather than in the database: filing the row
 * is one RPC, and telling the humans about it reuses the platform's existing
 * "system notifies a user" primitive (`sendDirectActionMessage`), which already
 * renders action chips inside the DM the recipient is already reading. There is
 * no second notification system, no second inbox, and no email hop.
 *
 * A delivery failure never fails the request. The row is the durable fact; the
 * DM is how it gets noticed. Losing the notification means the owner sees it in
 * their access-requests inbox instead — losing the row would mean the ask
 * simply vanished.
 */

import { createClient } from "@/utils/supabase/client";
import { sendDirectActionMessage } from "@/features/messaging/service/sendDirectActionMessage";
import type {
  AccessRequestCreated,
  AccessRequestRecipient,
  AccessRequestRow,
  AccessRequestStatus,
  RequestedLevel,
} from "@/features/access-gate/types";

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseStatus(raw: unknown): AccessRequestStatus {
  const known: AccessRequestStatus[] = [
    "pending",
    "granted",
    "declined",
    "withdrawn",
    "reported",
  ];
  return known.includes(raw as AccessRequestStatus)
    ? (raw as AccessRequestStatus)
    : "pending";
}

function parseRecipients(raw: unknown): AccessRequestRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const row = rec(entry);
    const userId = row ? str(row.user_id) : null;
    if (!userId) return [];
    return [
      {
        userId,
        reason: row?.reason === "org_admin" ? "org_admin" : "owner",
        displayName: str(row?.display_name),
      } satisfies AccessRequestRecipient,
    ];
  });
}

/**
 * The RPCs raise human sentences ("You already have access to this site.") with
 * real SQLSTATEs. Surfacing `error.message` directly is therefore correct here
 * and ONLY here — it is copy we wrote, not PostgREST's.
 */
function rpcError(error: { message?: string } | null): Error {
  const message = error?.message?.trim();
  return new Error(
    message && message.length > 0 && !message.startsWith("{")
      ? message
      : "We could not complete that just now.",
  );
}

/**
 * File a request, then tell the humans who can answer it.
 *
 * `already: true` means a pending request existed — the caller clicked twice,
 * or came back to the page. That is a no-op, not an error, and it must not send
 * a second DM.
 */
export async function createAccessRequest(args: {
  resourceType: string;
  resourceId: string;
  level?: RequestedLevel;
  message?: string;
  /** The current user, for the DM sender. Omit to skip notification. */
  currentUserId?: string | null;
  /** Where the recipient should land when they click through. */
  href?: string | null;
}): Promise<AccessRequestCreated> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("access_request_create", {
    p_resource_type: args.resourceType,
    p_resource_id: args.resourceId,
    p_level: args.level ?? "viewer",
    p_message: args.message?.trim() || undefined,
  });
  if (error) throw rpcError(error);

  const payload = rec(data) ?? {};
  const created: AccessRequestCreated = {
    requestId: str(payload.request_id) ?? "",
    status: parseStatus(payload.status),
    already: payload.already === true,
    level: payload.level === "editor" ? "editor" : "viewer",
    entityLabel: str(payload.entity_label),
    entityTitle: str(payload.entity_title),
    recipients: parseRecipients(payload.recipients),
  };

  if (!created.already && args.currentUserId) {
    await notifyRecipients(created, args);
  }
  return created;
}

/**
 * Deliver the ask as an actionable DM. Failures are swallowed on purpose — see
 * the file header. One recipient failing must not stop the others.
 */
async function notifyRecipients(
  created: AccessRequestCreated,
  args: {
    resourceType: string;
    resourceId: string;
    currentUserId?: string | null;
    message?: string;
    href?: string | null;
  },
): Promise<void> {
  const what = created.entityTitle
    ? `${created.entityLabel ?? "item"} "${created.entityTitle}"`
    : (created.entityLabel ?? "item").toLowerCase();
  const body = args.message?.trim()
    ? `Access requested for your ${what}: "${args.message.trim()}"`
    : `Access requested for your ${what}.`;

  await Promise.allSettled(
    created.recipients.map((recipient) =>
      sendDirectActionMessage({
        currentUserId: args.currentUserId as string,
        recipientId: recipient.userId,
        content: body,
        actionData: {
          kind: "access_request",
          version: 1,
          payload: {
            request_id: created.requestId,
            resource_type: args.resourceType,
            resource_id: args.resourceId,
            requested_level: created.level,
            entity_label: created.entityLabel,
            entity_title: created.entityTitle,
            note: args.message?.trim() || null,
            href: args.href ?? null,
          },
        },
      }),
    ),
  );
}

/** Grant or decline. Only someone who administers the target may call this. */
export async function decideAccessRequest(args: {
  requestId: string;
  decision: "grant" | "decline";
  level?: RequestedLevel;
  note?: string;
  /** The decider, for the "here it is" DM back to the requester. */
  currentUserId?: string | null;
}): Promise<{ status: AccessRequestStatus; already: boolean }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("access_request_decide", {
    p_request_id: args.requestId,
    p_decision: args.decision,
    p_level: args.level ?? undefined,
    p_note: args.note?.trim() || undefined,
  });
  if (error) throw rpcError(error);

  const payload = rec(data) ?? {};
  const status = parseStatus(payload.status);
  const already = payload.already === true;

  // Close the loop in the surface the requester already reads. The existing
  // `resource_shared` card is the canonical "you now have this" message, so a
  // grant looks identical to any other share.
  const requesterId = str(payload.requester_id);
  if (
    !already &&
    status === "granted" &&
    requesterId &&
    args.currentUserId
  ) {
    const resourceType = str(payload.resource_type);
    const resourceId = str(payload.resource_id);
    if (resourceType && resourceId) {
      await sendDirectActionMessage({
        currentUserId: args.currentUserId,
        recipientId: requesterId,
        content: `Access granted to ${str(payload.entity_title) ?? "the item you asked about"}.`,
        actionData: {
          kind: "resource_shared",
          version: 1,
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
            resource_label: str(payload.entity_label) ?? "Item",
            resource_title: str(payload.entity_title) ?? "",
          },
        },
      }).catch(() => {
        /* The grant landed; the courtesy note is best-effort. */
      });
    }
  }

  return { status, already };
}

/** End the conversation for good. Same authority as deciding. */
export async function reportAccessRequest(
  requestId: string,
  reason?: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("access_request_report", {
    p_request_id: requestId,
    p_reason: reason?.trim() || undefined,
  });
  if (error) throw rpcError(error);
}

/** The requester's own retraction. */
export async function withdrawAccessRequest(requestId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("access_request_withdraw", {
    p_request_id: requestId,
  });
  if (error) throw rpcError(error);
}

function parseRow(raw: unknown): AccessRequestRow | null {
  const row = rec(raw);
  const id = row ? str(row.id) : null;
  const resourceType = row ? str(row.resource_type) : null;
  const resourceId = row ? str(row.resource_id) : null;
  if (!id || !resourceType || !resourceId) return null;

  const requester = rec(row?.requester);
  const requesterId = requester ? str(requester.user_id) : null;

  return {
    id,
    status: parseStatus(row?.status),
    requestedLevel: row?.requested_level === "editor" ? "editor" : "viewer",
    message: str(row?.message),
    createdAt: str(row?.created_at),
    decidedAt: str(row?.decided_at),
    decisionNote: str(row?.decision_note),
    resourceType,
    resourceId,
    entityLabel: str(row?.entity_label),
    entityTitle: str(row?.entity_title),
    requester: requesterId
      ? {
          userId: requesterId,
          displayName: str(requester?.display_name),
          avatarUrl: str(requester?.avatar_url),
        }
      : null,
  };
}

/** `inbox` = asks I can answer. `sent` = asks I made. */
export async function listAccessRequests(
  box: "inbox" | "sent",
): Promise<AccessRequestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("access_request_list", {
    p_box: box,
  });
  if (error) throw rpcError(error);
  return (Array.isArray(data) ? data : [])
    .map(parseRow)
    .filter((row): row is AccessRequestRow => row !== null);
}
