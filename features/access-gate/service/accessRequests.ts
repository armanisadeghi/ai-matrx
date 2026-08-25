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
import { isJsonObject, type JsonObject } from "@/types/json";
import type {
  AccessRequestCreated,
  AccessRequestRecipient,
  AccessRequestRow,
  AccessRequestStatus,
  RequestedLevel,
  ResourceActionRequestPayload,
  SettingRequestPayload,
} from "@/features/access-gate/types";

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function responseRecord(value: unknown): Record<string, unknown> {
  const payload = rec(value);
  if (!payload) {
    throw new Error("The access request response was incomplete.");
  }
  return payload;
}

function responseString(payload: Record<string, unknown>, key: string): string {
  const value = str(payload[key]);
  if (!value) {
    throw new Error("The access request response was incomplete.");
  }
  return value;
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
        reason:
          row?.reason === "org_admin" || row?.role === "admin"
            ? "org_admin"
            : "owner",
        displayName: str(row?.display_name),
      } satisfies AccessRequestRecipient,
    ];
  });
}

function parseSettingRequest(raw: unknown): SettingRequestPayload | null {
  if (!isJsonObject(raw)) return null;
  const settingLabel = str(raw.setting_label);
  const href = str(raw.href);
  const actionKey = str(raw.action_key);
  const actionPayload = isJsonObject(raw.action_payload)
    ? raw.action_payload
    : null;
  if (!settingLabel || !href || !actionKey || !actionPayload) return null;
  return { settingLabel, href, actionKey, actionPayload };
}

function parseResourceActionRequest(
  raw: unknown,
): ResourceActionRequestPayload | null {
  if (!isJsonObject(raw)) return null;
  const actionKey = str(raw.action_key);
  const actionLabel = str(raw.action_label);
  if (actionKey !== "delete" || !actionLabel) return null;
  return { actionKey, actionLabel };
}

function parseRequestedLevel(raw: unknown): RequestedLevel {
  return raw === "admin" ? "admin" : raw === "editor" ? "editor" : "viewer";
}

/**
 * The RPCs raise human sentences ("You already have access to this site.") with
 * real SQLSTATEs. Surfacing `error.message` directly is therefore correct here
 * and ONLY here — it is copy we wrote, not PostgREST's.
 */
function rpcError(error: { message?: string } | null): Error {
  const message = error?.message?.trim();
  const isOurs =
    !!message &&
    message.length > 0 &&
    !message.startsWith("{") &&
    // Postgres's own prose leaks constraint names, relations and SQLSTATEs.
    // Our sentences never contain any of these. (Adversarial pass, 2026-08-11:
    // a concurrent second ask toasted `duplicate key value violates unique
    // constraint "access_requests_one_pending"` verbatim.)
    !/violates|constraint|relation |column |permission denied for|syntax error|null value in|PGRST|SQLSTATE|_pkey|_fkey/i.test(
      message,
    ) &&
    // Our OWN sentences can still be written for a developer. Granting against
    // an unshareable resource type raises "permissions.resource_type=organization
    // is not registered (canonical token or table_name). See
    // features/sharing/FEATURE.md" — a repo path and two schema names, shown to
    // a user, from the feature whose LAW is that this never happens. (Caught in
    // the browser, 2026-08-11, answering a request from this page.)
    !/\bfeatures\/|\.md\b|resource_type=|table_name|canonical token|is not registered/i.test(
      message,
    );
  return new Error(isOurs ? message : "We could not complete that just now.");
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

  const payload = responseRecord(data);
  const created: AccessRequestCreated = {
    requestId: responseString(payload, "request_id"),
    status: parseStatus(payload.status),
    already: payload.already === true,
    level: parseRequestedLevel(payload.level),
    entityLabel: str(payload.entity_label),
    entityTitle: str(payload.entity_title),
    recipients: parseRecipients(payload.recipients),
  };

  if (!created.already && args.currentUserId) {
    created.delivered = await notifyRecipients(created, args);
  }
  return created;
}

