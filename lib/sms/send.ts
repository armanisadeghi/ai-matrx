/**
 * SMS Sending Service
 *
 * Handles outbound SMS/MMS via Twilio.
 * All outbound messages are logged to sms_messages.
 */

import { getTwilioClient, getMessagingServiceSid, getAppBaseUrl } from './client';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { resolveOrgIdForUserServer } from '@/lib/organizations/personalOrg';
import type { SendSmsOptions, SendSmsResult } from './types';
import { extractErrorMessage } from "@/utils/errors";

/**
 * Send an SMS message via Twilio Messaging Service.
 * Logs the message to the database and returns the Twilio SID.
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  const { to, body, from, mediaUrl, statusCallback, messagingServiceSid } = options;

  try {
    const client = getTwilioClient();
    const baseUrl = getAppBaseUrl();

    const createParams: Record<string, unknown> = {
      body,
      to,
      statusCallback: statusCallback || `${baseUrl}/api/webhooks/twilio/status`,
    };

    // Use explicit 'from' number or fall back to Messaging Service
    if (from) {
      createParams.from = from;
    } else {
      createParams.messagingServiceSid = messagingServiceSid || getMessagingServiceSid();
    }

    if (mediaUrl && mediaUrl.length > 0) {
      createParams.mediaUrl = mediaUrl;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await client.messages.create(createParams as any);

    return {
      success: true,
      sid: message.sid,
      status: message.status,
    };
  } catch (err) {
    const error = extractErrorMessage(err);
    console.error('Failed to send SMS:', error);
    return {
      success: false,
      error,
      errorCode: (err as { code?: string })?.code,
    };
  }
}

/**
 * Send an SMS and log it to the database in one operation.
 */
export async function sendAndLogSms(options: SendSmsOptions & {
  conversationId: string;
  sentByUserId?: string;
  sentByType?: 'user' | 'system' | 'ai_agent' | 'admin' | 'notification' | 'auto_reply';
}): Promise<SendSmsResult> {
  const { conversationId, sentByUserId, sentByType = 'system', ...sendOptions } = options;
  const supabase = createAdminClient();

  // Send via Twilio
  const result = await sendSms(sendOptions);

  // Resolve org from the parent conversation (the message belongs to its org).
  const { data: parentConversation } = await supabase
    .schema('communication').from('sms_conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .single();
  const organizationId = await resolveOrgIdForUserServer(
    supabase,
    sentByUserId,
    parentConversation?.organization_id,
  );

  // Log to database regardless of success/failure
  const { error: dbError } = await supabase.schema('communication').from('sms_messages').insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    twilio_sid: result.sid || null,
    direction: 'outbound',
    from_number: sendOptions.from || '',
    to_number: sendOptions.to,
    body: sendOptions.body,
    status: result.success ? (result.status || 'queued') : 'failed',
    error_code: result.errorCode || null,
    error_message: result.error || null,
    num_media: sendOptions.mediaUrl?.length || 0,
    media_urls: sendOptions.mediaUrl || [],
    sent_by_user_id: sentByUserId || null,
    sent_by_type: sentByType,
  });

  if (dbError) {
    console.error('Failed to log SMS to database:', dbError);
  }

  return result;
}

/**
 * Send a notification SMS to a user (checks preferences and rate limits).
 */
