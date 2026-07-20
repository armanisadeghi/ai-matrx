/**
 * POST /api/sms/verify
 *
 * Phone number verification via Twilio Verify.
 * Used to verify a user's notification phone number
 * (separate from Supabase auth phone login).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { ensureOrgIdServer } from '@/lib/organizations/personalOrg';
import { sendVerification, checkVerification } from '@/lib/sms/verify';
import { normalizePhoneNumber, isValidE164 } from '@/lib/sms/phoneUtils';
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_CONSENT_VERSION,
  SMS_OPT_IN_PATH,
  SMS_PRIVACY_PATH,
  SMS_TERMS_PATH,
} from '@/features/sms/compliance';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Partial<{
      action: string;
      phoneNumber: string;
      code: string;
      consentAccepted: boolean;
      source: string;
    }>;
    let { action, phoneNumber } = body;
    const { code, consentAccepted, source } = body;

    if (!action || !phoneNumber) {
      return NextResponse.json(
        { success: false, msg: 'Missing required fields: action, phoneNumber' },
        { status: 400 }
      );
    }

    // Normalize phone number to E.164 format
    phoneNumber = normalizePhoneNumber(phoneNumber);

    // Validate E.164 format
    if (!isValidE164(phoneNumber)) {
      return NextResponse.json(
        { success: false, msg: 'Invalid phone number format. Use 10 digits (2125551234) or +1 format (+12125551234)' },
        { status: 400 }
      );
    }

    // Normalize action names (support both 'start'/'send' and 'verify'/'check')
    if (action === 'start') action = 'send';
    if (action === 'verify') action = 'check';

    if ((action === 'send' || action === 'check') && consentAccepted !== true) {
      return NextResponse.json(
        { success: false, msg: 'Explicit SMS consent is required before verification' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'send': {
        const result = await sendVerification(phoneNumber);

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: 'Failed to send verification', error: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Verification code sent',
          data: { status: result.status },
        });
      }

      case 'check': {
        if (!code) {
          return NextResponse.json(
            { success: false, msg: 'Missing verification code' },
            { status: 400 }
          );
        }

        const result = await checkVerification(phoneNumber, code);

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: 'Verification failed', error: result.error },
            { status: 400 }
          );
        }

        // Phone verified — persist the exact web-form consent contract before
        // enabling notification delivery.
        const adminSupabase = createAdminClient();
        const organizationId = await ensureOrgIdServer(supabase, undefined);
        const forwardedFor = request.headers.get('x-forwarded-for');
        const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;

        const { error: consentError } = await adminSupabase
          .schema('communication')
          .from('sms_consent')
          .upsert(
          {
            phone_number: phoneNumber,
            user_id: user.id,
            organization_id: organizationId,
            consent_type: 'transactional',
            status: 'opted_in',
            opted_in_at: new Date().toISOString(),
            opted_out_at: null,
            opt_in_method: 'web_form',
            ip_address: ipAddress,
            metadata: {
              consent_version: SMS_CONSENT_VERSION,
              disclosure: SMS_CONSENT_DISCLOSURE,
              opt_in_path: SMS_OPT_IN_PATH,
              privacy_path: SMS_PRIVACY_PATH,
              terms_path: SMS_TERMS_PATH,
              source: source === 'sms-demo' ? 'sms-demo' : 'settings',
              verification_channel: 'sms',
            },
          },
          { onConflict: 'phone_number,consent_type' }
        );

        if (consentError) {
          console.error('Failed to record verified SMS consent:', consentError);
          return NextResponse.json(
            { success: false, msg: 'Phone verified, but consent could not be recorded' },
            { status: 500 }
          );
        }

        const { error: preferencesError } = await adminSupabase
          .schema('communication')
          .from('sms_notification_preferences')
          .upsert(
            {
              user_id: user.id,
              organization_id: organizationId,
              phone_number: phoneNumber,
              sms_enabled: true,
            },
            { onConflict: 'user_id' }
          );

        if (preferencesError) {
          console.error('Failed to enable verified SMS preferences:', preferencesError);
          return NextResponse.json(
            { success: false, msg: 'Phone verified, but SMS preferences could not be enabled' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Phone number verified and SMS notifications enabled',
          data: { status: result.status, phoneNumber },
        });
      }

      default:
        return NextResponse.json(
          { success: false, msg: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error('Error in verify route:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
