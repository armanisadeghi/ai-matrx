/** Typed Twilio Voice request adapters. No domain policy or persistence lives here. */

import type {
  CallLifecycleEvent,
  CallLifecycleStatus,
} from "@/lib/communications/voice/lifecycle";

export interface TwilioInboundVoiceRequest {
  accountSid: string;
  callSid: string;
  from: string;
  to: string;
  direction: string;
}

export type VoiceParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const TWILIO_STATUS_MAP: Record<string, CallLifecycleStatus> = {
  initiated: "initiated",
  ringing: "ringing",
  "in-progress": "in_progress",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "canceled",
};

function requiredParam(
  params: Record<string, string>,
  name: string,
): VoiceParseResult<string> {
  const value = params[name]?.trim();
  return value
    ? { ok: true, value }
    : { ok: false, error: `Missing Twilio Voice field: ${name}` };
}

export function parseTwilioInboundVoiceRequest(
  params: Record<string, string>,
): VoiceParseResult<TwilioInboundVoiceRequest> {
  const accountSid = requiredParam(params, "AccountSid");
  if (!accountSid.ok) return accountSid;
  const callSid = requiredParam(params, "CallSid");
  if (!callSid.ok) return callSid;
  const to = requiredParam(params, "To");
  if (!to.ok) return to;

  return {
    ok: true,
    value: {
      accountSid: accountSid.value,
      callSid: callSid.value,
      from: params.From?.trim() || "anonymous",
      to: to.value,
      direction: params.Direction?.trim() || "inbound",
    },
  };
}

export function twilioVoiceLifecycleEventKey(input: {
  accountSid: string;
  callSid: string;
  sequence: number;
  status: CallLifecycleStatus;
}): string {
  return `twilio:voice:${input.accountSid}:${input.callSid}:${input.sequence}:${input.status}`;
}

export function parseTwilioVoiceLifecycleEvent(
  params: Record<string, string>,
): VoiceParseResult<CallLifecycleEvent> {
  const accountSid = requiredParam(params, "AccountSid");
  if (!accountSid.ok) return accountSid;
  const callSid = requiredParam(params, "CallSid");
  if (!callSid.ok) return callSid;
  const rawStatus = requiredParam(params, "CallStatus");
  if (!rawStatus.ok) return rawStatus;
  const status = TWILIO_STATUS_MAP[rawStatus.value];
  if (!status) {
    return {
      ok: false,
      error: `Unsupported Twilio Voice status: ${rawStatus.value}`,
    };
  }

  const rawSequence = requiredParam(params, "SequenceNumber");
  if (!rawSequence.ok) return rawSequence;
  const sequence = Number(rawSequence.value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    return { ok: false, error: "Invalid Twilio Voice SequenceNumber" };
  }

  const value: CallLifecycleEvent = {
    provider: "twilio",
    providerAccountId: accountSid.value,
    providerCallId: callSid.value,
    sequence,
    status,
    occurredAt: params.Timestamp?.trim() || null,
    providerEventKey: twilioVoiceLifecycleEventKey({
      accountSid: accountSid.value,
      callSid: callSid.value,
      sequence,
      status,
    }),
  };
  return { ok: true, value };
}
