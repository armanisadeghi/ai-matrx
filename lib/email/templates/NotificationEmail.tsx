import { Button, Heading, Text, Section, Hr } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

// ─── Task Assigned ──────────────────────────────────────────────────────────

interface TaskAssignedEmailProps {
  taskTitle: string;
  assignerName: string;
  taskUrl: string;
  description?: string;
}

export function TaskAssignedEmail({
  taskTitle,
  assignerName,
  taskUrl,
  description,
}: TaskAssignedEmailProps) {
  return (
    <BaseLayout preview={`${assignerName} assigned you a task: ${taskTitle}`}>
      <Heading style={heading}>New Task Assigned</Heading>
      <Text style={text}>
        <strong>{assignerName}</strong> assigned you a task.
      </Text>

      <Section style={card}>
        <Text style={cardTitle}>{taskTitle}</Text>
        {description && <Text style={cardBody}>{description}</Text>}
      </Section>

      <Section style={buttonSection}>
        <Button href={taskUrl} style={button}>
          View Task
        </Button>
      </Section>
    </BaseLayout>
  );
}

// ─── Comment Added ──────────────────────────────────────────────────────────

interface CommentAddedEmailProps {
  resourceTitle: string;
  commenterName: string;
  commentText: string;
  resourceUrl: string;
  resourceType: string;
}

export function CommentAddedEmail({
  resourceTitle,
  commenterName,
  commentText,
  resourceUrl,
  resourceType,
}: CommentAddedEmailProps) {
  return (
    <BaseLayout preview={`${commenterName} commented on ${resourceTitle}`}>
      <Heading style={heading}>New Comment</Heading>
      <Text style={text}>
        <strong>{commenterName}</strong> commented on your {resourceType}{" "}
        <strong>{resourceTitle}</strong>.
      </Text>

      <Section style={quoteBlock}>
        <Text style={quoteText}>"{commentText}"</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={resourceUrl} style={button}>
          View Comment
        </Button>
      </Section>
    </BaseLayout>
  );
}

// ─── Message Received ───────────────────────────────────────────────────────

interface MessageReceivedEmailProps {
  senderName: string;
  messagePreview: string;
  conversationUrl: string;
}

export function MessageReceivedEmail({
  senderName,
  messagePreview,
  conversationUrl,
}: MessageReceivedEmailProps) {
  return (
    <BaseLayout preview={`New message from ${senderName}`}>
      <Heading style={heading}>New Message</Heading>
      <Text style={text}>
        <strong>{senderName}</strong> sent you a message.
      </Text>

      <Section style={quoteBlock}>
        <Text style={quoteText}>"{messagePreview}"</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={conversationUrl} style={button}>
          Reply
        </Button>
      </Section>
    </BaseLayout>
  );
}

// ─── Feedback Assigned ─────────────────────────────────────────────────────

interface FeedbackAssignedEmailProps {
  assignerName: string;
  feedbackType: "bug" | "feature" | "suggestion" | "other";
  feedbackPreview: string;
  feedbackRoute: string;
  feedbackUrl: string;
  categoryName?: string | null;
}

const feedbackTypeLabel: Record<
  FeedbackAssignedEmailProps["feedbackType"],
  string
> = {
  bug: "Bug",
  feature: "Feature",
  suggestion: "Suggestion",
  other: "Feedback",
};

export function FeedbackAssignedEmail({
  assignerName,
  feedbackType,
  feedbackPreview,
  feedbackRoute,
  feedbackUrl,
  categoryName,
}: FeedbackAssignedEmailProps) {
  const typeLabel = feedbackTypeLabel[feedbackType];
  return (
    <BaseLayout
      preview={`${assignerName} assigned you a ${typeLabel.toLowerCase()}`}
    >
      <Heading style={heading}>Feedback Assigned</Heading>
      <Text style={text}>
        <strong>{assignerName}</strong> assigned you a {typeLabel.toLowerCase()}
        {categoryName ? (
          <>
            {" "}
            in <strong>{categoryName}</strong>
          </>
        ) : null}
        .
      </Text>

      <Section style={card}>
        <Text style={cardTitle}>
          {typeLabel} · {feedbackRoute}
        </Text>
        <Text style={cardBody}>{feedbackPreview}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={feedbackUrl} style={button}>
          Open in Admin Dashboard
        </Button>
      </Section>
    </BaseLayout>
  );
}

// ─── Due Date Reminder ──────────────────────────────────────────────────────

interface DueDateReminderEmailProps {
  taskTitle: string;
  dueDate: string;
  taskUrl: string;
  urgency: "upcoming" | "due_today" | "overdue";
}

const urgencyConfig = {
  upcoming: { label: "Due Soon", color: "#3b82f6", bg: "#eff6ff" },
  due_today: { label: "Due Today", color: "#f59e0b", bg: "#fffbeb" },
  overdue: { label: "Overdue", color: "#ef4444", bg: "#fef2f2" },
};

export function DueDateReminderEmail({
  taskTitle,
  dueDate,
  taskUrl,
  urgency,
}: DueDateReminderEmailProps) {
  const config = urgencyConfig[urgency];

  return (
    <BaseLayout preview={`${config.label}: ${taskTitle}`}>
      <Section style={{ marginBottom: "16px" }}>
        <Text
          style={{
            display: "inline-block" as const,
            backgroundColor: config.bg,
            color: config.color,
            borderRadius: "9999px",
            padding: "4px 12px",
            fontSize: "13px",
            fontWeight: "600" as const,
            margin: "0",
          }}
        >
          {config.label}
        </Text>
      </Section>

      <Heading style={heading}>Task Reminder</Heading>

      <Section style={card}>
        <Text style={cardTitle}>{taskTitle}</Text>
        <Text style={{ ...cardBody, color: config.color }}>Due: {dueDate}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={taskUrl} style={button}>
          View Task
        </Button>
      </Section>
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

const text = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px 0",
};

const card = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  borderLeft: "4px solid #3b82f6",
};

const cardTitle = {
  color: "#111827",
  fontSize: "15px",
  fontWeight: "600" as const,
  margin: "0 0 6px 0",
};

const cardBody = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0",
};

const quoteBlock = {
  backgroundColor: "#f0f9ff",
  borderLeft: "4px solid #0ea5e9",
  padding: "12px 16px",
  margin: "16px 0",
  borderRadius: "0 8px 8px 0",
};

const quoteText = {
  color: "#0c4a6e",
  fontSize: "14px",
  fontStyle: "italic" as const,
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
