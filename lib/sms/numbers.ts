/**
 * Phone Number Management
 *
 * Purchase, assign, release, and list Twilio phone numbers.
 */

import { getTwilioClient, getAppBaseUrl } from './client';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { resolveOrgIdForUserServer } from '@/lib/organizations/personalOrg';
import type { PhoneNumberPurchaseOptions, PhoneNumberInfo } from './types';
import { extractErrorMessage } from "@/utils/errors";

/**
 * Search for available phone numbers to purchase.
 */
export async function searchAvailableNumbers(options: PhoneNumberPurchaseOptions = {}): Promise<PhoneNumberInfo[]> {
  const { areaCode, country = 'US', smsEnabled = true, mmsEnabled = true } = options;
  const client = getTwilioClient();

  const searchParams: Record<string, unknown> = {
    smsEnabled,
    mmsEnabled,
    limit: 20,
  };

  if (areaCode) {
    searchParams.areaCode = areaCode;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const numbers = await client.availablePhoneNumbers(country).local.list(searchParams as any);

  return numbers.map(n => ({
    sid: '',
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    capabilities: {
      sms: n.capabilities.sms ?? false,
      mms: n.capabilities.mms ?? false,
      voice: n.capabilities.voice ?? false,
    },
  }));
}

/**
 * Purchase a phone number and optionally assign it to a user.
 */
export async function purchasePhoneNumber(
  phoneNumber: string,
  userId?: string,
  friendlyName?: string
): Promise<{ success: boolean; data?: PhoneNumberInfo; error?: string }> {
  const client = getTwilioClient();
  const supabase = createAdminClient();
  const baseUrl = getAppBaseUrl();

  try {
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      smsUrl: `${baseUrl}/api/webhooks/twilio/sms`,
      smsMethod: 'POST',
      statusCallback: `${baseUrl}/api/webhooks/twilio/status`,
      statusCallbackMethod: 'POST',
      friendlyName: friendlyName || `AI Matrx - ${phoneNumber}`,
    });

    const numberInfo: PhoneNumberInfo = {
      sid: purchased.sid,
      phoneNumber: purchased.phoneNumber,
      friendlyName: purchased.friendlyName,
      capabilities: {
        sms: purchased.capabilities.sms ?? false,
        mms: purchased.capabilities.mms ?? false,
        voice: purchased.capabilities.voice ?? false,
      },
    };

    // Store in database — owned by the assigned user's org, or the system org
    // for a platform-owned (unassigned) number.
    const organizationId = await resolveOrgIdForUserServer(supabase, userId);
    const { error: dbError } = await supabase.schema('communication').from('sms_phone_numbers').insert({
      organization_id: organizationId,
      user_id: userId || null,
      phone_number: numberInfo.phoneNumber,
      twilio_sid: numberInfo.sid,
      friendly_name: numberInfo.friendlyName,
      capabilities: numberInfo.capabilities,
      number_type: 'local',
      is_active: true,
      assigned_at: userId ? new Date().toISOString() : null,
    });

    if (dbError) {
      console.error('Failed to store phone number in database:', dbError);
    }

    return { success: true, data: numberInfo };
  } catch (err) {
    const error = extractErrorMessage(err);
    console.error('Failed to purchase phone number:', error);
    return { success: false, error };
  }
}

/**
 * Assign an existing phone number to a user.
 */
export async function assignPhoneNumberToUser(
  phoneNumberId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .schema('communication').from('sms_phone_numbers')
    .update({
      user_id: userId,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', phoneNumberId)
    .is('user_id', null);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Release a phone number assignment (does not delete from Twilio).
 */
export async function releasePhoneNumber(
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .schema('communication').from('sms_phone_numbers')
    .update({
      user_id: null,
      released_at: new Date().toISOString(),
    })
    .eq('id', phoneNumberId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * List all phone numbers, optionally filtered.
 */
export async function listPhoneNumbers(options?: {
  userId?: string;
  isActive?: boolean;
}): Promise<PhoneNumberInfo[]> {
  const supabase = createAdminClient();

  let query = supabase
    .schema('communication').from('sms_phone_numbers')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }
  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list phone numbers:', error);
    return [];
  }

  return (data || []).map(n => ({
    sid: n.twilio_sid,
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name || n.phone_number,
    capabilities: n.capabilities as PhoneNumberInfo['capabilities'],
  }));
}

/**
 * Update webhook URLs for all owned phone numbers.
 * Useful after domain changes or initial setup.
 */
export async function updateAllWebhookUrls(): Promise<{ updated: number; errors: number }> {
  const client = getTwilioClient();
  const supabase = createAdminClient();
  const baseUrl = getAppBaseUrl();

  const { data: numbers } = await supabase
    .schema('communication').from('sms_phone_numbers')
    .select('twilio_sid')
    .eq('is_active', true);

  let updated = 0;
  let errors = 0;

  for (const num of numbers || []) {
    try {
      await client.incomingPhoneNumbers(num.twilio_sid).update({
        smsUrl: `${baseUrl}/api/webhooks/twilio/sms`,
        smsMethod: 'POST',
        statusCallback: `${baseUrl}/api/webhooks/twilio/status`,
        statusCallbackMethod: 'POST',
      });
      updated++;
    } catch (err) {
      console.error(`Failed to update webhook for ${num.twilio_sid}:`, err);
      errors++;
    }
  }

  return { updated, errors };
}
