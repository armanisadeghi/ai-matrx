// features/landing/actions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { SYSTEM_ORGANIZATION_ID } from '@/constants/platform-orgs';
import { sendEmail, emailTemplates } from '@/lib/email/client';
import { InvitationRequestStep1, InvitationRequestStep2 } from './types';

// Response types for actions
export type ActionResponse<T = void> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Submit Step 1 of invitation request (required fields)
 */
export async function submitInvitationRequestStep1(
  data: InvitationRequestStep1
): Promise<ActionResponse<{ requestId: string | null }>> {
  try {
    // This is a server-only, validated public-intake boundary. The ordinary
    // session client cannot safely return or update private applicant rows.
    const supabase = createAdminClient();
    const email = data.email.toLowerCase().trim();
    const request = {
      full_name: data.full_name.trim(),
      company: data.company.trim(),
      email,
      use_case: data.use_case.trim(),
      user_type: data.user_type,
      user_type_other: data.user_type_other?.trim() || null,
      organization_id: SYSTEM_ORGANIZATION_ID,
    };

    // Validate required fields
    if (!request.full_name || !request.company || !request.email || !request.use_case || !request.user_type) {
      return { success: false, error: 'All required fields must be filled' };
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .schema('users').from('invitation_requests')
      .select('id, status')
      .eq('email', email)
      .single();

    if (existing) {
      // Confirm receipt without exposing an existing private request ID to
      // someone who merely knows the applicant's email address.
      if (existing.status === 'pending' || existing.status === 'approved') {
        return { success: true, data: { requestId: null } };
      }
      // If rejected, they can resubmit
      if (existing.status === 'rejected') {
        const { data: updated, error: updateError } = await supabase
          .schema('users').from('invitation_requests')
          .update({
            ...request,
            status: 'pending',
            step_completed: 1,
          })
          .eq('id', existing.id)
          .select('id')
          .single();

        if (updateError) {
          console.error('Error updating invitation request:', updateError);
          return { success: false, error: 'Failed to update request. Please try again.' };
        }

        // Send confirmation email on resubmission (non-blocking)
        const confirmationTemplate = emailTemplates.invitationRequestReceived(request.full_name);
        sendEmail({
          to: email,
          subject: confirmationTemplate.subject,
          html: confirmationTemplate.html,
        }).catch(err => console.error('Failed to send confirmation email:', err));

        return { success: true, data: { requestId: updated.id } };
      }
    }

    // Create new invitation request
    const { data: newRequest, error } = await supabase
      .schema('users').from('invitation_requests')
      .insert({
        ...request,
        step_completed: 1,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating invitation request:', error);
      return { success: false, error: 'Failed to submit request. Please try again.' };
    }

    // Send confirmation email to user (non-blocking)
    const confirmationTemplate = emailTemplates.invitationRequestReceived(request.full_name);
    sendEmail({
      to: email,
      subject: confirmationTemplate.subject,
      html: confirmationTemplate.html,
    }).catch(err => console.error('Failed to send confirmation email:', err));

    // Send admin notification email (non-blocking)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@aimatrx.com';
    const adminUrl = 'https://manage.aimatrx.com/administration/users/invitations';
    const adminTemplate = emailTemplates.invitationRequestAdminNotification(
      request.full_name,
      request.email,
      request.company,
      request.use_case,
      newRequest.id,
      adminUrl
    );
    sendEmail({
      to: adminEmail,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
    }).catch(err => console.error('Failed to send admin notification email:', err));

    return { success: true, data: { requestId: newRequest.id } };
  } catch (error) {
    console.error('Unexpected error in submitInvitationRequestStep1:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Submit Step 2 of invitation request (optional fields)
 */
export async function submitInvitationRequestStep2(
  requestId: string,
  data: InvitationRequestStep2
): Promise<ActionResponse> {
  try {
    const supabase = createAdminClient();

    // Update the existing request with step 2 data
    const { error } = await supabase
      .schema('users').from('invitation_requests')
      .update({
        ...data,
        organization_id: SYSTEM_ORGANIZATION_ID,
        step_completed: 2,
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id')
      .single();

    if (error) {
      console.error('Error updating invitation request step 2:', error);
      return { success: false, error: 'Failed to complete request. Please try again.' };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error('Unexpected error in submitInvitationRequestStep2:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Validate an invitation code
 */
export async function validateInvitationCode(
  code: string
): Promise<ActionResponse<{ valid: boolean }>> {
  try {
    // Code rows are private credentials. Validate the exact candidate at this
    // server-only boundary; never make the code table enumerable to anon.
    const supabase = createAdminClient();

    // Clean the code (remove spaces, uppercase)
    const cleanCode = code.trim().toUpperCase().replace(/\s/g, '');

    // Check if code exists and is valid
    const { data, error } = await supabase
      .schema('users').from('invitation_codes')
      .select('status, max_uses, current_uses, expires_at')
      .eq('code', cleanCode)
      .single();

    if (error || !data) {
      return { 
        success: true, 
        data: { valid: false } 
      };
    }

    // Check if code is active
    if (data.status !== 'active') {
      return { 
        success: true, 
        data: { valid: false } 
      };
    }

    // Check if code has uses remaining
    if (data.current_uses >= data.max_uses) {
      return { 
        success: true, 
        data: { valid: false } 
      };
    }

    // Check if code is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { 
        success: true, 
        data: { valid: false } 
      };
    }

    return { 
      success: true, 
      data: { valid: true }
    };
  } catch (error) {
    console.error('Unexpected error in validateInvitationCode:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Mark an invitation code as used from a trusted server workflow.
 * No signup flow currently calls this helper.
 */
export async function markInvitationCodeUsed(
  code: string,
  userId: string
): Promise<ActionResponse> {
  try {
    // Code consumption is service-role-only. Keep the credential and the
    // mutation behind this server-action boundary.
    const supabase = createAdminClient();

    const cleanCode = code.trim().toUpperCase().replace(/\s/g, '');

    // Use the helper function from the migration
    const { data, error } = await supabase.rpc('mark_invitation_code_used', {
      p_code: cleanCode,
      p_user_id: userId,
    });

    if (error || !data) {
      console.error('Error marking invitation code as used:', error);
      return { success: false, error: 'Failed to process invitation code.' };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error('Unexpected error in markInvitationCodeUsed:', error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
