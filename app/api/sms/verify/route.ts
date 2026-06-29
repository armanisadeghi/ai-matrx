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

    const body = await request.json();
    let { action, phoneNumber, code } = body;

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

        // Phone verified — update user's notification preferences
        const adminSupabase = createAdminClient();
        const organizationId = await ensureOrgIdServer(supabase, undefined);

        await adminSupabase
          .schema('communication').from('sms_notification_preferences')
          .upsert(
            {
              user_id: user.id,
              organization_id: organizationId,
              phone_number: phoneNumber,
              sms_enabled: true,
            },
            { onConflict: 'user_id' }
          );

        // Create consent record
        await adminSupabase.schema('communication').from('sms_consent').upsert(
          {
            phone_number: phoneNumber,
            user_id: user.id,
            organization_id: organizationId,
            consent_type: 'transactional',
            status: 'opted_in',
            opted_in_at: new Date().toISOString(),
            opt_in_method: 'web_form',
          },
          { onConflict: 'phone_number,consent_type' }
        );

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
