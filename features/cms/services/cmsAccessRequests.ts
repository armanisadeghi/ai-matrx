/**
 * CMS access requests cross the standalone-CMS/Main boundary deliberately.
 *
 * The route verifies the CMS row and its real owner/org with the CMS secret,
 * then records the durable ask in Main. This client half only delivers that
 * already-verified ask through the canonical direct-message primitive.
 */

import { sendDirectActionMessage } from "@/features/messaging/service/sendDirectActionMessage";
import type {
  AccessRequestCreated,
  AccessRequestRecipient,
} from "@/features/access-gate/types";
import type { CmsAccessGateToken } from "@/features/cms/accessGateTokens";

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseRecipients(raw: unknown): AccessRequestRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const row = rec(value);
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

export async function createCmsAccessRequest(args: {
  token: CmsAccessGateToken;
  resourceId: string;
  message?: string;
  currentUserId?: string | null;
}): Promise<AccessRequestCreated> {
  const response = await fetch("/api/cms/access-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: args.token,
      id: args.resourceId,
      action: "request",
      message: args.message?.trim() || undefined,
    }),
  });
  const payload = rec(await response.json().catch(() => null));
  if (!response.ok) {
    throw new Error(
      str(payload?.error) ?? "We could not send that request just now.",
    );
  }

  const requestId = str(payload?.request_id);
  if (!requestId) {
    throw new Error("The access request response was incomplete.");
  }

  const siteName = str(payload?.site_name);
  const recipients = parseRecipients(payload?.recipients);
  const created: AccessRequestCreated = {
    requestId,
    status: "pending",
    already: payload?.already === true,
    level: "viewer",
    entityLabel: "CMS Site",
    entityTitle: siteName,
    recipients,
  };

  const currentUserId = args.currentUserId;
  const manageAccessHref = str(payload?.manage_access_href);
  const organizationId = str(payload?.organization_id);
  const settingKey = str(payload?.setting_key);
  const settingLabel = str(payload?.setting_label);
  const actionKey = str(payload?.action_key);
  const actionPayload = rec(payload?.action_payload);
  if (
    !created.already &&
    currentUserId &&
    manageAccessHref &&
    organizationId &&
    settingKey &&
    settingLabel &&
    actionKey &&
    actionPayload
  ) {
    const subject = siteName ? `CMS site “${siteName}”` : "your CMS site";
    const content = args.message?.trim()
      ? `Access requested for ${subject}: “${args.message.trim()}”`
      : `Access requested for ${subject}.`;
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendDirectActionMessage({
          currentUserId,
          recipientId: recipient.userId,
          content,
          actionData: {
            kind: "setting_access_request",
            version: 1,
            payload: {
              request_id: created.requestId,
              organization_id: organizationId,
              setting_key: settingKey,
              setting_label: settingLabel,
              href: manageAccessHref,
              action_key: actionKey,
              action_payload: actionPayload,
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
