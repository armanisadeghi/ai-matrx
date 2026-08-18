"use client";

/**
 * GmailReviewCard — the Gmail consent surface (kind:"email_review").
 *
 * THIS CARD IS THE AUTHORIZATION. The agent proposed a message; nothing has
 * been sent, and nothing can be until the user presses Send here. Everything
 * that will leave their mailbox is on screen and editable: sender, recipient,
 * CC, subject, body. The send posts exactly what the fields hold at that
 * moment — never the agent's original arguments once the user has changed them.
 *
 * Deliberately absent: any "always send" affordance, any pre-checked consent,
 * and any path that sends without a click. Approval here covers ONE message.
 */

import { useState } from "react";
import { Send, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelPendingAsk,
  resolvePendingAsk,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelAskByCallId,
  resolveAskByCallId,
} from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "@/features/agents/ui-first-tools/tools/schemas";
import { AgentCardShell } from "@/features/agents/ui-first-tools/ui/AgentCardShell";
import { sendReviewedGmail } from "@/features/google-workspace/service";
import { extractErrorMessage } from "@/utils/errors";

interface GmailReviewCardProps {
  ask: PendingAsk;
}

function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function GmailReviewCard({ ask }: GmailReviewCardProps) {
  const dispatch = useAppDispatch();
  const draft = ask.email;

  const [to, setTo] = useState(draft?.to ?? "");
  const [cc, setCc] = useState((draft?.cc ?? []).join(", "));
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defensive: an email_review ask always carries its draft.
  if (!draft) return null;

  const resolved = ask.status !== "pending";
  const edited =
    to !== draft.to ||
    cc !== draft.cc.join(", ") ||
    subject !== draft.subject ||
    body !== draft.body;
  const canSend = to.trim().includes("@") && subject.trim() && body.trim();

  function finish(response: Parameters<typeof resolveAskByCallId>[1]) {
    resolveAskByCallId(ask.callId, response);
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  async function send() {
    if (!draft || sending || !canSend) return;
    setSending(true);
    setError(null);
    const ccList = parseAddressList(cc);
    try {
      // The exact bytes on screen — not the agent's arguments.
      const messageId = await sendReviewedGmail({
        connectionId: draft.connectionId,
        to: to.trim(),
        cc: ccList,
        subject,
        body,
      });
      finish({
        ...EMPTY_ASK_RESPONSE,
        confirmed: true,
        data: {
          message_id: messageId,
          to: to.trim(),
          cc: ccList,
          subject,
          edited,
        },
      });
    } catch (cause) {
      const message = extractErrorMessage(cause);
      setError(message);
      setSending(false);
    }
  }

  function decline() {
    finish({ ...EMPTY_ASK_RESPONSE, confirmed: false });
  }

  function dismiss() {
    cancelAskByCallId(ask.callId);
    dispatch(
      cancelPendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        Nothing sends until you press Send.
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={decline} disabled={sending}>
          Don&apos;t send
        </Button>
        <Button size="sm" onClick={send} disabled={sending || !canSend}>
          <Send className="mr-1.5 h-4 w-4" />
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );

  return (
    <AgentCardShell
      tone="info"
      icon={Send}
      eyebrow="Review before sending"
      title={subject.trim() || "No subject"}
      subtitle={
        draft.fromEmail
          ? `From ${draft.fromEmail} — your connected Google account`
          : "From your connected Google account"
      }
      onDismiss={dismiss}
      dismissLabel="Dismiss without sending"
      footer={footer}
      pending={resolved}
      aria-label="Review the email before sending"
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-to-${ask.callId}`}>To</Label>
          <Input
            id={`gmail-to-${ask.callId}`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-cc-${ask.callId}`}>
            Cc <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`gmail-cc-${ask.callId}`}
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Separate addresses with commas"
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-subject-${ask.callId}`}>Subject</Label>
          <Input
            id={`gmail-subject-${ask.callId}`}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-body-${ask.callId}`}>Message</Label>
          <Textarea
            id={`gmail-body-${ask.callId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            disabled={sending}
            className="text-base"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error} Nothing was sent.
          </p>
        ) : null}
        <a
          href="/user-settings/integrations/google-workspace"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Manage or disconnect this Google account
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </AgentCardShell>
  );
}
