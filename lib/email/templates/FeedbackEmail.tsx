import { Button, Heading, Text, Section, Hr } from "react-email";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

// ─── Feedback Status Update (to user) ───────────────────────────────────────

type FeedbackStatus = "in_progress" | "awaiting_review" | "resolved" | "closed" | "wont_fix";

const statusConfig: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  in_progress: { label: "In Progress", color: "#d97706", bg: "#fef3c7" },
  awaiting_review: { label: "Fix Ready — Under Review", color: "#ea580c", bg: "#fff7ed" },
  resolved: { label: "Resolved", color: "#16a34a", bg: "#f0fdf4" },
  closed: { label: "Closed", color: "#4b5563", bg: "#f9fafb" },
  wont_fix: { label: "Won't Fix", color: "#dc2626", bg: "#fef2f2" },
};

interface FeedbackStatusEmailProps {
  username: string;
  feedbackType: string;
  description: string;
  status: FeedbackStatus;
  resolutionNotes?: string;
  portalUrl?: string;
}

export function FeedbackStatusEmail({
  username,
  feedbackType,
  description,
  status,
  resolutionNotes,
  portalUrl,
}: FeedbackStatusEmailProps) {
  const cfg = statusConfig[status] ?? statusConfig.in_progress;
  const truncated = description.length > 200 ? description.slice(0, 200) + "..." : description;

  return (
    <BaseLayout
      preview={`Your ${feedbackType} report has been updated — ${cfg.label}`}
      footerText="You received this because you submitted a feedback report on AI Matrx."
    >
      <Heading style={heading}>Feedback Update</Heading>

      <Text style={text}>Hi {username},</Text>
      <Text style={text}>
        Your <strong>{feedbackType}</strong> report has been updated.
      </Text>

      <Section style={descriptionBlock}>
        <Text style={descriptionLabel}>Your report:</Text>
        <Text style={descriptionText}>{truncated}</Text>
      </Section>

      <Section style={{ margin: "12px 0" }}>
        <Text
          style={{
            display: "inline-block" as const,
            backgroundColor: cfg.bg,
            color: cfg.color,
            borderRadius: "9999px",
            padding: "4px 14px",
            fontSize: "13px",
            fontWeight: "600" as const,
            margin: "0",
          }}
        >
          {cfg.label}
        </Text>
      </Section>

      {resolutionNotes && (
        <Section style={notesBlock}>
          <Text style={notesLabel}>Resolution notes:</Text>
          <Text style={notesText}>{resolutionNotes}</Text>
        </Section>
      )}

      {portalUrl && (
        <Section style={buttonSection}>
          <Button href={portalUrl} style={button}>
            {status === "resolved" ? "Confirm Fix" : "View Your Feedback"}
          </Button>
        </Section>
      )}
    </BaseLayout>
  );
}

// ─── Feedback Review Request (user asked to verify a fix) ───────────────────

interface FeedbackReviewEmailProps {
  username: string;
  feedbackType: string;
  description: string;
  message: string;
  senderName: string;
  portalUrl?: string;
}

export function FeedbackReviewEmail({
  username,
  feedbackType,
  description,
  message,
  senderName,
  portalUrl,
}: FeedbackReviewEmailProps) {
  const truncated = description.length > 150 ? description.slice(0, 150) + "..." : description;

  return (
    <BaseLayout
      preview={`Action needed: Your ${feedbackType} report needs your review`}
      footerText="Please test the fix and let us know if it resolved your issue."
    >
      <Heading style={heading}>Your Review Is Needed</Heading>

      <Text style={text}>Hi {username},</Text>
      <Text style={text}>
        We've been working on your <strong>{feedbackType}</strong> report and need your
        help to verify the fix.
      </Text>

      <Section style={descriptionBlock}>
        <Text style={descriptionLabel}>Your original report:</Text>
        <Text style={descriptionText}>{truncated}</Text>
      </Section>

      <Section style={messageBlock}>
        <Text style={messageLabel}>Message from {senderName}:</Text>
        <Text style={messageText}>{message}</Text>
      </Section>

      {portalUrl && (
        <Section style={buttonSection}>
          <Button href={portalUrl} style={button}>
            Review &amp; Respond
          </Button>
        </Section>
      )}
    </BaseLayout>
  );
}