export async function sendNotificationSms(options: {
  userId: string;
  body: string;
  notificationType: string;
  referenceType?: string;
  referenceId?: string;
  category?: 'transactional' | 'marketing' | 'system';
  mediaUrl?: string[];
}): Promise<SendSmsResult & { notificationId?: string }> {
  const { userId, body, notificationType, referenceType, referenceId, category = 'transactional', mediaUrl } = options;
  const supabase = createAdminClient();

  // All rows written below belong to the notified user's org.
  const organizationId = await resolveOrgIdForUserServer(supabase, userId);

  // Get user's SMS notification preferences
  const { data: prefs } = await supabase
    .schema('communication').from('sms_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!prefs || !prefs.sms_enabled || !prefs.phone_number) {
    return { success: false, error: 'SMS notifications not enabled for this user' };
  }

  // Check consent
  const { data: consent } = await supabase
    .schema('communication').from('sms_consent')
    .select('status')
    .eq('phone_number', prefs.phone_number)
    .in('consent_type', [category === 'marketing' ? 'marketing' : 'transactional', 'all'])
    .eq('status', 'opted_in')
    .limit(1)
    .single();

  if (!consent && category !== 'system') {
    // Log as blocked
    await supabase.schema('communication').from('sms_notifications').insert({
      organization_id: organizationId,
      user_id: userId,
      notification_type: notificationType,
      category,
      reference_type: referenceType,
      reference_id: referenceId,
      status: 'blocked_opt_out',
    });
    return { success: false, error: 'User has not consented to this message type' };
  }

  // Check quiet hours
  if (prefs.quiet_hours_enabled) {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: prefs.timezone }));
    const currentTime = `${String(userTime.getHours()).padStart(2, '0')}:${String(userTime.getMinutes()).padStart(2, '0')}`;
    const start = prefs.quiet_hours_start;
    const end = prefs.quiet_hours_end;

    const inQuietHours = start > end
      ? currentTime >= start || currentTime < end  // Overnight (e.g. 21:00-08:00)
      : currentTime >= start && currentTime < end;  // Same-day range

    if (inQuietHours && category !== 'system') {
      await supabase.schema('communication').from('sms_notifications').insert({
        organization_id: organizationId,
        user_id: userId,
        notification_type: notificationType,
        category,
        reference_type: referenceType,
        reference_id: referenceId,
        status: 'blocked_quiet_hours',
      });
      return { success: false, error: 'Message blocked by quiet hours' };
    }
  }

  // Check rate limits
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: hourlyCount } = await supabase
    .schema('communication').from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_number', prefs.phone_number)
    .eq('direction', 'outbound')
    .gte('created_at', oneHourAgo);

  if ((hourlyCount || 0) >= prefs.max_messages_per_hour) {
    await supabase.schema('communication').from('sms_notifications').insert({
      organization_id: organizationId,
      user_id: userId,
      notification_type: notificationType,
      category,
      reference_type: referenceType,
      reference_id: referenceId,
      status: 'blocked_rate_limit',
    });
    return { success: false, error: 'Hourly rate limit exceeded' };
  }

  // Find or create a notification conversation
  let { data: conversation } = await supabase
    .schema('communication').from('sms_conversations')
    .select('id, our_phone_number')
    .eq('user_id', userId)
    .eq('conversation_type', 'notification')
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!conversation) {
    // Get the default outbound number
    const { data: defaultNumber } = await supabase
      .schema('communication').from('sms_phone_numbers')
      .select('phone_number')
      .eq('is_active', true)
      .is('user_id', null)
      .limit(1)
      .single();

    const ourNumber = defaultNumber?.phone_number || '';

    const { data: newConv, error: convError } = await supabase
      .schema('communication').from('sms_conversations')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        external_phone_number: prefs.phone_number,
        our_phone_number: ourNumber,
        conversation_type: 'notification',
      })
      .select('id, our_phone_number')
      .single();

    if (convError) {
      console.error('Failed to create notification conversation:', convError);
      return { success: false, error: 'Failed to create conversation' };
    }
    conversation = newConv;
  }

  // Send the message
  const result = await sendAndLogSms({
    to: prefs.phone_number,
    from: conversation.our_phone_number || undefined,
    body,
    mediaUrl,
    conversationId: conversation.id,
    sentByType: 'notification',
  });

  // Log the notification
  const { data: notification } = await supabase.schema('communication').from('sms_notifications').insert({
    organization_id: organizationId,
    user_id: userId,
    message_id: null,
    notification_type: notificationType,
    category,
    reference_type: referenceType,
    reference_id: referenceId,
    status: result.success ? 'sent' : 'failed',
    failure_reason: result.error,
    sent_at: result.success ? new Date().toISOString() : null,
  }).select('id').single();

  return {
    ...result,
    notificationId: notification?.id,
  };
}
