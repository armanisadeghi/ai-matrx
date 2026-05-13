/**
 * Organization Invitation API Route
 * 
 * Handles creating organization invitations and sending invitation emails
 * This must run on the server to access EMAIL_FROM and RESEND_API_KEY
 * 
 * Environment variables needed:
 * - RESEND_API_KEY=re_xxxxxxxxxxxx
 * - EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, role, organizationId } = body;

    // Validate input
    if (!email || !role || !organizationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, role, organizationId' },
        { status: 400 }
      );
    }

    // Generate secure token
    const token = crypto.randomUUID();

    // Set expiry (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation record
    const { data: invitation, error: insertError } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: organizationId,
        email: email.toLowerCase().trim(),
        token,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'User already invited to this organization' },
          { status: 409 }
        );
      }
      console.error('Error creating invitation:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    // Fetch organization details for the email
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    if (!orgData) {
      return NextResponse.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Get inviter details from current authenticated user
    const inviterName = user.user_metadata?.full_name 
      || user.user_metadata?.name 
      || user.email 
      || 'Someone';

    // Generate invitation URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com';
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${token}`;
    
    // Prepare email template
    const emailTemplate = emailTemplates.organizationInvitation(
      orgData.name,
      inviterName,
      invitationUrl,
      expiresAt
    );

    // Send invitation email
    const emailResult = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    // Update invitation record with email status
    if (emailResult.success) {
      await supabase
        .from('organization_invitations')
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq('id', invitation.id);
    } else {
      console.warn('Failed to send invitation email:', emailResult.error);
      // Don't fail the request if email fails - invitation is still created
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      emailSent: emailResult.success,
    });
  } catch (error: any) {
    console.error('Error in POST /api/organizations/invite:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to process invitation',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}
