// features/landing/actions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
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
): Promise<ActionResponse<{ requestId: string }>> {
  try {
    // Use standard server client - RLS policies allow both anon and authenticated inserts
    const supabase = await createClient();

    // Validate required fields
    if (!data.full_name || !data.company || !data.email || !data.use_case || !data.user_type) {
      return { success: false, error: 'All required fields must be filled' };
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .schema('users').from('invitation_requests')
      .select('id, status')
      .eq('email', data.email.toLowerCase().trim())
      .single();

    if (existing) {
      // If they already have a pending or approved request, return that ID
      if (existing.status === 'pending' || existing.status === 'approved') {
        return { 
          success: true, 
          data: { requestId: existing.id }
        };
      }
      // If rejected, they can resubmit
      if (existing.status === 'rejected') {
        const { data: updated, error: updateError } = await supabase
          .schema('users').from('invitation_requests')
          .update({
            ...data,
            email: data.email.toLowerCase().trim(),
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
        const confirmationTemplate = emailTemplates.invitationRequestReceived(data.full_name);
        sendEmail({
          to: data.email.toLowerCase().trim(),
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
        ...data,
        email: data.email.toLowerCase().trim(),
        step_completed: 1,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating invitation request:', error);
      return { success: false, error: 'Failed to submit request. Please try again.' };
    }

    // Send confirmation email to user (non-blocking)
    const confirmationTemplate = emailTemplates.invitationRequestReceived(data.full_name);
    sendEmail({
      to: data.email.toLowerCase().trim(),
      subject: confirmationTemplate.subject,
      html: confirmationTemplate.html,
    }).catch(err => console.error('Failed to send confirmation email:', err));

    // Send admin notification email (non-blocking)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@aimatrx.com';
    const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.aimatrx.com'}/administration/invitation-requests`;
    const adminTemplate = emailTemplates.invitationRequestAdminNotification(
      data.full_name,
      data.email,
      data.company,
      data.use_case,
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
    // Use standard server client - RLS policies allow both anon and authenticated inserts
    const supabase = await createClient();

    // Update the existing request with step 2 data
    const { error } = await supabase
      .schema('users').from('invitation_requests')
      .update({
        ...data,
        step_completed: 2,
      })
      .eq('id', requestId);

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
): Promise<ActionResponse<{ valid: boolean; codeId?: string }>> {
  try {
    // Use public client with anon key - RLS policies allow anonymous validation
    const supabase = await createClient();

    // Clean the code (remove spaces, uppercase)
    const cleanCode = code.trim().toUpperCase().replace(/\s/g, '');

    // Check if code exists and is valid
    const { data, error } = await supabase
      .schema('users').from('invitation_codes')
      .select('id, code, status, max_uses, current_uses, expires_at')
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
      data: { valid: true, codeId: data.id } 
    };
  } catch (error) {
    console.error('Unexpected error in validateInvitationCode:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Mark invitation code as used (called after successful signup)
 * This should be called from the signup flow with authenticated user
 */
export async function markInvitationCodeUsed(
  code: string,
  userId: string
): Promise<ActionResponse> {
  try {
    // Use public client - this will be called during signup with the invitation code
    const supabase = await createClient();

    const cleanCode = code.trim().toUpperCase().replace(/\s/g, '');

    // Use the helper function from the migration
    const { data, error } = await supabase.rpc('mark_invitation_code_used', {
      p_code: cleanCode,
      p_user_id: userId,
    });

    const success = data as unknown as boolean;
    if (error || !success) {
      console.error('Error marking invitation code as used:', error);
      return { success: false, error: 'Failed to process invitation code.' };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error('Unexpected error in markInvitationCodeUsed:', error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

