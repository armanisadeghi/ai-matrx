/** @jest-environment node */

import {
  parseTwilioInboundVoiceRequest,
  parseTwilioVoiceLifecycleEvent,
} from "@/lib/communications/providers/twilio/voice";
import { buildStaticVoiceTestTwiml } from "@/lib/communications/providers/twilio/voice-twiml";
import { shouldApplyCallLifecycleEvent } from "@/lib/communications/voice/lifecycle";

describe("Twilio Voice provider adapter", () => {
  test("validates the minimum signed inbound call identity", () => {
    expect(
      parseTwilioInboundVoiceRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    ).toEqual({
      ok: true,
      value: {
        accountSid: "AC123",
        callSid: "CA123",
        from: "+14155550100",
        to: "+14158059951",
        direction: "inbound",
      },
    });
    expect(parseTwilioInboundVoiceRequest({ CallSid: "CA123" })).toEqual({
      ok: false,
      error: "Missing Twilio Voice field: AccountSid",
    });
  });

  test("returns branded disclosure TwiML without recording or a long-lived connection", () => {
    const twiml = buildStaticVoiceTestTwiml();

    expect(twiml).toContain("A.I. Matrix");
    expect(twiml).toContain("A.I.-powered test line");
    expect(twiml).toContain("may be recorded and reviewed");
    expect(twiml).toContain("phone webhook is working correctly");
    expect(twiml).toContain("<Hangup/>");
    expect(twiml).not.toContain("<Record");
    expect(twiml).not.toContain("<Connect");
    expect(twiml).not.toContain("<Stream");
  });

  test("creates a stable provider-scoped lifecycle key", () => {
    const parsed = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "in-progress",
      SequenceNumber: "2",
      Timestamp: "Sat, 15 Aug 2026 20:00:00 +0000",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        provider: "twilio",
        providerAccountId: "AC123",
        providerCallId: "CA123",
        providerEventKey: "twilio:voice:AC123:CA123:2:in_progress",
        sequence: 2,
        status: "in_progress",
        occurredAt: "Sat, 15 Aug 2026 20:00:00 +0000",
      },
    });
  });

  test("rejects duplicate, out-of-order, regressive, and post-terminal events", () => {
    const initiated = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "initiated",
      SequenceNumber: "0",
    });
    const ringing = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "ringing",
      SequenceNumber: "1",
    });
    const lateInitiated = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "initiated",
      SequenceNumber: "2",
    });
    const completed = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "completed",
      SequenceNumber: "3",
    });
    const lateRinging = parseTwilioVoiceLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      CallStatus: "ringing",
      SequenceNumber: "4",
    });
    if (
      !initiated.ok ||
      !ringing.ok ||
      !lateInitiated.ok ||
      !completed.ok ||
      !lateRinging.ok
    ) {
      throw new Error("test fixtures must parse");
    }

    expect(shouldApplyCallLifecycleEvent(null, initiated.value)).toBe(true);
    expect(shouldApplyCallLifecycleEvent(initiated.value, ringing.value)).toBe(true);
    expect(shouldApplyCallLifecycleEvent(ringing.value, ringing.value)).toBe(false);
    expect(shouldApplyCallLifecycleEvent(ringing.value, initiated.value)).toBe(false);
    expect(shouldApplyCallLifecycleEvent(ringing.value, lateInitiated.value)).toBe(false);
    expect(shouldApplyCallLifecycleEvent(ringing.value, completed.value)).toBe(true);
    expect(shouldApplyCallLifecycleEvent(completed.value, lateRinging.value)).toBe(false);
  });

  test("rejects unknown statuses and invalid sequence numbers", () => {
    expect(
      parseTwilioVoiceLifecycleEvent({
        AccountSid: "AC123",
        CallSid: "CA123",
        CallStatus: "mystery",
        SequenceNumber: "0",
      }),
    ).toEqual({
      ok: false,
      error: "Unsupported Twilio Voice status: mystery",
    });
    expect(
      parseTwilioVoiceLifecycleEvent({
        AccountSid: "AC123",
        CallSid: "CA123",
        CallStatus: "ringing",
        SequenceNumber: "one",
      }),
    ).toEqual({
      ok: false,
      error: "Invalid Twilio Voice SequenceNumber",
    });
  });
});
