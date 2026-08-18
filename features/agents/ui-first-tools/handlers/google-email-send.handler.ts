/**
 * `google_email_send` handler — the Gmail boundary, client side.
 *
 * The agent composes a message; this handler renders it to the USER and waits.
 * It performs no send itself: <GmailReviewCard> shows the exact recipient,
 * subject and body, lets the user edit any of them, and only its Send button
 * calls the reviewed-send endpoint — with the bytes that were on screen at that
 * moment. Declining is a normal outcome, not an error.
 *
 * Why this lives on the client at all: the tool has NO server executor. Its
 * only `tool.binding` is to `matrx-user`, so there is no server path an agent
 * could take to send mail, and no argument it can set that stands in for the
 * user's consent.
 */

import type { ToolHandler, HandlerContext } from "./types";
import type {
  GoogleEmailSendArgs,
  GoogleEmailSendResult,
} from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
} from "../redux/pending-asks.slice";
import { registerAskResolver } from "../redux/ask-resolver-registry";
import { resolveGmailSendConnection } from "@/features/google-workspace/connection";

export const googleEmailSendHandler: ToolHandler<
  GoogleEmailSendArgs,
  GoogleEmailSendResult
> = {
  name: "google_email_send",
  async run(args, ctx: HandlerContext) {
    const { conversationId, callId, dispatch } = ctx;

    const mailbox = await resolveGmailSendConnection();
    if (!mailbox) {
      // A refusal the user can act on — never a silent failure, and never a send.
      return {
        sent: false,
        error:
          "No Google account with sending access is connected. Connect one at " +
          "Settings → Integrations → Google Workspace, then ask again.",
      };
    }

    const cc = (args.cc ?? []).map((entry) => entry.trim()).filter(Boolean);
    dispatch(
      enqueuePendingAsk({
        callId,
        conversationId,
        toolName: "google_email_send",
        kind: "email_review",
        email: {
          connectionId: mailbox.connectionId,
          fromEmail: mailbox.accountEmail,
          to: args.to.trim(),
          cc,
          subject: args.subject,
          body: args.body,
        },
        status: "pending",
        createdAtMs: Date.now(),
      }),
    );

    const response = await new Promise<typeof EMPTY_ASK_RESPONSE>((resolve) => {
      registerAskResolver(callId, resolve);
    });

    dispatch(resolvePendingAsk({ callId, conversationId }));
    queueMicrotask(() => {
      setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
    });

    if (response.cancelled) {
      return { sent: false, cancelled: true };
    }
    if (!response.confirmed) {
      return { sent: false, declined: true };
    }
    const data = (response.data ?? {}) as Record<string, unknown>;
    const failure = typeof data.error === "string" ? data.error : null;
    if (failure) return { sent: false, error: failure };

    return {
      sent: true,
      message_id: typeof data.message_id === "string" ? data.message_id : undefined,
      to: typeof data.to === "string" ? data.to : undefined,
      cc: Array.isArray(data.cc) ? (data.cc as string[]) : undefined,
      subject: typeof data.subject === "string" ? data.subject : undefined,
      edited: data.edited === true,
      from_email: mailbox.accountEmail,
    };
  },
};
