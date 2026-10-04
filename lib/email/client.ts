/**
 * Application email via Resend API (Path 1).
 * Supabase Auth email uses Resend SMTP with a separate key — see features/email/FEATURE.md.
 */
import { Resend } from "resend";
import type { Attachment } from "resend";

import { outboundSuppression } from "@/lib/communications/outbound-guard";
import { routeRecipients } from "@/lib/communications/test-inbox";

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
    return process.env.EMAIL_ALLOWED_DOMAINS.split(",").map((d) =>
      d.trim().toLowerCase(),
    );
  }

  // Otherwise, extract domain from EMAIL_FROM
  const emailFrom = process.env.EMAIL_FROM;
  if (emailFrom) {
    const match =
      emailFrom.match(/<([^>]+)>/) || emailFrom.match(/([^\s<>]+@[^\s<>]+)/);
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
  attachments?: Attachment[];
}

/**
 * Send an email using Resend
 * Requires RESEND_API_KEY and EMAIL_FROM environment variables
 */
export async function sendEmail(options: SendEmailOptions) {
  const { from, replyTo, attachments, html, text } = options;

  // 🚨 A test account's mail goes to the ONE designated test inbox, never to admin.com /
  // test.com (strangers' domains) — named in the subject and a header, never dropped
  // (lib/communications/test-inbox.ts; every route reaches Resend through here).
  const routing = routeRecipients(options.to, options.subject);
  const { to, subject } = routing;
  if (routing.redirected.length > 0) {
    console.info(
      `Test-account email for ${routing.redirected.join(", ")} redirected to the test inbox`,
    );
  }

  // 🚨 A copy of production never emails a person (lib/communications/outbound-guard.ts).
  for (const recipient of to) {
    const suppressed = outboundSuppression("email", recipient);
    if (suppressed) {
      return {
        success: false,
        suppressed: true,
        error: { code: suppressed.code, message: suppressed.message },
      };
    }
  }

  const senderAddress = from || process.env.EMAIL_FROM;

  if (!senderAddress) {
    console.error("EMAIL_FROM environment variable is not set");
    return { success: false, error: new Error("EMAIL_FROM is not configured") };
  }

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: senderAddress,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments,
      ...(routing.headers ? { headers: routing.headers } : {}),
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

export { emailErrorMessage } from "./error-message";

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
    adminUrl: string,
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
    submissionId: string,
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

};
