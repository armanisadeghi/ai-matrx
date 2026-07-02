import { Resend } from "resend";

// Lazy initialization to avoid build-time errors when API key is not available
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Get the list of allowed email domains for sending
 * Uses EMAIL_ALLOWED_DOMAINS env var, or extracts domain from EMAIL_FROM
 */
export function getAllowedEmailDomains(): string[] {
  // If explicitly configured, use that
  if (process.env.EMAIL_ALLOWED_DOMAINS) {
    return process.env.EMAIL_ALLOWED_DOMAINS.split(",").map((d) => d.trim().toLowerCase());
  }
  
  // Otherwise, extract domain from EMAIL_FROM
  const emailFrom = process.env.EMAIL_FROM;
  if (emailFrom) {
    const match = emailFrom.match(/<([^>]+)>/) || emailFrom.match(/([^\s<>]+@[^\s<>]+)/);
    if (match) {
      const domain = match[1].split("@")[1];
      if (domain) return [domain.toLowerCase()];
    }
  }
  
  return [];
}

/**
 * Get the default from address. Undefined when EMAIL_FROM is not configured —
 * callers must handle that case explicitly rather than silently sending with
 * an empty/malformed From header.
 */
export function getDefaultFromAddress(): string | undefined {
  return process.env.EMAIL_FROM;
}

/**
 * Validate that a from address uses an allowed domain
 */
export function isValidFromAddress(from: string): boolean {
  const allowedDomains = getAllowedEmailDomains();
  if (allowedDomains.length === 0) return true; // No restrictions if not configured
  
  // Extract email from "Name <email>" format or plain email
  const match = from.match(/<([^>]+)>/) || from.match(/([^\s<>]+@[^\s<>]+)/);
  if (!match) return false;
  
  const email = match[1].toLowerCase();
  const domain = email.split("@")[1];
  
  return allowedDomains.includes(domain);
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send an email using Resend
 * Requires RESEND_API_KEY and EMAIL_FROM environment variables
 */
export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, html, text, from, replyTo } = options;

  const senderAddress = from || process.env.EMAIL_FROM;
  
  if (!senderAddress) {
    console.error("EMAIL_FROM environment variable is not set");
    return { success: false, error: new Error("EMAIL_FROM is not configured") };
  }

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: senderAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      replyTo,
    });

    if (error) {
      console.error("Email send error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Email send exception:", err);
    return { success: false, error: err };
  }
}

