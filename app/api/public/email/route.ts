/**
 * Public Email API Route
 *
 * Handles sending emails to unauthenticated users (e.g., public chat)
 * Rate limited via Upstash Redis (5 emails per IP per hour)
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/client';
import { markdownToEmailHtml } from '@/lib/email/exportService';
import { getPublicEmailRatelimiter } from '@/lib/rate-limit/client';
import { ipRateLimit } from '@/lib/rate-limit/helpers';

export async function POST(request: NextRequest) {
  try {
    // Check if email is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { success: false, msg: 'Email not configured' },
        { status: 500 }
      );
    }

    // Rate limit: 5 emails per IP per hour
    const rateLimited = await ipRateLimit(request, getPublicEmailRatelimiter());
    if (rateLimited) {
      return NextResponse.json(
        { success: false, msg: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { to, subject, content, isMarkdown } = body;

    // Validate input
    if (!to || !subject || !content) {
      return NextResponse.json(
        { success: false, msg: 'Missing required fields: to, subject, content' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { success: false, msg: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Convert content to HTML if markdown
    let html: string;
    if (isMarkdown) {
      html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">AI Response</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
              Saved from AI Matrx
            </p>
          </div>
          ${markdownToEmailHtml(content)}
          <div style="margin-top: 24px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px;">
              Sent from <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://aimatrx.com'}" style="color: #3b82f6; text-decoration: none;">AI Matrx</a>
            </p>
          </div>
        </div>
      `;
    } else {
      html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
            <pre style="white-space: pre-wrap; word-wrap: break-word;">${content}</pre>
          </div>
        </div>
      `;
    }

    // Send email
    const result = await sendEmail({
      to,
      subject,
      html,
      text: content,
    });

    if (!result.success) {
      console.error('Public email send error:', result.error);
      return NextResponse.json(
        { success: false, msg: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Email sent successfully',
    });
  } catch (error: unknown) {
    console.error('Error sending public email:', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return NextResponse.json(
      { success: false, msg: message },
      { status: 500 }
    );
  }
}
