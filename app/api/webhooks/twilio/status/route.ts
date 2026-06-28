/**
 * POST /api/webhooks/twilio/status
 *
 * Twilio message status callback handler.
 * Updates message delivery status in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook } from '@/lib/sms/validate';
import { createAdminClient } from '@/utils/supabase/adminClient';
import type { StatusCallbackPayload } from '@/lib/sms/types';

const WEBHOOK_PATH = '/api/webhooks/twilio/status';

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
    const { valid, params, error: validationError } = await validateTwilioWebhook(request, WEBHOOK_PATH);

    if (!valid) {
      console.error('Twilio status callback validation failed:', validationError);
      return new NextResponse('Forbidden', { status: 403 });
    }

    const payload = params as unknown as StatusCallbackPayload;
    const supabase = createAdminClient();

    // Log webhook
    await supabase.schema('communication').from('sms_webhook_logs').insert({
      webhook_type: 'status_callback',
      twilio_sid: payload.MessageSid,
      raw_payload: payload as unknown as Record<string, unknown>,
      processed: false,
    });

    // Find the message by Twilio SID
    const { data: existingMessage } = await supabase
      .schema('communication').from('sms_messages')
      .select('id, status')
      .eq('twilio_sid', payload.MessageSid)
      .single();

    if (!existingMessage) {
      // Message not found — could be a message we didn't originate
      // Just log and return OK
      console.warn('Status callback for unknown message:', payload.MessageSid);
      return new NextResponse('OK', { status: 200 });
    }

    // Only update if the new status is more advanced in the lifecycle
    const currentOrder = STATUS_ORDER[existingMessage.status] ?? -1;
    const newOrder = STATUS_ORDER[payload.MessageStatus] ?? -1;

    if (newOrder > currentOrder) {
      const updateData: Record<string, unknown> = {
        status: payload.MessageStatus,
      };

      if (payload.ErrorCode) {
        updateData.error_code = payload.ErrorCode;
      }
      if (payload.ErrorMessage) {
        updateData.error_message = payload.ErrorMessage;
      }

      await supabase
        .schema('communication').from('sms_messages')
        .update(updateData)
        .eq('id', existingMessage.id);
    }

    // Mark webhook as processed
    await supabase
      .schema('communication').from('sms_webhook_logs')
      .update({ processed: true })
      .eq('twilio_sid', payload.MessageSid)
      .eq('webhook_type', 'status_callback');

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('Error processing status callback:', err);
    // Return 200 to prevent retries for application-level errors
    return new NextResponse('OK', { status: 200 });
  }
}

/**
 * GET /api/webhooks/twilio/status
 * Endpoint info for debugging.
 */
export async function GET() {
  return NextResponse.json({
    webhook: 'Twilio Message Status Callback',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    description: 'Receives delivery status updates for outbound messages.',
    statuses: ['queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed'],
    documentation: 'https://www.twilio.com/docs/messaging/guides/webhook-request#statusCallback',
  });
}
