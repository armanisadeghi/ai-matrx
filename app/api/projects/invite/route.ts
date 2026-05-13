/**
 * Project Invitation API Route
 *
 * Handles creating project invitations and sending invitation emails.
 * Mirrors /api/organizations/invite/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';
import crypto from 'crypto';

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
    const { email, role, projectId } = body;

    if (!email || !role || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, role, projectId' },
        { status: 400 }
      );
    }

    const token = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invitation, error: insertError } = await supabase
      .from('ctx_project_invitations')
      .insert({
        project_id: projectId,
        email: email.toLowerCase().trim(),
        token,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'User already invited to this project' },
          { status: 409 }
        );
      }
      console.error('Error creating project invitation:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    // Fetch project + org details for email
    const { data: projectData } = await supabase
      .from('ctx_projects')
      .select('name, organization_id, organizations(name)')
      .eq('id', projectId)
      .single();

    if (!projectData) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const inviterName =
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Someone';

    const orgName = (projectData.organizations as { name?: string } | null)?.name ?? 'your organization';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.aimatrx.com';
    const invitationUrl = `${siteUrl}/invitations/project/accept/${token}`;

    const emailTemplate = emailTemplates.projectInvitation(
      projectData.name,
      orgName,
      inviterName,
      invitationUrl,
      expiresAt
    );

    const emailResult = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (emailResult.success) {
      await supabase
        .from('ctx_project_invitations')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', invitation.id);
    } else {
      console.warn('Failed to send project invitation email:', emailResult.error);
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      emailSent: emailResult.success,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process invitation';
    console.error('Error in POST /api/projects/invite:', error);
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

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}
