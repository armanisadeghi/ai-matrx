/** @jest-environment node */

import {
  parseTwilioInboundVoiceRequest,
  parseTwilioVoiceLifecycleEvent,
  parseTwilioVoiceRecordingLifecycleEvent,
} from "@/lib/communications/providers/twilio/voice";
import { buildStaticVoiceTestTwiml } from "@/lib/communications/providers/twilio/voice-twiml";
import { shouldApplyCallLifecycleEvent } from "@/lib/communications/voice/lifecycle";
import { shouldApplyCallRecordingLifecycleEvent } from "@/lib/communications/voice/recording-lifecycle";
import { evaluateVoiceRecordingReadiness } from "@/lib/communications/voice/recording-readiness";

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

  test("normalizes recording callbacks without promoting the provider URL", () => {
    expect(
      parseTwilioVoiceRecordingLifecycleEvent({
        AccountSid: "AC123",
        CallSid: "CA123",
        RecordingSid: "RE123",
        RecordingStatus: "completed",
        RecordingDuration: "42",
        RecordingChannels: "2",
        RecordingStartTime: "Sat, 15 Aug 2026 20:00:00 +0000",
        RecordingSource: "StartCallRecordingAPI",
        RecordingTrack: "both",
        RecordingUrl: "https://api.twilio.com/recordings/RE123",
      }),
    ).toEqual({
      ok: true,
      value: {
        provider: "twilio",
        providerAccountId: "AC123",
        providerCallId: "CA123",
        providerRecordingId: "RE123",
        providerEventKey: "twilio:voice-recording:AC123:RE123:completed",
        status: "completed",
        occurredAt: "Sat, 15 Aug 2026 20:00:00 +0000",
        durationSeconds: 42,
        channels: 2,
        source: "StartCallRecordingAPI",
        track: "both",
        providerMediaUrl: "https://api.twilio.com/recordings/RE123",
      },
    });
  });

  test("rejects malformed recording callback fields", () => {
    expect(
      parseTwilioVoiceRecordingLifecycleEvent({
        AccountSid: "AC123",
        CallSid: "CA123",
        RecordingSid: "RE123",
        RecordingStatus: "completed",
        RecordingChannels: "3",
      }),
    ).toEqual({
      ok: false,
      error: "Invalid Twilio Voice RecordingChannels",
    });
    expect(
      parseTwilioVoiceRecordingLifecycleEvent({
        AccountSid: "AC123",
        CallSid: "CA123",
        RecordingSid: "RE123",
        RecordingStatus: "unknown",
      }),
    ).toEqual({
      ok: false,
      error: "Unsupported Twilio Voice RecordingStatus: unknown",
    });
  });

  test("keeps recording lifecycle monotonic and terminal", () => {
    const inProgress = parseTwilioVoiceRecordingLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      RecordingSid: "RE123",
      RecordingStatus: "in-progress",
    });
    const completed = parseTwilioVoiceRecordingLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      RecordingSid: "RE123",
      RecordingStatus: "completed",
    });
    const failed = parseTwilioVoiceRecordingLifecycleEvent({
      AccountSid: "AC123",
      CallSid: "CA123",
      RecordingSid: "RE123",
      RecordingStatus: "failed",
    });
    if (!inProgress.ok || !completed.ok || !failed.ok) {
      throw new Error("test fixtures must parse");
    }

    expect(shouldApplyCallRecordingLifecycleEvent(null, inProgress.value)).toBe(true);
    expect(
      shouldApplyCallRecordingLifecycleEvent(inProgress.value, inProgress.value),
    ).toBe(false);
    expect(
      shouldApplyCallRecordingLifecycleEvent(inProgress.value, completed.value),
    ).toBe(true);
    expect(
      shouldApplyCallRecordingLifecycleEvent(completed.value, failed.value),
    ).toBe(false);
  });

  test("fails recording readiness closed until every gate passes", () => {
    const blocked = evaluateVoiceRecordingReadiness({
      owner_only_program_bound: true,
      disclosure_and_consent_verified: true,
      provider_email_verification_current: true,
      dedicated_storage_identity_ready: false,
      external_storage_configured: false,
      external_storage_canary_passed: false,
      lifecycle_persistence_ready: false,
      canonical_file_ingest_ready: false,
      retention_access_deletion_ready: false,
    });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockedReasons).toHaveLength(6);

    const ready = evaluateVoiceRecordingReadiness({
      owner_only_program_bound: true,
      disclosure_and_consent_verified: true,
      provider_email_verification_current: true,
      dedicated_storage_identity_ready: true,
      external_storage_configured: true,
      external_storage_canary_passed: true,
      lifecycle_persistence_ready: true,
      canonical_file_ingest_ready: true,
      retention_access_deletion_ready: true,
    });
    expect(ready).toMatchObject({
      ready: true,
      passedGateCount: 9,
      totalGateCount: 9,
      blockedReasons: [],
    });
  });
});
