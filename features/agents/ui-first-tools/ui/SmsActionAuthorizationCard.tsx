"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackendApiError } from "@/lib/api/errors";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { AgentCardShell } from "./AgentCardShell";
import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  cancelPendingAsk,
  resolvePendingAsk,
} from "../redux/pending-asks.slice";
import { redactSmsActionArguments } from "../sms-action-authorization";

export function SmsActionAuthorizationCard({ ask }: { ask: PendingAsk }) {
  const dispatch = useAppDispatch();
  const email = useAppSelector((state) => state.userAuth.email);
  const authorization = ask.smsActionAuthorization;
  const [working, setWorking] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!authorization) return null;
  const exactAuthorization = authorization;

  async function confirmOnServer() {
    return apiPost(
      buildPath(
        "/communications/sms/action-authorizations/{call_id}/confirm",
        { call_id: ask.callId },
      ),
      { confirm: true },
    );
  }

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
      await confirmOnServer();
      finishApproval();
    } catch (cause) {
      if (cause instanceof BackendApiError && cause.status === 401 && email) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (otpError) setError(otpError.message);
        else setOtpSent(true);
      } else {
        setError(cause instanceof Error ? cause.message : "Approval failed");
      }
    } finally {
      setWorking(false);
    }
  }

  async function verifyAndApprove() {
    if (!email || !otp.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: "email",
      });
      if (verifyError) throw verifyError;
      await confirmOnServer();
      finishApproval();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
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

  return (
    <AgentCardShell
      tone="warning"
      icon={ShieldCheck}
      eyebrow="Text assistant"
      title="Confirm action"
      subtitle={exactAuthorization.side_effect_class.replaceAll("_", " ")}
      pending={working}
      aria-label={`Confirm ${ask.toolName}`}
    >
      <div className="space-y-3 text-sm">
        <p>
          Your text assistant requested <strong>{ask.toolName}</strong>. Approval
          applies only to these exact arguments and expires after 15 minutes.
        </p>
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(
            redactSmsActionArguments(ask.smsActionArguments ?? {}),
            null,
            2,
          )}
        </pre>
        {otpSent ? (
          <div className="space-y-2">
            <p>Enter the verification code sent to {email}.</p>
            <Input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Verification code"
            />
            <Button onClick={verifyAndApprove} disabled={working || !otp.trim()}>
              Verify and approve
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={approve} disabled={working}>
              Approve exact action
            </Button>
            <Button variant="outline" onClick={decline} disabled={working}>
              Decline
            </Button>
          </div>
        )}
        {error ? <p className="text-destructive">{error}</p> : null}
      </div>
    </AgentCardShell>
  );
}
