/**
 * Email Service
 *
 * Handles sending emails via SMTP
 * Uses Nodemailer with your Gmail SMTP settings
 */

import { extractErrorMessage } from "@/utils/errors";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send an email using the API route
 * This calls /api/email/send which handles the actual SMTP connection
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  try {
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error: unknown = await response.json();
      return {
        success: false,
        error: extractErrorMessage(error) || 'Failed to send email',
      };
    }

    const result: { messageId?: string } = await response.json();
    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: extractErrorMessage(error) || 'Failed to send email',
    };
  }
}

/**
 * Send organization invitation email
 */
export async function sendOrganizationInvitationEmail(
  recipientEmail: string,
  organizationName: string,
  inviterName: string,
  role: string,
  invitationToken: string
): Promise<EmailResult> {
  const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com'}/invitations/organization/accept/${invitationToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>You're Invited to ${organizationName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited! 🎉</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on AI Matrx.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Organization:</strong> ${organizationName}</p>
          <p style="margin: 0;"><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Accept Invitation
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          This invitation will expire in 7 days. If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="font-size: 12px; color: #999; word-break: break-all; background: white; padding: 10px; border-radius: 4px;">
          ${invitationUrl}
        </p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
          If you don't want to join this organization, you can safely ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
You're Invited to ${organizationName}!

${inviterName} has invited you to join ${organizationName} on AI Matrx as a ${role}.

To accept this invitation, visit:
${invitationUrl}

This invitation will expire in 7 days.

If you don't want to join, you can safely ignore this email.
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `You've been invited to join ${organizationName}`,
    html,
    text,
  });
}

