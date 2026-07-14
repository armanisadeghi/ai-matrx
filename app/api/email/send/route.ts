/**
 * App email send (Resend API). Requires RESEND_API_KEY + EMAIL_FROM.
 * Auth email is Supabase SMTP — separate credential; see features/email/FEATURE.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getDefaultFromAddress } from '@/lib/email/client';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Check if email is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email not configured. Please set RESEND_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { to, subject, html, text, replyTo } = body;

    // Validate input
    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    // Send email
    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      replyTo,
    });

    if (!result.success) {
      console.error('Email send error:', result.error);
      return NextResponse.json(
        { 
          error: result.error instanceof Error ? result.error.message : 'Failed to send email',
        },
        { status: 500 }
      );
    }

    console.log('Email sent successfully');

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: unknown) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to send email',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
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
    emailFrom: getDefaultFromAddress() || 'not set',
  });
}

