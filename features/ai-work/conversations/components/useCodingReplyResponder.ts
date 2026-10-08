"use client";

/**
 * useCodingReplyResponder — WHO answers a reply typed on this conversation,
 * read from the server BEFORE the person types.
 *
 * 🚨 THE LABEL IS THE SERVER'S. `composer_label` is composed by
 * `GET /coding-sessions/conversations/{id}/responder` out of the SAME
 * resolution that picks the answering agent, so the sentence and the agent
 * can never disagree, and re-binding the mandate relabels the composer with
 * no frontend release. This hook therefore never re-derives, re-words or
 * templates a sentence from the parts, and there is no client-side fallback
 * sentence to fall back TO: until the report lands the composer says nothing
 * about who answers, and if the read fails it says the label could not be
 * loaded. V-XT/V3 (2026-09-15): the composer used to hardcode "AI Matrx is
 * answering" while production was silently taking the platform-default
 * stand-in, because no agent was bound.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { extractErrorMessage } from "@/utils/errors";
import {
  useCodingReplyResponder as usePackageCodingReplyResponder,
  type CodingReplyResponderRead,
} from "@ai-matrx/chat/agents/coding-session-reply/useCodingReplyResponder";
import type {
  CodingReplyResponderReport,
  ReplyDoorState,
} from "@ai-matrx/chat/agents/coding-session-reply/reply-door";

export type { CodingReplyResponderReport };
export type CodingReplyResponderState = ReplyDoorState;

/** The website's read of the one responder report (its API door), driving the package's reply door. */
export function useCodingReplyResponder(opts: {
  conversationId: string;
  /**
   * The conversation's OWN durable organization. The JWT lane of `callApi` is fail-closed on the
   * organization header, so without this the read dies as "Select an organization before sending
   * this request" on any session that has not picked one (live on aimatrx.com, 2026-09-15).
   */
  organizationId?: string | null;
  /** Read only where a reply can even be typed; `false` makes no request. */
  enabled: boolean;
}): ReplyDoorState {
  const { conversationId, organizationId, enabled } = opts;
  const dispatch = useAppDispatch();
  const read = useCallback<CodingReplyResponderRead>(
    async (id) => {
      const result = await dispatch(
        callApi({
          path: "/coding-sessions/conversations/{conversation_id}/responder",
          method: "GET",
          pathParams: { conversation_id: id },
          scopeOverrides: organizationId ? { organization_id: organizationId } : undefined,
        }),
      );
      if (result.error) {
        // `extractErrorMessage` answers "Unknown error" for an absent detail, so ask it only when there IS one.
        const detail = result.error.serverDetail ? extractErrorMessage(result.error.serverDetail) : "";
        throw new Error(detail || result.error.message || "Unknown error");
      }
      return (result.data ?? null) as CodingReplyResponderReport;
    },
    [dispatch, organizationId],
  );
  return usePackageCodingReplyResponder({ conversationId, enabled, read });
}