// Email templates
export const emailTemplates = {
  welcome: (name: string) => ({
    subject: "Welcome to AI Matrx!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Welcome to AI Matrx, ${name}!</h1>
        <p>We're excited to have you join our platform for advanced AI prompt engineering and collaboration.</p>
        <p>Here's what you can do next:</p>
        <ul>
          <li>Explore our prompt library</li>
          <li>Create your first canvas</li>
          <li>Collaborate with your team</li>
          <li>Organize your work with collections</li>
        </ul>
        <p>If you have any questions, don't hesitate to reach out.</p>
        <p>Best regards,<br>The AI Matrx Team</p>
      </div>
    `,
  }),

  organizationInvitation: (
    organizationName: string,
    inviterName: string,
    invitationUrl: string,
    expiresAt: Date
  ) => ({
    subject: `You've been invited to join ${organizationName} on AI Matrx`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Organization Invitation</h1>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on AI Matrx.</p>
        <p>AI Matrx is a powerful platform for AI prompt engineering, canvas creation, and team collaboration.</p>
        <div style="margin: 24px 0;">
          <a href="${invitationUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation will expire on ${expiresAt.toLocaleDateString()}.</p>
        <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `,
  }),

  projectInvitation: (
    projectName: string,
    organizationName: string,
    inviterName: string,
    invitationUrl: string,
    expiresAt: Date
  ) => ({
    subject: `You've been invited to join project "${projectName}" on AI Matrx`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Project Invitation</h1>
        <p><strong>${inviterName}</strong> has invited you to join project <strong>${projectName}</strong> in <strong>${organizationName}</strong> on AI Matrx.</p>
        <p>AI Matrx is a powerful platform for AI prompt engineering, canvas creation, and team collaboration.</p>
        <div style="margin: 24px 0;">
          <a href="${invitationUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation will expire on ${expiresAt.toLocaleDateString()}.</p>
        <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `,
  }),

  projectInvitationReminder: (
    projectName: string,
    organizationName: string,
    inviterName: string,
    invitationUrl: string,
    expiresAt: Date
  ) => ({
    subject: `Reminder: Join project "${projectName}" on AI Matrx`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Project Invitation Reminder</h1>
        <p>This is a reminder that <strong>${inviterName}</strong> has invited you to join project <strong>${projectName}</strong> in <strong>${organizationName}</strong> on AI Matrx.</p>
        <div style="margin: 24px 0;">
          <a href="${invitationUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation has been extended and will now expire on ${expiresAt.toLocaleDateString()}.</p>
        <p style="color: #666; font-size: 14px;">If you're not interested, you can safely ignore this email.</p>
      </div>
    `,
  }),

  organizationInvitationReminder: (
    organizationName: string,
    inviterName: string,
    invitationUrl: string,
    expiresAt: Date
  ) => ({
    subject: `Reminder: Join ${organizationName} on AI Matrx`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Invitation Reminder</h1>
        <p>This is a reminder that <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on AI Matrx.</p>
        <p>AI Matrx is a powerful platform for AI prompt engineering, canvas creation, and team collaboration.</p>
        <div style="margin: 24px 0;">
          <a href="${invitationUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation has been extended and will now expire on ${expiresAt.toLocaleDateString()}.</p>
        <p style="color: #666; font-size: 14px;">If you're not interested, you can safely ignore this email.</p>
      </div>
    `,
  }),

  resourceShared: (
    sharerName: string,
    resourceType: string,
    resourceTitle: string,
    resourceUrl: string,
    message?: string
  ) => ({
    subject: `${sharerName} shared a ${resourceType} with you`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Resource Shared</h1>
        <p><strong>${sharerName}</strong> has shared a ${resourceType} with you on AI Matrx.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 600; color: #1f2937;">${resourceTitle}</p>
        </div>
        ${message ? `<p style="color: #4b5563; font-style: italic;">"${message}"</p>` : ""}
        <div style="margin: 24px 0;">
          <a href="${resourceUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View ${resourceType}</a>
        </div>
        <p style="color: #666; font-size: 14px;">Log in to AI Matrx to access this shared resource.</p>
      </div>
    `,
  }),

  invitationRequestReceived: (fullName: string) => ({
    subject: "We received your AI Matrx access request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Request Received!</h1>
        <p>Hi ${fullName},</p>
        <p>Thank you for requesting access to AI Matrx. We've received your request and our team will review it shortly.</p>
        <p>We'll send you an email once your request has been reviewed. In the meantime, feel free to explore our public features.</p>
        <p style="color: #666; font-size: 14px;">If you have any questions, reply to this email and we'll get back to you.</p>
        <p>Best regards,<br>The AI Matrx Team</p>
      </div>
    `,
  }),

  invitationRequestAdminNotification: (
    fullName: string,
    email: string,
    company: string,
    useCase: string,
    requestId: string,
    adminUrl: string
  ) => ({
    subject: `New access request: ${fullName} (${company})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">New Access Request</h1>
        <p>A new invitation request has been submitted.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Name:</strong> ${fullName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0 0 8px 0;"><strong>Company:</strong> ${company}</p>
          <p style="margin: 0 0 8px 0;"><strong>Use Case:</strong> ${useCase}</p>
          <p style="margin: 0;"><strong>Request ID:</strong> ${requestId}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${adminUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Review Request</a>
        </div>
      </div>
    `,
  }),

  invitationRequestApproved: (
    fullName: string,
    invitationCode: string,
    signupUrl: string
  ) => ({
    subject: "Your AI Matrx invitation request has been approved!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Request Approved!</h1>
        <p>Great news, ${fullName}! Your request to join AI Matrx has been approved.</p>
        <p>Use the invitation code below to create your account:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center;">
          <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1f2937; letter-spacing: 2px;">${invitationCode}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${signupUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Create Your Account</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation code can only be used once and may expire.</p>
        <p>Welcome to AI Matrx!</p>
        <p>Best regards,<br>The AI Matrx Team</p>
      </div>
    `,
  }),

  invitationRequestRejected: (
    fullName: string,
    reason?: string
  ) => ({
    subject: "Update on your AI Matrx invitation request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Invitation Request Update</h1>
        <p>Hello ${fullName},</p>
        <p>Thank you for your interest in AI Matrx. After reviewing your request, we're unable to approve your invitation at this time.</p>
        ${reason ? `<p style="color: #4b5563;">${reason}</p>` : ""}
        <p>You're welcome to submit a new request in the future as our platform evolves.</p>
        <p>Thank you for your understanding.</p>
        <p>Best regards,<br>The AI Matrx Team</p>
      </div>
    `,
  }),

  passwordReset: (resetUrl: string) => ({
    subject: "Reset Your Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Password Reset Request</h1>
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  }),

  contactFormNotification: (
    name: string,
    email: string,
    subject: string,
    message: string,
    submissionId: string
  ) => ({
    subject: `New Contact Form Submission: ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">New Contact Form Submission</h1>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 8px 0;"><strong>From:</strong> ${name}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 8px 0;"><strong>Subject:</strong> ${subject}</p>
          <p style="margin: 8px 0;"><strong>Submission ID:</strong> ${submissionId}</p>
        </div>
        <div style="background: #ffffff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `,
  }),

  contactFormConfirmation: (name: string) => ({
    subject: "We received your message",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Thank You for Contacting Us</h1>
        <p>Hi ${name},</p>
        <p>We've received your message and will get back to you as soon as possible.</p>
        <p>Our team typically responds within 24-48 hours during business days.</p>
        <p>Best regards,<br>The AI Matrx Team</p>
      </div>
    `,
  }),

  feedbackUserReviewMessage: (
    username: string,
    feedbackType: string,
    description: string,
    message: string,
    senderName: string,
    portalUrl?: string
  ) => {
    const truncatedDescription =
      description.length > 150 ? description.slice(0, 150) + "..." : description;

    return {
      subject: `Action needed: Your ${feedbackType} report needs your review`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3b82f6;">Your Review is Needed</h1>
          <p>Hi ${username},</p>
          <p>We've been working on your <strong>${feedbackType}</strong> report and need your help to verify the fix.</p>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Your original report:</p>
            <p style="margin: 0; color: #1f2937;">${truncatedDescription}</p>
          </div>

          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #1e40af; font-size: 14px;">Message from ${senderName}:</p>
            <p style="margin: 0; color: #1e3a5f; white-space: pre-wrap;">${message}</p>
          </div>

          ${
            portalUrl
              ? `
            <div style="margin: 24px 0;">
              <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Review & Respond</a>
            </div>
          `
              : ""
          }

          <p style="color: #666; font-size: 14px;">
            Please test the fix and let us know if it resolved your issue. You can respond directly in the feedback portal.
          </p>
          <p>Best regards,<br>The AI Matrx Team</p>
        </div>
      `,
    };
  },

  feedbackUserReply: (
    adminName: string,
    feedbackType: string,
    description: string,
    userReply: string,
    username: string,
    portalUrl?: string
  ) => {
    const truncatedDescription =
      description.length > 150 ? description.slice(0, 150) + "..." : description;

    return {
      subject: `User responded to ${feedbackType} report review`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">User Response Received</h1>
          <p>Hi ${adminName},</p>
          <p><strong>${username}</strong> has responded to your review request on their <strong>${feedbackType}</strong> report.</p>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Original report:</p>
            <p style="margin: 0; color: #1f2937;">${truncatedDescription}</p>
          </div>

          <div style="background: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #854d0e; font-size: 14px;">User's response:</p>
            <p style="margin: 0; color: #713f12; white-space: pre-wrap;">${userReply}</p>
          </div>

          <p style="color: #666; font-size: 14px;">
            The item has been moved back to Test Results for your review.
          </p>

          ${
            portalUrl
              ? `
            <div style="margin: 24px 0;">
              <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View in Admin</a>
            </div>
          `
              : ""
          }

          <p>Best regards,<br>The AI Matrx Team</p>
        </div>
      `,
    };
  },

  feedbackStatusUpdate: (
    username: string,
    feedbackType: string,
    description: string,
    status: string,
    resolutionNotes?: string,
    portalUrl?: string
  ) => {
    const statusLabels: Record<string, string> = {
      in_progress: "In Progress",
      awaiting_review: "Fix Ready - Under Review",
      resolved: "Resolved",
      closed: "Closed",
      wont_fix: "Won't Fix",
    };

    const statusColors: Record<string, string> = {
      in_progress: "#eab308",
      awaiting_review: "#f97316",
      resolved: "#22c55e",
      closed: "#6b7280",
      wont_fix: "#ef4444",
    };

    const statusLabel = statusLabels[status] || status;
    const statusColor = statusColors[status] || "#3b82f6";
    const truncatedDescription =
      description.length > 200 ? description.slice(0, 200) + "..." : description;

    return {
      subject: `Your ${feedbackType} report has been updated - ${statusLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3b82f6;">Feedback Update</h1>
          <p>Hi ${username},</p>
          <p>Your <strong>${feedbackType}</strong> report has been updated.</p>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Your report:</p>
            <p style="margin: 0; color: #1f2937;">${truncatedDescription}</p>
          </div>

          <div style="margin: 16px 0;">
            <span style="display: inline-block; background: ${statusColor}22; color: ${statusColor}; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 14px;">
              ${statusLabel}
            </span>
          </div>

          ${
            resolutionNotes
              ? `
            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #15803d; font-size: 14px;">Resolution Notes:</p>
              <p style="margin: 0; color: #166534;">${resolutionNotes}</p>
            </div>
          `
              : ""
          }

          ${
            portalUrl
              ? `
            <div style="margin: 24px 0;">
              <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View Your Feedback</a>
            </div>
          `
              : ""
          }

          <p style="color: #666; font-size: 14px;">
            ${
              status === "resolved"
                ? "If the fix looks good, you can confirm it in the feedback portal."
                : "You can track all your feedback items in the feedback portal."
            }
          </p>
          <p>Best regards,<br>The AI Matrx Team</p>
        </div>
      `,
    };
  },
};
