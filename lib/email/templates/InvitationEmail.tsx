import { Button, Heading, Text, Section, Hr } from "react-email";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

interface OrganizationInvitationEmailProps {
  organizationName: string;
  inviterName: string;
  invitationUrl: string;
  expiresAt: Date;
  isReminder?: boolean;
}

export function OrganizationInvitationEmail({
  organizationName,
  inviterName,
  invitationUrl,
  expiresAt,
  isReminder = false,
}: OrganizationInvitationEmailProps) {
  const preview = isReminder
    ? `Reminder: Join ${organizationName} on AI Matrx`
    : `You've been invited to join ${organizationName} on AI Matrx`;

  return (
    <BaseLayout
      preview={preview}
      footerText="If you didn't expect this invitation, you can safely ignore this email."
    >
      {isReminder && (
        <Section style={reminderBadge}>
          <Text style={reminderText}>Reminder</Text>
        </Section>
      )}

      <Heading style={heading}>
        {isReminder ? "Invitation Reminder" : "You're Invited"}
      </Heading>

      <Text style={text}>
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{organizationName}</strong> on AI Matrx.
      </Text>

      {isReminder && (
        <Text style={text}>
          You haven't accepted yet — this invitation is still waiting for you.
        </Text>
      )}

      <Text style={text}>
        AI Matrx is a platform for AI prompt engineering, canvas creation, and team collaboration.
      </Text>

      <Section style={buttonSection}>
        <Button href={invitationUrl} style={button}>
          Accept Invitation
        </Button>
      </Section>

      <Hr style={hr} />

      <Text style={textMuted}>
        This invitation expires on{" "}
        {expiresAt.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        .
      </Text>
    </BaseLayout>
  );
}

interface ProjectInvitationEmailProps {
  projectName: string;
  organizationName: string;
  inviterName: string;
  invitationUrl: string;
  expiresAt: Date;
  isReminder?: boolean;
}

export function ProjectInvitationEmail({
  projectName,
  organizationName,
  inviterName,
  invitationUrl,
  expiresAt,
  isReminder = false,
}: ProjectInvitationEmailProps) {
  const preview = isReminder
    ? `Reminder: Join project "${projectName}" on AI Matrx`
    : `You've been invited to join project "${projectName}" on AI Matrx`;

  return (
    <BaseLayout
      preview={preview}
      footerText="If you didn't expect this invitation, you can safely ignore this email."
    >
      {isReminder && (
        <Section style={reminderBadge}>
          <Text style={reminderText}>Reminder</Text>
        </Section>
      )}

      <Heading style={headingPurple}>
        {isReminder ? "Project Invitation Reminder" : "Project Invitation"}
      </Heading>

      <Text style={text}>
        <strong>{inviterName}</strong> has invited you to join project{" "}
        <strong>{projectName}</strong> in <strong>{organizationName}</strong> on AI Matrx.
      </Text>

      <Section style={buttonSection}>
        <Button href={invitationUrl} style={buttonPurple}>
          Accept Invitation
        </Button>
      </Section>

      <Hr style={hr} />

      <Text style={textMuted}>
        This invitation expires on{" "}
        {expiresAt.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        .
      </Text>
    </BaseLayout>
  );
}

OrganizationInvitationEmail.PreviewProps = {
  organizationName: "Acme Corp",
  inviterName: "Arman",
  invitationUrl: "https://aimatrx.com/invitations/abc123",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isReminder: false,
} as OrganizationInvitationEmailProps;

export default OrganizationInvitationEmail;

const heading = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700" as const,
  margin: "0 0 16px 0",
};

const headingPurple = {
  ...heading,
  color: "#6366f1",
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

const buttonPurple = {
  ...button,
  backgroundColor: "#6366f1",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "16px 0",
};

const reminderBadge = {
  marginBottom: "16px",
};

const reminderText = {
  display: "inline-block" as const,
  backgroundColor: "#fef3c7",
  color: "#92400e",
  borderRadius: "9999px",
  padding: "4px 12px",
  fontSize: "12px",
  fontWeight: "600" as const,
  margin: "0",
};
