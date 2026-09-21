/**
 * The one-time code path for the loopback TEST HANDSETS.
 *
 * WHY THIS EXISTS. A Twilio Verify code cannot be read back by anything we can
 * build — measured 2026-09-21, twice over:
 *   1. The Messages API REDACTS the body; a real OTP reads back as
 *      "**verification code is:**".
 *   2. A Verify message never fires the destination number's inbound webhook,
 *      so the code never reaches `communication.test_handset_inbox`. Proven by
 *      control: an ordinary message to the same handset DID fire it with the
 *      full real body.
 * So a designated test handset cannot enroll through Twilio Verify at all, and
 * the automated battery could never complete a real verification.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It is test INFRASTRUCTURE: the same
 * six-digit code with the same single-use and expiry semantics, sent over our
 * OWN Messaging Service so the inbound webhook delivers the real body. It is
 * NOT a weakening of consent — the consent rows are still written by the
 * ordinary verification flow in `app/api/sms/verify/route.ts`, which this
 * module does not touch.
 *
 * 🚨 THE ADMISSION IS STRUCTURAL, NOT A KNOB. There is no environment
 * variable, no flag and no header that puts a number on this path. The ONLY
 * way in is to be registered in `communication.sms_phone_numbers` under
 * `program_key = 'ai_matrx_test_handset'` — the same designation the
 * never-text-a-real-person guard reads. A number that is not designated cannot
 * take this path by any spelling of any request, which is what
 * `isDesignatedTestHandset` exists to guarantee and what its tests prove.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { TEST_HANDSET_PROGRAM_KEY } from "@/lib/sms/test-handset-inbox";

/** Matches Twilio Verify's own defaults, so the semantics do not drift. */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export interface TestHandsetOtpResult {
  success: boolean;
  status: "pending" | "approved" | "denied";
  error?: string;
}

function hashCode(salt: string, code: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/**
 * 🚨 THE ADMISSION GATE. True only for a number registered as a test handset.
 *
 * Read from the database every time — never a constant in this file — so
 * designating or retiring a handset is a data change, and this module can
 * never disagree with the guard about which numbers are handsets.
 */
export async function isDesignatedTestHandset(
  phoneNumber: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("phone_number, organization_id")
    .eq("phone_number", phoneNumber)
    .eq("program_key", TEST_HANDSET_PROGRAM_KEY)
    .is("deleted_at", null)
    .maybeSingle();

  // An error is NOT an admission. A lookup we could not complete means we do
  // not know the number is a handset, and the safe answer is "no".
  if (error || !data) return false;
  return true;
}

async function handsetOrganization(phoneNumber: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("organization_id")
    .eq("phone_number", phoneNumber)
    .eq("program_key", TEST_HANDSET_PROGRAM_KEY)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data.organization_id ?? null;
}

/**
 * Issue a six-digit code to a designated test handset over our own Messaging
 * Service, and store it hashed with a per-row salt.
 *
 * Refuses — sending nothing, storing nothing — for any number that is not a
 * designated test handset.
 */
export async function sendTestHandsetVerification(
  phoneNumber: string,
): Promise<TestHandsetOtpResult> {
  if (!(await isDesignatedTestHandset(phoneNumber))) {
    return {
      success: false,
      status: "denied",
      error: "not a designated test handset",
    };
  }

  const organizationId = await handsetOrganization(phoneNumber);
  if (!organizationId) {
    return {
      success: false,
      status: "denied",
      error: "test handset has no organization",
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  const supabase = createAdminClient();

  const { error: insertError } = await supabase
    .schema("communication")
    .from("test_handset_verification")
    .insert({
      organization_id: organizationId,
      phone_number: phoneNumber,
      code_salt: salt,
      code_hash: hashCode(salt, code),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
    });

  if (insertError) {
    return { success: false, status: "denied", error: insertError.message };
  }

  const sent = await sendOverMessagingService(
    phoneNumber,
    `AI Matrx: your verification code is: ${code}`,
  );
  if (!sent.ok) {
    return { success: false, status: "denied", error: sent.error };
  }

  return { success: true, status: "pending" };
}

async function sendOverMessagingService(
  to: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";

  if (!accountSid || !authToken || !messagingServiceSid) {
    return {
      ok: false,
      error:
        "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_MESSAGING_SERVICE_SID " +
        "must all be set to send a test-handset code.",
    };
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        MessagingServiceSid: messagingServiceSid,
        Body: body,
      }),
    },
  );

  if (!response.ok) {
    return { ok: false, error: `Twilio refused the send: ${await response.text()}` };
  }
  return { ok: true };
}

/**
 * Check a code against the newest live one for a designated test handset.
 *
 * Single-use and expiring, like Twilio Verify: a consumed code, an expired
 * code, and a code past OTP_MAX_ATTEMPTS all fail.
 */
export async function checkTestHandsetVerification(
  phoneNumber: string,
  code: string,
): Promise<TestHandsetOtpResult> {
  if (!(await isDesignatedTestHandset(phoneNumber))) {
    return {
      success: false,
      status: "denied",
      error: "not a designated test handset",
    };
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .schema("communication")
    .from("test_handset_verification")
    .select("id, code_salt, code_hash, expires_at, consumed_at, attempts")
    .eq("phone_number", phoneNumber)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { success: false, status: "denied", error: "no pending code" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { success: false, status: "denied", error: "code expired" };
  }

  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return { success: false, status: "denied", error: "too many attempts" };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashCode(row.code_salt, code), "hex");
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await supabase
      .schema("communication")
      .from("test_handset_verification")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);
    return { success: false, status: "pending", error: "incorrect code" };
  }

  // Single use: burn it in the same breath as approving it.
  await supabase
    .schema("communication")
    .from("test_handset_verification")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { success: true, status: "approved" };
}
