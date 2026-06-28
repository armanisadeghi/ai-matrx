/**
 * SMS Receiving Service
 *
 * Processes inbound SMS/MMS from Twilio webhooks.
 * Handles conversation lookup/creation, media download, and AI agent routing.
 */

import { createAdminClient } from '@/utils/supabase/adminClient';
import type { InboundSmsPayload, TwilioMediaAttachment } from './types';

/**
 * Extract media attachments from a Twilio inbound SMS payload.
 */
export function extractMediaAttachments(payload: InboundSmsPayload): TwilioMediaAttachment[] {
  const numMedia = parseInt(payload.NumMedia || '0', 10);
  const attachments: TwilioMediaAttachment[] = [];

  for (let i = 0; i < numMedia; i++) {
    const url = payload[`MediaUrl${i}`];
    const contentType = payload[`MediaContentType${i}`];
    if (url && contentType) {
      attachments.push({ url, contentType, index: i });
    }
  }

  return attachments;
}

/**
 * Find or create a conversation for an inbound message.
 */
export async function findOrCreateConversation(
  fromNumber: string,
  toNumber: string
): Promise<{ id: string; userId: string | null; isNew: boolean }> {
  const supabase = createAdminClient();

  // Look for existing active conversation
  const { data: existing } = await supabase
    .schema('communication').from('sms_conversations')
    .select('id, user_id')
    .eq('external_phone_number', fromNumber)
    .eq('our_phone_number', toNumber)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return { id: existing.id, userId: existing.user_id, isNew: false };
  }

  // Look up user by assigned phone number (our number -> user mapping)
  // or by the external number matching a user's registered phone
  const { data: phoneOwner } = await supabase
    .schema('communication').from('sms_phone_numbers')
    .select('user_id')
    .eq('phone_number', toNumber)
    .eq('is_active', true)
    .limit(1)
    .single();

  // Also check if the sender's number matches any user's notification preferences
  const { data: senderUser } = await supabase
    .schema('communication').from('sms_notification_preferences')
    .select('user_id')
    .eq('phone_number', fromNumber)
    .limit(1)
    .single();

  const userId = senderUser?.user_id || phoneOwner?.user_id || null;

  // Create new conversation
  const { data: newConv, error } = await supabase
    .schema('communication').from('sms_conversations')
    .insert({
      user_id: userId,
      external_phone_number: fromNumber,
      our_phone_number: toNumber,
      conversation_type: 'user_initiated',
    })
    .select('id, user_id')
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return { id: newConv.id, userId: newConv.user_id, isNew: true };
}

/**
 * Process and store an inbound SMS message.
 * Returns the message ID for further processing (e.g., AI agent).
 */
export async function processInboundSms(payload: InboundSmsPayload): Promise<{
  messageId: string;
  conversationId: string;
  userId: string | null;
  isNewConversation: boolean;
  hasMedia: boolean;
}> {
  const supabase = createAdminClient();

  // Log raw webhook data
  await supabase.schema('communication').from('sms_webhook_logs').insert({
    webhook_type: 'inbound_sms',
    twilio_sid: payload.MessageSid,
    raw_payload: payload as unknown as Record<string, unknown>,
    processed: false,
  });

  // Find or create conversation
  const conversation = await findOrCreateConversation(payload.From, payload.To);

  // Extract media
  const media = extractMediaAttachments(payload);
  const mediaUrls = media.map(m => m.url);
  const mediaContentTypes = media.map(m => m.contentType);

  // Insert message
  const { data: message, error: msgError } = await supabase
    .schema('communication').from('sms_messages')
    .insert({
      conversation_id: conversation.id,
      twilio_sid: payload.MessageSid,
      direction: 'inbound',
      from_number: payload.From,
      to_number: payload.To,
      body: payload.Body || '',
      status: 'received',
      num_segments: parseInt(payload.NumSegments || '1', 10),
      num_media: media.length,
      media_urls: mediaUrls,
      media_content_types: mediaContentTypes,
      sent_by_type: 'user',
      ai_processing_status: 'pending',
    })
    .select('id')
    .single();

  if (msgError) {
    throw new Error(`Failed to store inbound message: ${msgError.message}`);
  }

  // Store media records
  if (media.length > 0) {
    const mediaRecords = media.map(m => ({
      message_id: message.id,
      content_type: m.contentType,
      original_url: m.url,
    }));

    const { error: mediaError } = await supabase
      .schema('communication').from('sms_media')
      .insert(mediaRecords);

    if (mediaError) {
      console.error('Failed to store media records:', mediaError);
    }
  }

  // Mark webhook as processed
  await supabase
    .schema('communication').from('sms_webhook_logs')
    .update({ processed: true })
    .eq('twilio_sid', payload.MessageSid)
    .eq('webhook_type', 'inbound_sms');

  return {
    messageId: message.id,
    conversationId: conversation.id,
    userId: conversation.userId,
    isNewConversation: conversation.isNew,
    hasMedia: media.length > 0,
  };
}

/**
 * Check if a phone number is opted out.
 */
export async function isPhoneNumberOptedOut(phoneNumber: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .schema('communication').from('sms_consent')
    .select('status')
    .eq('phone_number', phoneNumber)
    .eq('status', 'opted_out')
    .limit(1);

  return (data && data.length > 0) || false;
}
