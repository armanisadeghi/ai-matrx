/**
 * Resend Project Invitation API Route
 *
 * Handles resending project invitation emails with extended expiry.
 * Mirrors /api/organizations/invitations/resend/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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

    const body = await request.json();
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: invitationId' },
        { status: 400 }
      );
    }

    const { data: invitation, error: fetchError } = await supabase
      .from('ctx_project_invitations')
      .select('*, ctx_projects(name, organization_id, organizations(name))')
      .eq('id', invitationId)
      .single();

    if (fetchError || !invitation) {
      console.error('Error fetching project invitation:', fetchError);
      return NextResponse.json({ success: false, error: 'Invitation not found' }, { status: 404 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: updateError } = await supabase
      .from('ctx_project_invitations')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', invitationId);

    if (updateError) {
      console.error('Error updating project invitation expiry:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update invitation' },
        { status: 500 }
      );
    }

    const inviterName =
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Someone';

    const project = invitation.ctx_projects as { name?: string; organizations?: { name?: string } } | null;
    const projectName = project?.name ?? 'the project';
    const orgName = project?.organizations?.name ?? 'your organization';

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.aimatrx.com';
    const invitationUrl = `${siteUrl}/invitations/project/accept/${invitation.token}`;

    const emailTemplate = emailTemplates.projectInvitationReminder(
      projectName,
      orgName,
      inviterName,
      invitationUrl,
      expiresAt
    );

    const emailResult = await sendEmail({
      to: invitation.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (emailResult.success) {
      await supabase
      .from('ctx_project_invitations')
      .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', invitationId);
    } else {
      console.warn('Failed to resend project invitation email:', emailResult.error);
      return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation resent successfully',
      emailSent: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to resend invitation';
    console.error('Error in POST /api/projects/invitations/resend:', error);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
