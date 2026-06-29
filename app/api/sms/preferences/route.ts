/**
 * GET /api/sms/preferences
 * PUT /api/sms/preferences
 *
 * User SMS notification preferences.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { ensureOrgIdServer } from '@/lib/organizations/personalOrg';
import { normalizePhoneNumber } from '@/lib/sms/phoneUtils';

/**
 * GET /api/sms/preferences
 * Get the current user's SMS notification preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();

    const { data, error } = await adminSupabase
      .schema('communication').from('sms_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No preferences yet — return defaults
      return NextResponse.json({
        success: true,
        msg: 'Default preferences (not yet configured)',
        data: {
          user_id: user.id,
          phone_number: null,
          sms_enabled: false,
          dm_notifications: false,
          task_notifications: false,
          job_completion_notifications: false,
          system_alerts: false,
          marketing_messages: false,
          ai_agent_messages: true,
          quiet_hours_enabled: true,
          quiet_hours_start: '21:00',
          quiet_hours_end: '08:00',
          timezone: 'America/New_York',
          max_messages_per_hour: 10,
          max_messages_per_day: 50,
        },
      });
    }

    if (error) {
      return NextResponse.json(
        { success: false, msg: 'Failed to fetch preferences', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Preferences fetched',
      data,
    });
  } catch (err) {
    console.error('Error in preferences GET:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sms/preferences
 * Update the current user's SMS notification preferences.
 */
export async function PUT(request: NextRequest) {
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
    const adminSupabase = createAdminClient();

    // Allowlisted fields
    const allowedFields = [
      'phone_number', 'sms_enabled',
      'dm_notifications', 'task_notifications',
      'job_completion_notifications', 'system_alerts',
      'marketing_messages', 'ai_agent_messages',
      'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
      'timezone', 'max_messages_per_hour', 'max_messages_per_day',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Normalize phone number if provided
    if (updateData.phone_number && typeof updateData.phone_number === 'string') {
      updateData.phone_number = normalizePhoneNumber(updateData.phone_number);
    }

    // Upsert preferences (scoped to the user's personal org)
    const organizationId = await ensureOrgIdServer(supabase, undefined);
    const { data, error } = await adminSupabase
      .schema('communication').from('sms_notification_preferences')
      .upsert(
        { user_id: user.id, organization_id: organizationId, ...updateData },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, msg: 'Failed to update preferences', error: error.message },
        { status: 500 }
      );
    }

    // If they enabled SMS and provided a phone number, ensure consent record exists
    if (updateData.sms_enabled && updateData.phone_number) {
      await adminSupabase.schema('communication').from('sms_consent').upsert(
        {
          phone_number: updateData.phone_number as string,
          user_id: user.id,
          organization_id: organizationId,
          consent_type: 'transactional',
          status: 'opted_in',
          opted_in_at: new Date().toISOString(),
          opt_in_method: 'web_form',
        },
        { onConflict: 'phone_number,consent_type' }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Preferences updated',
      data,
    });
  } catch (err) {
    console.error('Error in preferences PUT:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
