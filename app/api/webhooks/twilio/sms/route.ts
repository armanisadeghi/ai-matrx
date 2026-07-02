/**
 * POST /api/webhooks/twilio/sms
 *
 * Twilio inbound SMS/MMS webhook handler.
 * Receives messages, validates signature, stores in DB,
 * and responds with TwiML.
 */

import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { validateTwilioWebhook } from '@/lib/sms/validate';
import { processInboundSms, isPhoneNumberOptedOut } from '@/lib/sms/receive';
import type { InboundSmsPayload } from '@/lib/sms/types';

const WEBHOOK_PATH = '/api/webhooks/twilio/sms';

export async function POST(request: NextRequest) {
  try {
    // Validate Twilio signature
    const { valid, params, error: validationError } = await validateTwilioWebhook(request, WEBHOOK_PATH);

    if (!valid) {
      console.error('Twilio webhook validation failed:', validationError);
      return new NextResponse('Forbidden', { status: 403 });
    }

    const payload = params as InboundSmsPayload;
    const twiml = new twilio.twiml.MessagingResponse();

    // Check if sender is opted out
    const optedOut = await isPhoneNumberOptedOut(payload.From);
    if (optedOut) {
      // Twilio handles STOP/START keywords at the carrier level too,
      // but we double-check in our DB
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Process the inbound message (store in DB, create/find conversation)
    const result = await processInboundSms(payload);

    // For AI agent conversations, we don't send an immediate auto-reply
    // since the AI will respond asynchronously. For other cases,
    // we can send a confirmation. This is handled downstream.
    // The TwiML response is kept empty to avoid double-messaging.

    // Return empty TwiML (no auto-reply in the webhook itself)
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('Error processing inbound SMS webhook:', err);

    // Return 200 to prevent Twilio from retrying on application errors
    // (we've already logged the webhook payload to sms_webhook_logs)
    const twiml = new twilio.twiml.MessagingResponse();
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

/**
 * GET /api/webhooks/twilio/sms
 * Endpoint info for debugging.
 */
export async function GET() {
  return NextResponse.json({
    webhook: 'Twilio Inbound SMS Webhook',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    description: 'Receives inbound SMS/MMS from Twilio and processes them.',
    documentation: 'https://www.twilio.com/docs/messaging/guides/webhook-request',
  });
}
