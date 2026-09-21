/**
 * The durable inbound door for the two loopback TEST HANDSETS.
 *
 * WHY THIS EXISTS. The staff text battery has to read what a handset actually
 * received, not what we believe we sent. Twilio's Messages API is not good
 * enough for that on its own: it REDACTS the body of a Twilio Verify message
 * (a real OTP reads back as "**verification code is:**"), so a battery that
 * polls the API can never complete a verification. The inbound webhook is
 * delivered with the real `Body`, so we store it ourselves the moment it
 * arrives and let the battery read our own table.
 *
 * 🚨 THE FILTER IS THE SAFETY PROPERTY. A row is written ONLY when the `To`
 * number is a registered test handset (`communication.sms_phone_numbers` with
 * `program_key = 'ai_matrx_test_handset'`). Anything else is refused and
 * nothing is persisted — this door must never become a place a real person's
 * message can be read out of.
 *
 * The organization is carried EXPLICITLY, read off the handset's own
 * `sms_phone_numbers` row. No trigger and no resolver chooses it.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";

/** The one program key that marks a number as a loopback test handset. */
export const TEST_HANDSET_PROGRAM_KEY = "ai_matrx_test_handset";

/** Postgres unique-violation. The webhook is at-least-once; replay collapses. */
const UNIQUE_VIOLATION = "23505";

export interface InboundTestHandsetMessage {
  providerMessageSid: string;
  providerAccountSid: string | null;
  fromNumber: string;
  toNumber: string;
  body: string | null;
  numMedia: number;
  numSegments: number | null;
  webhookPath: string;
  rawPayload: Record<string, string>;
}

export type StoreInboundResult =
  | { stored: true; id: string; duplicate: boolean }
  | { stored: false; reason: "not_a_test_handset" | "write_failed"; detail?: string };

/**
 * Resolve the organization that owns a test-handset number.
 *
 * Returns null when the number is not a registered test handset — which is the
 * refusal signal, not an error.
 */
export async function resolveTestHandsetOrganization(
  toNumber: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("organization_id")
    .eq("phone_number", toNumber)
    .eq("program_key", TEST_HANDSET_PROGRAM_KEY)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data.organization_id ?? null;
}

/** Parse the Twilio inbound form into the shape we persist. */
export function parseInboundTestHandsetPayload(
  params: Record<string, string>,
  webhookPath: string,
): InboundTestHandsetMessage {
  const numMedia = Number.parseInt(params.NumMedia ?? "0", 10);
  const numSegments = Number.parseInt(params.NumSegments ?? "", 10);

  return {
    providerMessageSid: params.MessageSid ?? params.SmsSid ?? params.CallSid ?? "",
    providerAccountSid: params.AccountSid ?? null,
    fromNumber: params.From ?? "",
    toNumber: params.To ?? "",
    body: params.Body ?? null,
    numMedia: Number.isFinite(numMedia) ? numMedia : 0,
    numSegments: Number.isFinite(numSegments) ? numSegments : null,
    webhookPath,
    rawPayload: params,
  };
}

/**
 * Store one inbound test-handset message. Idempotent on the provider SID.
 *
 * Refuses — writing nothing — when the destination is not a registered test
 * handset.
 */
export async function storeInboundTestHandsetMessage(
  message: InboundTestHandsetMessage,
): Promise<StoreInboundResult> {
  const organizationId = await resolveTestHandsetOrganization(message.toNumber);
  if (!organizationId) {
    return { stored: false, reason: "not_a_test_handset" };
  }

  const supabase = createAdminClient();
  const row = {
    organization_id: organizationId,
    provider: "twilio",
    provider_message_sid: message.providerMessageSid,
    provider_account_sid: message.providerAccountSid,
    direction: "inbound",
    from_number: message.fromNumber,
    to_number: message.toNumber,
    body: message.body,
    num_media: message.numMedia,
    num_segments: message.numSegments,
    webhook_path: message.webhookPath,
    raw_payload: message.rawPayload,
  };

  const { data, error } = await supabase
    .schema("communication")
    .from("test_handset_inbox")
    .insert(row)
    .select("id")
    .single();

  if (!error && data) {
    return { stored: true, id: data.id, duplicate: false };
  }

  if (error?.code === UNIQUE_VIOLATION) {
    // Twilio retried. The first write is the row; report it rather than fail.
    const { data: existing } = await supabase
      .schema("communication")
      .from("test_handset_inbox")
      .select("id")
      .eq("provider", "twilio")
      .eq("provider_message_sid", message.providerMessageSid)
      .maybeSingle();
    if (existing) return { stored: true, id: existing.id, duplicate: true };
  }

  return {
    stored: false,
    reason: "write_failed",
    detail: error?.message ?? "insert returned no row",
  };
}
