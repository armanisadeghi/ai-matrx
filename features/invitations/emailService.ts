// features/invitations/emailService.ts
// Email service for invitation request approval/rejection notifications

import { sendEmail, emailTemplates } from '@/lib/email/client';

interface ApprovalEmailOptions {
  fullName: string;
  email: string;
  invitationCode: string;
}

interface RejectionEmailOptions {
  fullName: string;
  email: string;
  reason?: string;
}

/**
 * Send approval email with invitation code
 */
export async function sendInvitationRequestApprovalEmail(
  options: ApprovalEmailOptions
): Promise<{ success: boolean; error?: any }> {
  const { fullName, email, invitationCode } = options;

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com';
    const signupUrl = `${siteUrl}/sign-up?invitation=${encodeURIComponent(invitationCode)}`;

    const emailTemplate = emailTemplates.invitationRequestApproved(
      fullName,
      invitationCode,
      signupUrl
    );

    const result = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return result;
  } catch (error) {
    console.error('Error sending approval email:', error);
    return { success: false, error };
  }
}

/**
 * Send rejection email
 */
export async function sendInvitationRequestRejectionEmail(
  options: RejectionEmailOptions
): Promise<{ success: boolean; error?: any }> {
  const { fullName, email, reason } = options;

  try {
    const emailTemplate = emailTemplates.invitationRequestRejected(
      fullName,
      reason
    );

    const result = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return result;
  } catch (error) {
    console.error('Error sending rejection email:', error);
    return { success: false, error };
  }
}