/** Ask the owner/admins to perform a governed destructive action. */
export async function createDeleteRequest(args: {
  resourceType: string;
  resourceId: string;
  message?: string;
  currentUserId?: string | null;
  href?: string | null;
}): Promise<AccessRequestCreated> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("access_request_create", {
    p_resource_type: args.resourceType,
    p_resource_id: args.resourceId,
    // Stable RPC signature: `delete` is the governed-action command and is
    // stored durably as resource_action + requested_level admin.
    p_level: "delete",
    p_message: args.message?.trim() || undefined,
  });
  if (error) throw rpcError(error);

  const payload = responseRecord(data);
  const created: AccessRequestCreated = {
    requestId: responseString(payload, "request_id"),
    status: parseStatus(payload.status),
    already: payload.already === true,
    level: "admin",
    entityLabel: str(payload.entity_label),
    entityTitle: str(payload.entity_title),
    recipients: parseRecipients(payload.recipients),
  };
  if (!created.already && args.currentUserId) {
    created.delivered = await notifyRecipients(created, {
      ...args,
      requestKind: "resource_action",
      actionKey: "delete",
      actionLabel: `Delete ${created.entityLabel ?? "item"}`,
    });
  }
  return created;
}

export interface SettingAccessRequestCreated {
  requestId: string;
  already: boolean;
  recipients: AccessRequestRecipient[];
  delivered?: number;
}

/** File an admin-only setting request, then deliver the same durable row by DM. */
export async function createSettingAccessRequest(args: {
  organizationId: string;
  settingKey: string;
  settingLabel: string;
  href: string;
  actionKey: string;
  actionPayload: JsonObject;
  message?: string;
  currentUserId?: string | null;
}): Promise<SettingAccessRequestCreated> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("setting_access_request_create", {
    p_org_id: args.organizationId,
    p_setting_key: args.settingKey,
    p_setting_label: args.settingLabel,
    p_setting_href: args.href,
    p_action_key: args.actionKey,
    p_action_payload: args.actionPayload,
    p_message: args.message?.trim() || undefined,
  });
  if (error) throw rpcError(error);

  const payload = responseRecord(data);
  const created: SettingAccessRequestCreated = {
    requestId: responseString(payload, "request_id"),
    already: payload.already === true,
    recipients: parseRecipients(payload.recipients),
  };

  const currentUserId = args.currentUserId;
  if (!created.already && currentUserId) {
    const body = args.message?.trim()
      ? `${args.settingLabel}: ${args.message.trim()}`
      : `Please update ${args.settingLabel}.`;
    const results = await Promise.allSettled(
      created.recipients.map((recipient) =>
        sendDirectActionMessage({
          currentUserId,
          recipientId: recipient.userId,
          content: body,
          actionData: {
            kind: "setting_access_request",
            version: 1,
            payload: {
              request_id: created.requestId,
              organization_id: args.organizationId,
              setting_key: args.settingKey,
              setting_label: args.settingLabel,
              href: args.href,
              action_key: args.actionKey,
              action_payload: args.actionPayload,
              note: args.message?.trim() || null,
            },
          },
        }),
      ),
    );
    created.delivered = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
  }
  return created;
}

export async function decideSettingAccessRequest(args: {
  requestId: string;
  decision: "complete" | "decline";
  note?: string;
}): Promise<{ status: AccessRequestStatus; already: boolean }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("setting_access_request_decide", {
    p_request_id: args.requestId,
    p_decision: args.decision,
    p_note: args.note?.trim() || undefined,
  });
  if (error) throw rpcError(error);
  const payload = responseRecord(data);
  return {
    status: parseStatus(payload.status),
    already: payload.already === true,
  };
}

/**
 * Deliver the ask as an actionable DM. Failures never fail the request — the
 * row is the durable fact — but the COUNT is returned, because telling the user
 * "they've been messaged" when nothing was delivered is its own small lie, and
 * this feature exists to stop the app claiming things it didn't verify.
 * One recipient failing must not stop the others.
 */
async function notifyRecipients(
  created: AccessRequestCreated,
  args: {
    resourceType: string;
    resourceId: string;
    currentUserId?: string | null;
    message?: string;
    href?: string | null;
    requestKind?: "resource_access" | "resource_action";
    actionKey?: "delete";
    actionLabel?: string;
  },
): Promise<number> {
  const what = created.entityTitle
    ? `${created.entityLabel ?? "item"} "${created.entityTitle}"`
    : (created.entityLabel ?? "item").toLowerCase();
  const isAction = args.requestKind === "resource_action";
  const body = args.message?.trim()
    ? `${isAction ? "Deletion" : "Access"} requested for your ${what}: "${args.message.trim()}"`
    : `${isAction ? "Deletion" : "Access"} requested for your ${what}.`;

  const results = await Promise.allSettled(
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
            request_kind: args.requestKind ?? "resource_access",
            action_key: args.actionKey ?? null,
            action_label: args.actionLabel ?? null,
            entity_label: created.entityLabel,
            entity_title: created.entityTitle,
            note: args.message?.trim() || null,
            href: args.href ?? null,
          },
        },
      }),
    ),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

