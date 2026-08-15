/**
 * POST /api/webhooks/twilio/status
 *
 * Twilio message status callback handler.
 * Updates message delivery status in the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  matchesDurableTwilioAttempt,
  UUID_PATTERN,
} from "@/lib/communications/providers/twilio/status-correlation";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type { StatusCallbackPayload } from "@/lib/sms/types";
import type { TablesUpdate } from "@/types/database.types";

const WEBHOOK_PATH = "/api/webhooks/twilio/status";
// Status progression order — only update if the new status is "more advanced"
const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  accepted: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 5,
  failed: 5,
  read: 6,
};

export async function POST(request: NextRequest) {
  try {
    // Validate Twilio signature
    const {
      valid,
      params,
      error: validationError,
    } = await validateTwilioWebhook(request, WEBHOOK_PATH);

    if (!valid) {
      console.error(
        "Twilio status callback validation failed:",
        validationError,
      );
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (
      !params.MessageSid ||
      !params.MessageStatus ||
      !params.AccountSid ||
      !params.ApiVersion ||
      !params.From ||
      !params.To
    ) {
      console.error("Twilio status callback missing required fields:", params);
      return new NextResponse("Bad Request", { status: 400 });
    }

    const payload: StatusCallbackPayload = {
      MessageSid: params.MessageSid,
      MessageStatus: params.MessageStatus,
      AccountSid: params.AccountSid,
      From: params.From ?? "",
      To: params.To ?? "",
      ErrorCode: params.ErrorCode,
      ErrorMessage: params.ErrorMessage,
      ApiVersion: params.ApiVersion,
    };
    const outboundMessageId = request.nextUrl.searchParams.get("outboundMessageId");
    const supabase = createAdminClient();

    // Log webhook
    await supabase
      .schema("communication")
      .from("sms_webhook_logs")
      .insert({
        webhook_type: "status_callback",
        twilio_sid: payload.MessageSid,
        raw_payload: { ...payload, outboundMessageId },
        processed: false,
      });

    // Find the message by Twilio SID
    const { data: sidMessage } = await supabase
      .schema("communication")
      .from("sms_messages")
      .select("id, status, twilio_sid")
      .eq("twilio_sid", payload.MessageSid)
      .maybeSingle();

    let existingMessage = sidMessage;

    // A callback can beat the worker's accepted-result finalization. The
    // signed callback URL carries our durable outbound UUID specifically to
    // heal that crash window. Never trust the UUID alone: bind it back to the
    // Twilio account and address pair recorded before provider delivery.
    if (
      !existingMessage &&
      outboundMessageId &&
      UUID_PATTERN.test(outboundMessageId)
    ) {
      const { data: localMessage } = await supabase
        .schema("communication")
        .from("sms_messages")
        .select(
          "id, status, twilio_sid, provider, provider_account_id, from_number, to_number, direction",
        )
        .eq("id", outboundMessageId)
        .maybeSingle();

      const matchesSignedAttempt =
        localMessage !== null &&
        matchesDurableTwilioAttempt(localMessage, payload);

      if (matchesSignedAttempt && localMessage) {
        const { data: linkedMessage, error: linkError } = await supabase
          .schema("communication")
          .from("sms_messages")
          .update({
            twilio_sid: payload.MessageSid,
            claimed_at: null,
            lease_expires_at: null,
            processing_worker_id: null,
            outcome_uncertain_at: null,
            provider_status_at: new Date().toISOString(),
          })
          .eq("id", localMessage.id)
          .or(`twilio_sid.is.null,twilio_sid.eq.${payload.MessageSid}`)
          .select("id, status, twilio_sid")
          .maybeSingle();
        if (linkError) {
          console.error("Failed to correlate Twilio callback to local message:", linkError);
        }
        existingMessage = linkedMessage ?? {
          id: localMessage.id,
          status: localMessage.status,
          twilio_sid: localMessage.twilio_sid,
        };
      } else if (localMessage) {
        console.error(
          "Signed Twilio callback did not match the durable outbound attempt",
          { outboundMessageId, messageSid: payload.MessageSid },
        );
      }
    }

    if (!existingMessage) {
      // Message not found — could be a message we didn't originate
      // Just log and return OK
      console.warn("Status callback for unknown message:", payload.MessageSid);
      return new NextResponse("OK", { status: 200 });
    }

    // Any signed callback proves Twilio created this Message resource, even
    // when its status is equal to or behind our monotonic status. Clear a
    // stranded delivery lease independently of status progression.
    await supabase
      .schema("communication")
      .from("sms_messages")
      .update({
        twilio_sid: payload.MessageSid,
        claimed_at: null,
        lease_expires_at: null,
        processing_worker_id: null,
        outcome_uncertain_at: null,
        provider_status_at: new Date().toISOString(),
      })
      .eq("id", existingMessage.id)
      .or(`twilio_sid.is.null,twilio_sid.eq.${payload.MessageSid}`);

    // Only update if the new status is more advanced in the lifecycle
    const currentOrder = STATUS_ORDER[existingMessage.status] ?? -1;
    const newOrder = STATUS_ORDER[payload.MessageStatus] ?? -1;

    if (newOrder > currentOrder) {
      const updateData: TablesUpdate<
        { schema: "communication" },
        "sms_messages"
      > = {
        status: payload.MessageStatus,
        provider_status_at: new Date().toISOString(),
        claimed_at: null,
        lease_expires_at: null,
        processing_worker_id: null,
        outcome_uncertain_at: null,
      };

      if (payload.ErrorCode) {
        updateData.error_code = payload.ErrorCode;
      }
      if (payload.ErrorMessage) {
        updateData.error_message = payload.ErrorMessage;
      }

      await supabase
        .schema("communication")
        .from("sms_messages")
        .update(updateData)
        .eq("id", existingMessage.id);
    }

    // Mark webhook as processed
    await supabase
      .schema("communication")
      .from("sms_webhook_logs")
      .update({ processed: true })
      .eq("twilio_sid", payload.MessageSid)
      .eq("webhook_type", "status_callback");

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("Error processing status callback:", err);
    // Return 200 to prevent retries for application-level errors
    return new NextResponse("OK", { status: 200 });
  }
}

/**
 * GET /api/webhooks/twilio/status
 * Endpoint info for debugging.
 */
export async function GET() {
  return NextResponse.json({
    webhook: "Twilio Message Status Callback",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    description: "Receives delivery status updates for outbound messages.",
    statuses: [
      "queued",
      "accepted",
      "sending",
      "sent",
      "delivered",
      "undelivered",
      "failed",
    ],
    documentation:
      "https://www.twilio.com/docs/messaging/guides/webhook-request#statusCallback",
  });
}
