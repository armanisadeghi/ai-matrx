"use client";

/**
 * useRequestAccess — send a `RequestAccessTarget` ask through the system that
 * owns it (see `service/requestAccess.ts`). Organization → the access-request
 * ledger + DM to its admins; system → a user-feedback item. Nothing new stored.
 */

import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectDisplayName,
  selectUserEmail,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { submitFeedback } from "@/actions/feedback.actions";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { createSettingAccessRequest } from "@/features/access-gate/service/accessRequests";
import { REQUEST_ACCESS_MANUAL_ACTION } from "@/features/messaging/actions/settingRequestActionRegistry";
import {
  destinationLabel,
  feedbackMetadata,
  orgActionPayload,
  orgManageHref,
  orgSettingKey,
  requestBody,
  requestTitle,
  resolveRequestOwner,
  type RequestAccessTarget,
  type RequestContext,
} from "@/features/access-gate/service/requestAccess";

export interface RequestAccessResult {
  /** A pending ask already existed — nothing new was sent. */
  already: boolean;
  /** Sentence for the confirmation toast. */
  message: string;
  /** Warning, not success: the ask is saved but no admin was messaged. */
  undelivered: boolean;
}

export function useRequestAccess(target: RequestAccessTarget) {
  const userId = useAppSelector(selectUserId);
  const displayName = useAppSelector(selectDisplayName);
  const email = useAppSelector(selectUserEmail);
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const owner = resolveRequestOwner(target.owner);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const context = (): RequestContext => ({
    pageUrl: typeof window === "undefined" ? "" : window.location.href,
    requesterName: displayName,
    requesterEmail: email,
  });

  async function send(note: string): Promise<RequestAccessResult> {
    setSending(true);
    try {
      const ctx = context();
      if (owner.kind === "system") {
        // The request is filed under an organization; with none selected yet, ASK and continue
        // (ensureOrganizationContext waits for boot and opens the picker) — never a refusal
        // spelled from a nullable id while boot is still resolving (check:org-three-states).
        const organizationId = await ensureOrganizationContext({
          organizationId: activeOrganizationId,
        });
        const result = await submitFeedback({
          // The feedback vocabulary's access-request type; `metadata` carries
          // the structured target (FEATURE.md, RequestAccess).
          feedback_type: "request",
          route: typeof window === "undefined" ? "" : window.location.pathname,
          organization_id: organizationId,
          description: `Access request: ${requestTitle(target)}\n\n${requestBody(target, ctx, note)}`,
          metadata: feedbackMetadata(target, ctx),
        });
        if (!result.success) {
          throw new Error(result.error ?? "We couldn't send that request.");
        }
        setSent(true);
        return {
          already: false,
          undelivered: false,
          message: `Request sent to ${destinationLabel(owner)}.`,
        };
      }

      const result = await createSettingAccessRequest({
        organizationId: owner.organizationId,
        settingKey: orgSettingKey(target),
        settingLabel: requestTitle(target),
        href: orgManageHref(target, owner),
        actionKey: REQUEST_ACCESS_MANUAL_ACTION,
        actionPayload: orgActionPayload(target, owner),
        message: requestBody(target, ctx, note),
        currentUserId: userId,
      });
      setSent(true);
      if (result.already) {
        return {
          already: true,
          undelivered: false,
          message: "Your request is already waiting for an answer.",
        };
      }
      if (result.delivered === 0) {
        return {
          already: false,
          undelivered: true,
          message:
            "Your request is saved in Access requests, but we couldn't message an admin just now.",
        };
      }
      return {
        already: false,
        undelivered: false,
        message: `Request sent to ${destinationLabel(owner)}.`,
      };
    } finally {
      setSending(false);
    }
  }

  return {
    owner,
    destination: destinationLabel(owner),
    context,
    send,
    sending,
    sent,
  };
}
