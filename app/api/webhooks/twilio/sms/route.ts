/**
 * POST /api/webhooks/twilio/sms
 *
 * Twilio inbound SMS/MMS webhook handler.
 * Receives messages, validates signature, stores in DB,
 * and responds with TwiML.
 */

import { NextResponse } from "next/server";
import twilio from "twilio";
import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  claimInboundSmsReceipt,
  classifySmsPolicyKeyword,
  honorUnresolvedSmsPolicyKeyword,
  completeInboundSmsReceipt,
  isPhoneNumberOptedOut,
  parseInboundSmsPayload,
  processInboundSms,
  releaseInboundSmsReceipt,
  resolveSmsInboundContext,
} from "@/lib/sms/receive";
import { isSmsCommandCandidate } from "@/lib/sms/identity";

const WEBHOOK_PATH = "/api/webhooks/twilio/sms";

export async function POST(request: Request) {
  let claimedReceiptId: string | null = null;
  try {
    // Validate Twilio signature
    const {
      valid,
      params,
      error: validationError,
    } = await validateTwilioWebhook(request, WEBHOOK_PATH);

    if (!valid) {
      console.error("Twilio webhook validation failed:", validationError);
      return new NextResponse("Forbidden", { status: 403 });
    }

    const payload = parseInboundSmsPayload(params);
    const twiml = new twilio.twiml.MessagingResponse();
    const receipt = await claimInboundSmsReceipt(payload);
    claimedReceiptId = receipt.receiptId;
    if (!receipt.processable) {
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const context = await resolveSmsInboundContext(payload);
    const policyKeyword = classifySmsPolicyKeyword(payload);

    if (context.status !== "resolved") {
      // 🚨 An opt-out is honored even when we cannot bind the sender to a
      // person. Resolution failing means we do not know WHO texted us; it
      // never means we may ignore a STOP. Classifying the keyword before this
      // branch is the whole point -- it used to happen after, so a STOP from
      // any un-enrolled number reached the authority never.
      const honored = policyKeyword
        ? await honorUnresolvedSmsPolicyKeyword(
            payload,
            policyKeyword,
            receipt.providerEventKey,
          )
        : false;
      await completeInboundSmsReceipt(
        receipt.receiptId,
        null,
        honored
          ? `${context.status}:${context.reason}:honored_${policyKeyword}`
          : `${context.status}:${context.reason}`,
      );
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // START/STOP/HELP must be stored before opt-out enforcement so the existing
    // consent trigger and canonical CRM adapter can reconcile the user's choice.
    if (policyKeyword) {
      await processInboundSms(payload, {
        receipt,
        context,
        aiProcessingStatus: "skipped",
        skipReason: `policy_keyword_${policyKeyword}`,
      });
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const optedOut = await isPhoneNumberOptedOut(
      context.source,
      context.organizationId,
    );
    if (optedOut) {
      await completeInboundSmsReceipt(
        receipt.receiptId,
        null,
        "sender_opted_out",
      );
      return new NextResponse(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // This boundary resolves the verified person/program only. The worker
    // resolves sms.owner_beta through canonical Mandate Bindings; transport
    // preference rows and conversation snapshots may never choose the Holder.
    const assistantReady =
      context.assistantEnabled && context.agentMessagesEnabled;
    const commandCandidate = isSmsCommandCandidate(payload.Body);
    await processInboundSms(payload, {
      receipt,
      context,
      aiProcessingStatus: commandCandidate
        ? "skipped"
        : assistantReady
          ? "pending"
          : "skipped",
      skipReason: commandCandidate
        ? "sms_command_offer_unverified"
        : assistantReady
          ? undefined
          : "assistant_not_configured_or_paused",
      commandCandidate,
    });

    // For AI agent conversations, we don't send an immediate auto-reply
    // since the AI will respond asynchronously. For other cases,
    // we can send a confirmation. This is handled downstream.
    // The TwiML response is kept empty to avoid double-messaging.

    // Return empty TwiML (no auto-reply in the webhook itself)
    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("Error processing inbound SMS webhook:", err);

    if (claimedReceiptId) {
      await releaseInboundSmsReceipt(
        claimedReceiptId,
        err instanceof Error
          ? err.message
          : "Unknown inbound SMS processing error",
      );
    }
    const twiml = new twilio.twiml.MessagingResponse();
    return new NextResponse(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
      status: claimedReceiptId ? 500 : 400,
    });
  }
}

/**
 * GET /api/webhooks/twilio/sms
 * Endpoint info for debugging.
 */
export async function GET() {
  return NextResponse.json({
    webhook: "Twilio Inbound SMS Webhook",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    description: "Receives inbound SMS/MMS from Twilio and processes them.",
    documentation:
      "https://www.twilio.com/docs/messaging/guides/webhook-request",
  });
}