/** Grant or decline. Only someone who administers the target may call this. */
export async function decideAccessRequest(args: {
  requestId: string;
  decision: "grant" | "decline" | "complete";
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

  const payload = responseRecord(data);
  const status = parseStatus(payload.status);
  const already = payload.already === true;

  // Close the loop in the surface the requester already reads. The existing
  // `resource_shared` card is the canonical "you now have this" message, so a
  // grant looks identical to any other share.
  const requesterId = str(payload.requester_id);
  const requestKind = str(payload.request_kind);
  if (!already && status === "granted" && requesterId && args.currentUserId) {
    const resourceType = str(payload.resource_type);
    const resourceId = str(payload.resource_id);
    if (resourceType && resourceId) {
      const completedAction =
        requestKind === "resource_action" && args.decision === "complete";
      await sendDirectActionMessage({
        currentUserId: args.currentUserId,
        recipientId: requesterId,
        content: completedAction
          ? `${str(payload.entity_title) ?? "The item you asked about"} was deleted.`
          : `Access granted to ${str(payload.entity_title) ?? "the item you asked about"}.`,
        actionData: completedAction
          ? undefined
          : {
              kind: "resource_shared",
              version: 1,
              payload: {
                resource_type: resourceType,
                resource_id: resourceId,
                resource_label: str(payload.entity_label) ?? "Item",
                resource_title: str(payload.entity_title) ?? "",
                permission_level: args.level ?? undefined,
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
  const requestKey = str(row?.request_key);

  return {
    id,
    status: parseStatus(row?.status),
    requestedLevel: parseRequestedLevel(row?.requested_level),
    message: str(row?.message),
    createdAt: str(row?.created_at),
    decidedAt: str(row?.decided_at),
    decisionNote: str(row?.decision_note),
    resourceType,
    resourceId,
    entityLabel: str(row?.entity_label),
    entityTitle: str(row?.entity_title),
    requestKind:
      row?.request_kind === "setting"
        ? "setting"
        : row?.request_kind === "resource_action"
          ? "resource_action"
          : "resource_access",
    requestKey: requestKey ? requestKey : "",
    resourceAction:
      row?.request_kind === "resource_action"
        ? parseResourceActionRequest(row?.request_payload)
        : null,
    settingRequest:
      row?.request_kind === "setting"
        ? parseSettingRequest(row?.request_payload)
        : null,
    requester: requesterId
      ? {
          userId: requesterId,
          displayName: str(requester?.display_name),
          avatarUrl: str(requester?.avatar_url),
          // The inbox names the requester but never links to them: no
          // per-user route exists, and inventing one is the dead end this
          // whole feature is about.
          creatorHandle: null,
        }
      : null,
  };
}

export async function getResourceActionRequestForDecision(
  requestId: string,
): Promise<
  AccessRequestRow & { resourceAction: ResourceActionRequestPayload }
> {
  const rows = await listAccessRequests("inbox");
  const request = rows.find((row) => row.id === requestId);
  if (
    !request ||
    request.status !== "pending" ||
    request.requestKind !== "resource_action" ||
    !request.resourceAction
  ) {
    throw new Error("This action request is no longer available.");
  }
  return { ...request, resourceAction: request.resourceAction };
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

/**
 * Resolve an inline setting action from the durable, caller-authorized inbox.
 * DM action_data is presentation context, never the authority for a write.
 */
export async function getSettingAccessRequestForDecision(
  requestId: string,
): Promise<AccessRequestRow & { settingRequest: SettingRequestPayload }> {
  const rows = await listAccessRequests("inbox");
  const request = rows.find((row) => row.id === requestId);
  if (
    !request ||
    request.status !== "pending" ||
    request.requestKind !== "setting" ||
    !request.settingRequest
  ) {
    throw new Error("This setting request is no longer available.");
  }
  return { ...request, settingRequest: request.settingRequest };
}
