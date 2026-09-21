/**
 * SMS Verification Service
 *
 * Handles phone number verification via Twilio Verify.
 * This complements Supabase's built-in phone auth — use this for
 * standalone phone verification outside of the auth flow
 * (e.g., verifying a notification phone number).
 */

import { getTwilioClient, getVerifyServiceSid } from './client';
import type { VerificationResult } from './types';
import { extractErrorMessage } from "@/utils/errors";
import {
  checkTestHandsetVerification,
  isDesignatedTestHandset,
  sendTestHandsetVerification,
} from "@/lib/sms/test-handset-otp";

/**
 * Send a verification code to a phone number.
 * @param phoneNumber - E.164 format (+1234567890)
 * @param channel - 'sms' or 'call'
 */
export async function sendVerification(
  phoneNumber: string,
  channel: 'sms' | 'call' = 'sms'
): Promise<VerificationResult> {
  try {
    // 🚨 STRUCTURAL BRANCH, NOT A KNOB. A designated loopback test handset
    // cannot enroll through Twilio Verify at all: Verify redacts the code in
    // the Messages API AND never fires the destination number's inbound
    // webhook, so nothing we can build reads it back (both measured
    // 2026-09-21). Designated handsets therefore take the same six-digit code,
    // with the same single-use and expiry semantics, over our own Messaging
    // Service — where the webhook DOES deliver the real body. The consent rows
    // are still written by the ordinary flow in app/api/sms/verify/route.ts.
    // The ONLY way onto this path is the database designation; there is no
    // env var, flag or header that can put a real person's number on it.
    if (await isDesignatedTestHandset(phoneNumber)) {
      return await sendTestHandsetVerification(phoneNumber);
    }

    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();

    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({ to: phoneNumber, channel });

    return {
      success: true,
      status: verification.status,
    };
  } catch (err) {
    const error = extractErrorMessage(err);
    console.error('Failed to send verification:', error);
    return { success: false, error };
  }
}

/**
 * Check a verification code.
 * @param phoneNumber - E.164 format (+1234567890)
 * @param code - The 6-digit code entered by the user
 */
export async function checkVerification(
  phoneNumber: string,
  code: string
): Promise<VerificationResult> {
  try {
    // The same structural branch as sendVerification — a code issued by our
    // own Messaging Service must be checked against our own store, because
    // Twilio Verify never saw it.
    if (await isDesignatedTestHandset(phoneNumber)) {
      return await checkTestHandsetVerification(phoneNumber, code);
    }

    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();

    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    return {
      success: check.status === 'approved',
      status: check.status,
    };
  } catch (err) {
    const error = extractErrorMessage(err);
    console.error('Failed to check verification:', error);
    return { success: false, error };
  }
}
