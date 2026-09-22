/**
 * SMS Sending Service
 *
 * Handles outbound SMS/MMS via Twilio.
 * All outbound messages are logged to sms_messages.
 */

import { getTwilioClient, getMessagingServiceSid, getAppBaseUrl } from './client';
import { createAdminClient } from '@/utils/supabase/adminClient';
import type { SendSmsOptions, SendSmsResult } from './types';
import { extractErrorMessage } from "@/utils/errors";
import { formatSmsBody } from '@/features/sms/compliance';
import { isPhoneNumberOptedOut } from './receive';

/**
 * Send an SMS message via Twilio Messaging Service.
 * Logs the message to the database and returns the Twilio SID.
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  const { to, body, from, mediaUrl, statusCallback, messagingServiceSid } = options;

  try {
    const client = getTwilioClient();
    const baseUrl = getAppBaseUrl();

    type MessageCreateParams = Parameters<typeof client.messages.create>[0];

    const createParams: MessageCreateParams = {
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

    const message = await client.messages.create(createParams);

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
  const brandedSendOptions = {
    ...sendOptions,
    body: formatSmsBody(sendOptions.body),
  };

  // Resolve org from the parent conversation (the message belongs to its org).
  // This happens BEFORE the send, because the suppression check below needs it.
  const { data: parentConversation } = await supabase
    .schema('communication').from('sms_conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .single();
  // 🚨 THE MESSAGE TAKES ITS PARENT CONVERSATION'S ORGANIZATION, AND REFUSES
  // WHEN THE PARENT CANNOT BE READ. The third argument used to be a preference
  // rather than a requirement, so an unreadable or missing conversation sent
  // the row to the SENDER'S personal workspace instead of the thread's tenant.
  // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
  const organizationId = parentConversation?.organization_id ?? "";
  if (!organizationId) {
    return {
      success: false,
      error:
        "That SMS conversation could not be read, so nothing was sent. Reopen the conversation and try again.",
    };
  }

  // 🚨 THE SUPPRESSION CHECK LIVES HERE, in the one Twilio chokepoint, because
  // a check a caller can skip will eventually be skipped. Every outbound SMS in
  // the app funnels through this function, and until 2026-08-20 none of them
  // read suppression at all — a number that texted STOP yesterday could be
  // texted again today, which under 47 C.F.R. 64.1200(a)(10) is an unhonored
  // revocation and, because we held the opt-out in our own database, the
  // textbook willfulness fact ($1,500/message trebled rather than $500).
  //
  // This reads crm.contact_medium, THE ONE SUPPRESSION AUTHORITY that
  // crm.honor_consent_decision() writes, so an opt-out on ANY channel stops
  // this send. It is deliberately a refusal, never a silent drop.
  if (await isPhoneNumberOptedOut(brandedSendOptions.to, organizationId)) {
    const error = `Refused: ${brandedSendOptions.to} has opted out of messages from this organization.`;
    console.error(error);
    await supabase.schema('communication').from('sms_messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      twilio_sid: null,
      direction: 'outbound',
      from_number: brandedSendOptions.from || '',
      to_number: brandedSendOptions.to,
      body: brandedSendOptions.body,
      status: 'failed',
      error_code: 'suppressed',
      error_message: error,
      num_media: 0,
      media_urls: null,
      sent_by_user_id: sentByUserId ?? null,
      sent_by_type: sentByType,
    });
    return { success: false, error, errorCode: 'suppressed' };
  }

  // Send via Twilio
  const result = await sendSms(brandedSendOptions);

  // Log to database regardless of success/failure
  const { error: dbError } = await supabase.schema('communication').from('sms_messages').insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    twilio_sid: result.sid ?? null,
    direction: 'outbound',
    // MATRX-EXCEPTION: from_number is NOT NULL with no DB default; "" is the
    // deliberate sentinel when a Messaging Service (not an explicit from
    // number) picked the sender — matches Twilio's own semantics.
    from_number: brandedSendOptions.from || '',
    to_number: brandedSendOptions.to,
    body: brandedSendOptions.body,
    status: result.success ? (result.status || 'queued') : 'failed',
    error_code: result.errorCode ?? null,
    error_message: result.error ?? null,
    num_media: brandedSendOptions.mediaUrl?.length ?? 0,
    media_urls: brandedSendOptions.mediaUrl ?? null,
    sent_by_user_id: sentByUserId ?? null,
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

  // 🚨 THE ENROLMENT NAMES THE ORGANIZATION (2026-09-19 ruling; corrected in
  // the 2026-09-19 review). This used to be
  // `resolveOrgIdForUserServer(supabase, userId)` — the notified person's
  // PERSONAL workspace, an organization nobody chose, stamped onto the
  // notification log and the suppression check by the server.
  //
  // It never had to be resolved from the person at all. The enrolment row we
  // are about to read IS org-scoped:
  // `communication.sms_notification_preferences.organization_id` is NOT NULL
  // (verified live 2026-09-19). So the preferences read moves ABOVE the
  // organization, and the row the send is acting on names where it belongs.
  // No preferences row means no send, which was already the answer — it now
  // also means there is no organization question to get wrong.
  const { data: prefs } = await supabase
    .schema('communication').from('sms_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!prefs || !prefs.sms_enabled || !prefs.phone_number) {
    return { success: false, error: 'SMS notifications not enabled for this user' };
  }

  // All rows written below belong to the organization the person enrolled in.
  const organizationId = prefs.organization_id;

  // Suppression is the veto, and it outranks every category — including
  // `system`. It is read from `crm.contact_medium` (THE ONE SUPPRESSION STORE),
  // so a STOP texted to any of our numbers, an email unsubscribe, and a spoken
  // do-not-call all stop this send. Consent, checked below, is the separate
  // question of whether they ever said yes.
  if (await isPhoneNumberOptedOut(prefs.phone_number, organizationId)) {
    await supabase.schema('communication').from('sms_notifications').insert({
      organization_id: organizationId,
      user_id: userId,
      notification_type: notificationType,
      category,
      reference_type: referenceType,
      reference_id: referenceId,
      status: 'blocked_opt_out',
    });
    return { success: false, error: 'This number is suppressed — they asked us to stop.' };
  }

  // Check consent
  //
  // 🚨 A NOTIFICATION SEND REQUIRES `'notifications'` CONSENT — NOT A LEGACY ACCOUNT GRANT.
  // This gated on `['transactional', 'all']`, so a number that had only ever consented to
  // account TRANSACTIONS (or held the blanket legacy `'all'` token) silently authorized
  // workforce notifications — the exact inheritance the enable-path commit (77305f15bd,
  // "separate SMS notification consent") closed on the spine sender. This is the SECOND,
  // non-spine sender, and it never got the fix: `app/api/sms/preferences/route.ts` enables
  // notifications only on `.eq('consent_type', 'notifications')`, and the verify route
  // records that purpose row explicitly (its own comment: "keeps legacy account SMS consent
  // from silently authorizing workforce notifications"). This now sits on the same basis.
  // `'all'` is dropped on both branches deliberately — a blanket/legacy grant is precisely
  // what must not authorize a purpose-gated send.
  const consentBasis = category === 'marketing' ? ['marketing'] : ['notifications'];
  const { data: consent } = await supabase
    .schema('communication').from('sms_consent')
    .select('status')
    .eq('phone_number', prefs.phone_number)
    .in('consent_type', consentBasis)
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
    // 🚨 THE ENROLMENT'S TIMEZONE CAN BE NULL, AND THAT IS THE POINT (aidream
    // migration 1020). It used to be NOT NULL DEFAULT 'America/New_York', so
    // this line judged everybody's night on a New York clock they never chose.
    // A person who has not declared a zone now reads NULL, and
    // `toLocaleString({ timeZone: null })` throws a RangeError — so ask the
    // canonical ladder, `communication.person_notification_window`, which is
    // where this whole check belongs (0998) and which reaches the person's
    // other channels, their profile, their work location and the org knob
    // before giving up. Only when NOTHING on that ladder answers do we fall to
    // UTC, and we say so: a guessed clock that nobody is told about is a
    // quiet-hours window silently applied at the wrong hour.
    let zone = prefs.timezone ?? null;
    if (!zone) {
      const { data: rungs } = await supabase
        .schema('communication')
        .rpc('person_notification_window', {
          p_user_id: userId,
          p_organization_id: prefs.organization_id,
          p_channel: 'sms',
        });
      zone = rungs?.[0]?.timezone ?? null;
    }
    if (!zone) {
      console.error(
        `[sms] no timezone on any rung for user ${userId} (org ${prefs.organization_id}); ` +
        `judging quiet hours in UTC. Remedy: the person declares one in their SMS ` +
        `settings, the Chief of Staff's onboarding ask records one, or the ` +
        `organization sets communication.notifications/default_timezone.`,
      );
      zone = 'UTC';
    }
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: zone }));
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

    if (!defaultNumber?.phone_number) {
      console.error('No active default outbound SMS number configured');
      return { success: false, error: 'No outbound SMS number configured' };
    }
    const ourNumber = defaultNumber.phone_number;

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
