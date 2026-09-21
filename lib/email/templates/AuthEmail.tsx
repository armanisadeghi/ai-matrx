import { Button, Heading, Text, Section, Hr } from "react-email";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

// ─── Invitation Approved ────────────────────────────────────────────────────

interface InvitationApprovedEmailProps {
  fullName: string;
  invitationCode: string;
  signupUrl: string;
}

export function InvitationApprovedEmail({
  fullName,
  invitationCode,
  signupUrl,
}: InvitationApprovedEmailProps) {
  return (
    <BaseLayout
      preview="Your AI Matrx invitation has been approved!"
      footerText="You received this because you requested early access to AI Matrx."
    >
      <Section style={badge}>
        <Text style={badgeText}>Approved</Text>
      </Section>

      <Heading style={heading}>You're in, {fullName}!</Heading>

      <Text style={text}>
        Your request to join AI Matrx has been approved. Use the invitation code
        below to create your account.
      </Text>

      <Section style={codeBlock}>
        <Text style={codeLabel}>Your invitation code</Text>
        <Text style={codeStyle}>{invitationCode}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={signupUrl} style={button}>
          Create Your Account
        </Button>
      </Section>

      <Text style={textMuted}>
        This code is single-use. If you have any trouble signing up, reply to this
        email.
      </Text>
    </BaseLayout>
  );
}

// ─── Invitation Rejected ────────────────────────────────────────────────────

interface InvitationRejectedEmailProps {
  fullName: string;
  reason?: string;
}

export function InvitationRejectedEmail({ fullName, reason }: InvitationRejectedEmailProps) {
  return (
    <BaseLayout
      preview="Update on your AI Matrx invitation request"
      footerText="You received this because you requested early access to AI Matrx."
    >
      <Heading style={heading}>Invitation Request Update</Heading>

      <Text style={text}>Hello {fullName},</Text>

      <Text style={text}>
        Thank you for your interest in AI Matrx. After reviewing your request,
        we're unable to approve your invitation at this time.
      </Text>

      {reason && <Text style={reasonText}>{reason}</Text>}

      <Text style={text}>
        You're welcome to submit a new request in the future as our platform evolves.
      </Text>

      <Hr style={hr} />

      <Text style={textMuted}>
        Thank you for your understanding. We appreciate your interest.
      </Text>
    </BaseLayout>
  );
}

// ─── Password Reset ─────────────────────────────────────────────────────────

interface PasswordResetEmailProps {
  resetUrl: string;
}

export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <BaseLayout
      preview="Reset your AI Matrx password"
      footerText="If you didn't request a password reset, you can safely ignore this email. Your password won't change."
    >
      <Heading style={heading}>Reset Your Password</Heading>

      <Text style={text}>
        We received a request to reset the password for your AI Matrx account.
        Click the button below to choose a new password.
      </Text>

      <Section style={buttonSection}>
        <Button href={resetUrl} style={button}>
          Reset Password
        </Button>
      </Section>

      <Hr style={hr} />

      <Text style={textMuted}>
        This link expires in 1 hour. If you need a new link, go to the login page
        and click "Forgot password" again.
      </Text>
    </BaseLayout>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const heading = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700" as const,
  margin: "0 0 16px 0",
};

const text = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px 0",
};

const textMuted = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "8px 0 0 0",
};

const reasonText = {
  ...text,
  color: "#6b7280",
  fontStyle: "italic" as const,
  backgroundColor: "#f9fafb",
  padding: "12px 16px",
  borderRadius: "6px",
};

const badge = {
  marginBottom: "16px",
};

const badgeText = {
  display: "inline-block" as const,
  backgroundColor: "#d1fae5",
  color: "#065f46",
  borderRadius: "9999px",
  padding: "4px 12px",
  fontSize: "12px",
  fontWeight: "600" as const,
  margin: "0",
};

const codeBlock = {
  backgroundColor: "#1e1e2e",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "20px 0",
  textAlign: "center" as const,
};

const codeLabel = {
  color: "#a6adc8",
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  margin: "0 0 8px 0",
};

const codeStyle = {
  color: "#cdd6f4",
  fontSize: "28px",
  fontWeight: "700" as const,
  letterSpacing: "0.15em",
  fontFamily: "'Courier New', monospace",
};

const buttonSection = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#3b82f6",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600" as const,
  textDecoration: "none" as const,
  textAlign: "center" as const,
  padding: "12px 28px",
  display: "inline-block" as const,
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};
