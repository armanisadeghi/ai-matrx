import { Button, Heading, Text, Section, Hr } from "react-email";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

// ─── Resource Shared ────────────────────────────────────────────────────────

interface ResourceSharedEmailProps {
  sharerName: string;
  resourceType: string;
  resourceTitle: string;
  resourceUrl: string;
  message?: string;
}

export function ResourceSharedEmail({
  sharerName,
  resourceType,
  resourceTitle,
  resourceUrl,
  message,
}: ResourceSharedEmailProps) {
  return (
    <BaseLayout
      preview={`${sharerName} shared a ${resourceType} with you`}
      footerText="Log in to AI Matrx to access this shared resource."
    >
      <Heading style={heading}>
        {sharerName} shared something with you
      </Heading>

      <Text style={text}>
        <strong>{sharerName}</strong> has shared a {resourceType} with you on AI Matrx.
      </Text>

      <Section style={resourceCard}>
        <Text style={resourceLabel}>{resourceType}</Text>
        <Text style={resourceTitle_}>{resourceTitle}</Text>
      </Section>

      {message && (
        <Section style={messageBlock}>
          <Text style={messageText}>"{message}"</Text>
          <Text style={messageSender}>— {sharerName}</Text>
        </Section>
      )}

      <Section style={buttonSection}>
        <Button href={resourceUrl} style={button}>
          View {resourceType}
        </Button>
      </Section>
    </BaseLayout>
  );
}

// ─── Contact Form — Admin Notification ──────────────────────────────────────

interface ContactFormNotificationEmailProps {
  name: string;
  email: string;
  subject: string;
  message: string;
  submissionId: string;
}

export function ContactFormNotificationEmail({
  name,
  email,
  subject,
  message,
  submissionId,
}: ContactFormNotificationEmailProps) {
  return (
    <BaseLayout
      preview={`New contact form: ${subject}`}
      footerText="This is an internal notification. Reply directly to the sender's email."
    >
      <Heading style={heading}>New Contact Form Submission</Heading>

      <Section style={metaBlock}>
        <Text style={metaRow}><strong>From:</strong> {name}</Text>
        <Text style={metaRow}><strong>Email:</strong> {email}</Text>
        <Text style={metaRow}><strong>Subject:</strong> {subject}</Text>
        <Text style={metaRow}><strong>ID:</strong> {submissionId}</Text>
      </Section>

      <Hr style={hr} />

      <Section style={messageSection}>
        <Text style={messageContent}>{message}</Text>
      </Section>
    </BaseLayout>
  );
}

// ─── Contact Form — User Confirmation ───────────────────────────────────────

interface ContactFormConfirmationEmailProps {
  name: string;
}

export function ContactFormConfirmationEmail({ name }: ContactFormConfirmationEmailProps) {
  return (
    <BaseLayout
      preview="We received your message"
      footerText="You received this confirmation because you submitted a contact form on AI Matrx."
    >
      <Heading style={heading}>We Got Your Message</Heading>

      <Text style={text}>Hi {name},</Text>

      <Text style={text}>
        Thank you for reaching out. We've received your message and will get back to
        you as soon as possible.
      </Text>

      <Section style={infoBlock}>
        <Text style={infoText}>
          Our team typically responds within <strong>24–48 hours</strong> during business days.
        </Text>
      </Section>

      <Text style={text}>
        If your question is urgent, you can also reach us directly by replying to this email.
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

const resourceCard = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  borderLeft: "4px solid #3b82f6",
};

const resourceLabel = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  margin: "0 0 4px 0",
};

const resourceTitle_ = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600" as const,
  margin: "0",
};

const messageBlock = {
  backgroundColor: "#eff6ff",
  borderLeft: "4px solid #3b82f6",
  padding: "12px 16px",
  margin: "16px 0",
  borderRadius: "0 8px 8px 0",
};

const messageText = {
  color: "#1e40af",
  fontSize: "14px",
  fontStyle: "italic" as const,
  margin: "0 0 4px 0",
};

const messageSender = {
  color: "#3b82f6",
  fontSize: "13px",
  margin: "0",
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

const metaBlock = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 16px 0",
};

const metaRow = {
  color: "#374151",
  fontSize: "14px",
  margin: "4px 0",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "0 0 16px 0",
};

const messageSection = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "16px 20px",
};

const messageContent = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
};

const infoBlock = {
  backgroundColor: "#eff6ff",
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "16px 0",
};

const infoText = {
  color: "#1e40af",
  fontSize: "14px",
  margin: "0",
};
