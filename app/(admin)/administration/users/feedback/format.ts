import { format } from "date-fns";

import type {
  FeedbackCategory,
  FeedbackComment,
  FeedbackType,
  FeedbackUserMessage,
  SystemAnnouncement,
  UserFeedback,
} from "@/types/feedback.types";

/**
 * Shared human/agent formatters for the admin feedback feature
 * (FeedbackTable, WorkQueueTab, AnnouncementTable, CategoriesTab,
 * FeedbackDetailDialog).
 */

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  suggestion: "Suggestion",
  other: "Other",
};

/** One line per feedback item — list-level human copy. */
export function feedbackRowSummary(item: UserFeedback): string {
  const bits = [
    feedbackTypeLabels[item.feedback_type],
    item.status,
    item.priority,
    item.username || "Anonymous",
    item.route,
    item.description.length > 140
      ? `${item.description.slice(0, 140)}…`
      : item.description,
  ];
  return bits.join(" · ");
}

/** Compact projection for graded AI variants (drops long AI/testing prose). */
export function feedbackBrief(item: UserFeedback) {
  return {
    id: item.id,
    feedback_type: item.feedback_type,
    status: item.status,
    priority: item.priority,
    admin_decision: item.admin_decision,
    work_priority: item.work_priority,
    route: item.route,
    username: item.username,
    assigned_to: item.assigned_to,
    category_id: item.category_id,
    parent_id: item.parent_id,
    has_open_issues: item.has_open_issues,
    description:
      item.description.length > 280
        ? `${item.description.slice(0, 280)}…`
        : item.description,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/**
 * Full markdown dump of one feedback record — the detail dialog's "Copy All"
 * (extracted so lists can reuse it; now also covers user messages, assignee,
 * and category, which the original omitted).
 */
export function feedbackMarkdown(
  item: UserFeedback,
  extras?: {
    comments?: FeedbackComment[];
    userMessages?: FeedbackUserMessage[];
    categoryName?: string | null;
  },
): string {
  const { comments = [], userMessages = [], categoryName } = extras ?? {};
  const sections: string[] = [];

  sections.push(`# Feedback: ${feedbackTypeLabels[item.feedback_type]}`);
  sections.push("");

  sections.push("## Metadata");
  sections.push(`- **ID:** ${item.id}`);
  sections.push(`- **Type:** ${feedbackTypeLabels[item.feedback_type]}`);
  sections.push(`- **Status:** ${item.status}`);
  sections.push(`- **Priority:** ${item.priority}`);
  sections.push(`- **Route:** ${item.route}`);
  sections.push(`- **User:** ${item.username || "Anonymous"}`);
  sections.push(`- **Created:** ${format(new Date(item.created_at), "PPpp")}`);
  sections.push(`- **Updated:** ${format(new Date(item.updated_at), "PPpp")}`);
  if (categoryName) sections.push(`- **Category:** ${categoryName}`);
  if (item.assigned_to) sections.push(`- **Assigned To:** ${item.assigned_to}`);
  if (item.admin_decision !== "pending")
    sections.push(`- **Admin Decision:** ${item.admin_decision}`);
  if (item.work_priority !== null)
    sections.push(`- **Work Priority:** #${item.work_priority}`);
  if (item.has_open_issues) sections.push(`- **Open Issues:** Yes`);
  if (item.parent_id) sections.push(`- **Parent ID:** ${item.parent_id}`);
  sections.push("");

  sections.push("## Description");
  sections.push(item.description);
  sections.push("");

  if (item.ai_assessment || item.ai_solution_proposal) {
    sections.push("## AI Analysis");
    if (item.ai_assessment) {
      sections.push("### Assessment");
      sections.push(item.ai_assessment);
    }
    if (item.ai_solution_proposal) {
      sections.push("### Solution Proposal");
      sections.push(item.ai_solution_proposal);
    }
    if (item.ai_suggested_priority)
      sections.push(`- **Suggested Priority:** ${item.ai_suggested_priority}`);
    if (item.ai_complexity)
      sections.push(`- **Complexity:** ${item.ai_complexity}`);
    if (item.autonomy_score !== null)
      sections.push(`- **Autonomy Score:** ${item.autonomy_score}/5`);
    if (item.ai_estimated_files?.length) {
      sections.push("### Estimated Files");
      item.ai_estimated_files.forEach((f) => sections.push(`- ${f}`));
    }
    sections.push("");
  }

  if (item.admin_direction || item.admin_notes) {
    sections.push("## Admin Input");
    if (item.admin_direction) {
      sections.push("### Direction");
      sections.push(item.admin_direction);
    }
    if (item.admin_notes) {
      sections.push("### Notes");
      sections.push(item.admin_notes);
    }
    sections.push("");
  }

  if (item.testing_instructions || item.testing_url || item.resolution_notes) {
    sections.push("## Testing");
    if (item.resolution_notes) {
      sections.push("### Resolution Notes");
      sections.push(item.resolution_notes);
    }
    if (item.testing_instructions) {
      sections.push("### Testing Instructions");
      sections.push(item.testing_instructions);
    }
    if (item.testing_url)
      sections.push(`- **Testing URL:** ${item.testing_url}`);
    if (item.testing_result)
      sections.push(`- **Testing Result:** ${item.testing_result}`);
    sections.push("");
  }

  if (comments.length > 0) {
    sections.push("## Comments");
    comments.forEach((c) => {
      const time = format(new Date(c.created_at), "PPpp");
      sections.push(`### ${c.author_name} (${c.author_type}) — ${time}`);
      sections.push(c.content);
      sections.push("");
    });
  }

  if (userMessages.length > 0) {
    sections.push("## User Messages");
    userMessages.forEach((m) => {
      const time = format(new Date(m.created_at), "PPpp");
      sections.push(`### ${m.sender_name ?? m.sender_type} — ${time}`);
      sections.push(m.content);
      sections.push("");
    });
  }

  if (item.image_urls?.length) {
    sections.push("## Screenshots");
    item.image_urls.forEach((url, i) =>
      sections.push(`- Screenshot ${i + 1}: ${url}`),
    );
    sections.push("");
  }

  return sections.join("\n");
}

export function announcementSummary(a: SystemAnnouncement): string {
  return [
    `${a.title} (${a.announcement_type}${a.is_active ? " · active" : " · inactive"})`,
    a.message,
    `created: ${format(new Date(a.created_at), "PPpp")}`,
  ].join("\n");
}

export function categorySummary(c: FeedbackCategory): string {
  return `${c.name} (${c.slug})${c.is_active ? "" : " · inactive"}${c.description ? ` — ${c.description}` : ""}`;
}