// ─── Feedback User Reply (admin notification) ────────────────────────────────

interface FeedbackReplyEmailProps {
  adminName: string;
  feedbackType: string;
  description: string;
  userReply: string;
  username: string;
  portalUrl?: string;
}

export function FeedbackReplyEmail({
  adminName,
  feedbackType,
  description,
  userReply,
  username,
  portalUrl,
}: FeedbackReplyEmailProps) {
  const truncated = description.length > 150 ? description.slice(0, 150) + "..." : description;

  return (
    <BaseLayout
      preview={`${username} responded to your ${feedbackType} review request`}
      footerText="The item has been moved back to Test Results for your review."
    >
      <Heading style={headingAmber}>User Response Received</Heading>

      <Text style={text}>Hi {adminName},</Text>
      <Text style={text}>
        <strong>{username}</strong> has responded to your review request on their{" "}
        <strong>{feedbackType}</strong> report.
      </Text>

      <Section style={descriptionBlock}>
        <Text style={descriptionLabel}>Original report:</Text>
        <Text style={descriptionText}>{truncated}</Text>
      </Section>

      <Section style={replyBlock}>
        <Text style={replyLabel}>User's response:</Text>
        <Text style={replyText}>{userReply}</Text>
      </Section>

      {portalUrl && (
        <Section style={buttonSection}>
          <Button href={portalUrl} style={button}>
            View in Admin
          </Button>
        </Section>
      )}
    </BaseLayout>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const heading = {
  color: "#111827",
  fontSize: "22px",
  fontWeight: "700" as const,
  margin: "0 0 12px 0",
};

const headingAmber = {
  ...heading,
  color: "#d97706",
};

const text = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px 0",
};

const descriptionBlock = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "12px 0",
};

const descriptionLabel = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  margin: "0 0 6px 0",
};

const descriptionText = {
  color: "#111827",
  fontSize: "14px",
  margin: "0",
};

const messageBlock = {
  backgroundColor: "#eff6ff",
  borderLeft: "4px solid #3b82f6",
  padding: "12px 16px",
  margin: "12px 0",
  borderRadius: "0 8px 8px 0",
};

const messageLabel = {
  color: "#1e40af",
  fontSize: "12px",
  fontWeight: "600" as const,
  margin: "0 0 4px 0",
};

const messageText = {
  color: "#1e3a5f",
  fontSize: "14px",
  whiteSpace: "pre-wrap" as const,
  margin: "0",
};

const replyBlock = {
  backgroundColor: "#fefce8",
  borderLeft: "4px solid #eab308",
  padding: "12px 16px",
  margin: "12px 0",
  borderRadius: "0 8px 8px 0",
};

const replyLabel = {
  color: "#854d0e",
  fontSize: "12px",
  fontWeight: "600" as const,
  margin: "0 0 4px 0",
};

const replyText = {
  color: "#713f12",
  fontSize: "14px",
  whiteSpace: "pre-wrap" as const,
  margin: "0",
};

const notesBlock = {
  backgroundColor: "#f0fdf4",
  borderLeft: "4px solid #22c55e",
  padding: "12px 16px",
  margin: "12px 0",
  borderRadius: "0 8px 8px 0",
};

const notesLabel = {
  color: "#15803d",
  fontSize: "12px",
  fontWeight: "600" as const,
  margin: "0 0 4px 0",
};

const notesText = {
  color: "#166534",
  fontSize: "14px",
  margin: "0",
};

const buttonSection = {
  margin: "20px 0",
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
