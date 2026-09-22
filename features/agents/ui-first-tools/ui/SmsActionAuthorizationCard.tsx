"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackendApiError } from "@/lib/api/errors";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { useAppDispatch } from "@/lib/redux/hooks";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { AgentCardShell } from "./AgentCardShell";
import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  cancelPendingAsk,
  resolvePendingAsk,
} from "../redux/pending-asks.slice";
import { redactSmsActionArguments } from "../sms-action-authorization";

// THE TEXT SERVICE NEVER VERIFIES (Arman, 2026-09-22: "Absolutely no
// verifications is the RULE for this text service"). The person opened an
// authenticated door and is signed in as themselves; that IS the approval. This
// card therefore has exactly two outcomes, approve and decline, and no
// re-authentication step of any kind. Until 2026-09-22 a 401 from the confirm
// endpoint (its "recent sign-in" check) sent a Supabase email OTP — which
// arrives as a magic link, not a code — and the person was stuck. A 401 is now
// reported as what it is: a server-side defect, with the one honest remedy.
export function SmsActionAuthorizationCard({ ask }: { ask: PendingAsk }) {
  const dispatch = useAppDispatch();
  const authorization = ask.smsActionAuthorization;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authorization) return null;
  const exactAuthorization = authorization;

  function finishApproval() {
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
    dispatch(
      submitToolResult({
        conversationId: ask.conversationId,
        call_id: ask.callId,
        tool_name: ask.toolName,
        is_error: false,
        output: {
          authorization_confirmed: true,
          action_digest: exactAuthorization.action_digest,
          instruction: "Retry the identical tool call and arguments now.",
        },
      }),
    );
  }

  async function approve() {
    setWorking(true);
    setError(null);
    try {
      await apiPost(
        buildPath(
          "/communications/sms/action-authorizations/{call_id}/confirm",
          { call_id: ask.callId },
        ),
        { confirm: true },
      );
      finishApproval();
    } catch (cause) {
      if (cause instanceof BackendApiError && cause.status === 401) {
        setError(
          "The server did not accept your signed-in session for this approval. Reload the page and tap Approve again. If it fails a second time, this is a defect on our side, not something you need to verify.",
        );
      } else {
        setError(cause instanceof Error ? cause.message : "Approval failed");
      }
    } finally {
      setWorking(false);
    }
  }

  function decline() {
    dispatch(
      cancelPendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
    dispatch(
      submitToolResult({
        conversationId: ask.conversationId,
        call_id: ask.callId,
        tool_name: ask.toolName,
        is_error: true,
        output: { authorization_confirmed: false, reason: "user_declined" },
        error_message: "The user declined this consequential action.",
      }),
    );
  }

  const actions = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        className="min-h-11 w-full sm:w-auto"
        variant="outline"
        onClick={decline}
        disabled={working}
      >
        Decline
      </Button>
      <Button
        className="min-h-11 w-full sm:w-auto"
        onClick={approve}
        disabled={working}
      >
        Approve exact action
      </Button>
    </div>
  );

  return (
    <AgentCardShell
      tone="warning"
      icon={ShieldCheck}
      eyebrow="Text assistant"
      title="Confirm action"
      subtitle={exactAuthorization.side_effect_class.replaceAll("_", " ")}
      pending={working}
      footer={actions}
      aria-label={`Confirm ${ask.toolName}`}
    >
      <div className="space-y-3 text-sm">
        <p>
          Your text assistant requested <strong>{ask.toolName}</strong>. Approval
          applies only to these exact arguments and expires after 15 minutes.
        </p>
        {/* THE EXACT ARGUMENTS, as a document — never a JSON payload. This
            card asks a PERSON to authorize a side effect, so what it shows has
            to be readable by one: `StructuredValueView` is the platform's
            structured floor (humanized labels, prose through the markdown
            renderer, uniform lists as a table) with the raw data one click
            away for anyone who wants it. Same defect class as the surface-write
            approval card's JSON dump (cold walk 3, finding 4). The arguments
            carry no registered kind, so the floor is the whole answer here. */}
        <StructuredValueView
          value={redactSmsActionArguments(ask.smsActionArguments ?? {})}
        />
        {error ? <p className="text-destructive">{error}</p> : null}
      </div>
    </AgentCardShell>
  );
}
