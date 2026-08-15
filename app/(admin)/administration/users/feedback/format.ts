import { format, formatDistanceToNow } from "date-fns";

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  FeedbackCategory,
  FeedbackComment,
  FeedbackType,
  FeedbackUserMessage,
  SystemAnnouncement,
  UserFeedback,
} from "@/types/feedback.types";
import { getFeedbackScreenshotRefs } from "@/features/feedback/screenshot-refs";

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

  const screenshotRefs = getFeedbackScreenshotRefs(item);
  if (screenshotRefs.length) {
    sections.push("## Screenshots");
    screenshotRefs.forEach((ref, i) =>
      sections.push(`- Screenshot ${i + 1}: ${ref}`),
    );
    sections.push("");
  }

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DETAIL DIALOG AS A FORM — live admin state, not the fetched row
// ═══════════════════════════════════════════════════════════════════════════
//
// Fixed 2026-08-15. The dialog's Copy-for-AI used to hand over `item` — the
// row as FETCHED — while the admin sat in front of nine editable controls and
// four unsent message drafts. An admin who flips status to `resolved`, writes
// direction, drafts a reply to the user and then asks an agent for help was
// handing it the OLD status and NONE of the prose they had just written. That
// is the failure THE WHAT-I-SEE LAW names outright: "copying the fetched row
// after the user edited a field is lying to the agent."
//
// `feedbackDetailUnsavedChanges` mirrors `handleSaveDecision`'s own dirty
// predicates field for field, so the diff the agent reads is exactly the set
// of writes the Save button would perform.

/** The admin-decision form's LIVE values (the controls' current state). */
export interface FeedbackDecisionForm {
  decision: string;
  direction: string;
  /** The raw input string, e.g. "3" or "" — not yet parsed to an int. */
  workPriority: string;
  adminNotes: string;
  status: string;
  hasOpenIssues: boolean;
  /** Select values: the literal "none" sentinel means "cleared". */
  categoryId: string;
  categoryName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  parentId: string;
}

/** Unsent prose/attachments sitting in the dialog's composers. */
export interface FeedbackComposerDrafts {
  newComment: string;
  userReplyText: string;
  replyImages: string[];
  userReviewMessage: string;
  composeImages: string[];
  showUserReviewCompose: boolean;
  pendingTestResult: "fail" | "partial" | null;
  testFeedbackText: string;
}

export interface FeedbackDetailView {
  /** The record as last fetched — the baseline the diff is taken against. */
  item: UserFeedback;
  /**
   * The category name for the SAVED `item.category_id`, which is what the
   * header chip renders. Deliberately separate from `form.categoryName`: the
   * chip must not silently adopt an unsaved category pick, or the "verbatim
   * header strip" stops being verbatim.
   */
  headerCategoryName: string | null;
  activeTab: string;
  isSaving: boolean;
  form: FeedbackDecisionForm;
  drafts: FeedbackComposerDrafts;
  comments: FeedbackComment[];
  userMessages: FeedbackUserMessage[];
}

/**
 * The dialog's leading chip strip, exactly as the header renders it. This
 * surface has no numeric KPI tiles; these chips are what it leads with, so
 * every payload from the dialog carries them in the body AND the envelope
 * attributes per the page-KPI rule. They reflect the SAVED record — the live
 * form values live under `form`, and differ whenever there are unsaved edits.
 */
export function feedbackHeaderChips(
  item: UserFeedback,
  categoryName?: string | null,
): Record<string, string | number> {
  const chips: Record<string, string | number> = {
    type: feedbackTypeLabels[item.feedback_type],
    status: item.status,
    priority: item.priority,
    route: item.route,
    user: item.username || "Anonymous",
    created: formatDistanceToNow(new Date(item.created_at), {
      addSuffix: true,
    }),
  };
  if (item.work_priority !== null) chips.work_priority = `#${item.work_priority}`;
  if (categoryName) chips.category = categoryName;
  return chips;
}

const noneToNull = (value: string) => (value === "none" ? null : value);

/**
 * The exact set of writes "Save Changes" would perform, as readable lines.
 * Mirrors `handleSaveDecision` predicate for predicate — if these drift, the
 * agent is told about a change the Save button would not actually make.
 */
export function feedbackDetailUnsavedChanges(view: FeedbackDetailView): string[] {
  const { item, form } = view;
  const changes: string[] = [];
  const push = (label: string, from: unknown, to: unknown) =>
    changes.push(`${label}: ${from ?? "(empty)"} → ${to ?? "(empty)"}`);

  if (form.decision !== (item.admin_decision || "pending"))
    push("Decision", item.admin_decision || "pending", form.decision);
  if (form.direction !== (item.admin_direction || ""))
    push("Direction", item.admin_direction || "(empty)", form.direction || "(empty)");
  if (
    form.workPriority !==
    (item.work_priority !== null ? String(item.work_priority) : "")
  )
    push("Work priority", item.work_priority, form.workPriority || "(cleared)");
  if (form.adminNotes !== (item.admin_notes || ""))
    push("Admin notes", item.admin_notes || "(empty)", form.adminNotes || "(empty)");
  if (form.status !== item.status) push("Status", item.status, form.status);
  if (form.hasOpenIssues !== (item.has_open_issues ?? false))
    push("Has open issues", item.has_open_issues ?? false, form.hasOpenIssues);
  if (noneToNull(form.categoryId) !== (item.category_id ?? null))
    push("Category", item.category_id, form.categoryName ?? noneToNull(form.categoryId));
  if (noneToNull(form.assigneeId) !== (item.assigned_to ?? null))
    push("Assignee", item.assigned_to, form.assigneeName ?? noneToNull(form.assigneeId));
  if (noneToNull(form.parentId) !== (item.parent_id ?? null))
    push("Parent", item.parent_id, noneToNull(form.parentId));

  return changes;
}

/** Unsent composer content, described so the agent knows it is NOT posted. */
export function feedbackDraftLines(drafts: FeedbackComposerDrafts): string[] {
  const lines: string[] = [];
  if (drafts.newComment.trim())
    lines.push(`Internal comment (unsent): ${drafts.newComment}`);
  if (drafts.userReplyText.trim())
    lines.push(`Reply to user (unsent): ${drafts.userReplyText}`);
  if (drafts.replyImages.length)
    lines.push(`Reply attachments (unsent): ${drafts.replyImages.length}`);
  if (drafts.showUserReviewCompose && drafts.userReviewMessage.trim())
    lines.push(`Review-request message (unsent): ${drafts.userReviewMessage}`);
  if (drafts.composeImages.length)
    lines.push(`Review-request attachments (unsent): ${drafts.composeImages.length}`);
  if (drafts.pendingTestResult)
    lines.push(
      `Pending test result "${drafts.pendingTestResult}" awaiting feedback text: ${
        drafts.testFeedbackText || "(empty)"
      }`,
    );
  return lines;
}

export function feedbackDetailHuman(view: FeedbackDetailView): string {
  const { item, form } = view;
  const chips = feedbackHeaderChips(item, view.headerCategoryName);
  const unsaved = feedbackDetailUnsavedChanges(view);
  const draftLines = feedbackDraftLines(view.drafts);

  const lines: string[] = [
    `Feedback ${item.id.slice(0, 8)} — ${Object.entries(chips)
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
      .join(" · ")}`,
    `Tab: ${view.activeTab}`,
    "",
    "Description:",
    item.description,
    "",
    "Admin decision form (LIVE values — may include unsaved edits):",
    `- Decision: ${form.decision}`,
    `- Direction: ${form.direction || "(empty)"}`,
    `- Work priority: ${form.workPriority || "(none)"}`,
    `- Status: ${form.status}`,
    `- Has open issues: ${form.hasOpenIssues ? "Yes" : "No"}`,
    `- Category: ${form.categoryName ?? "(none)"}`,
    `- Assignee: ${form.assigneeName ?? "(unassigned)"}`,
    `- Parent: ${noneToNull(form.parentId) ?? "(none)"}`,
    `- Admin notes: ${form.adminNotes || "(empty)"}`,
  ];

  if (unsaved.length > 0) {
    lines.push(
      "",
      `UNSAVED CHANGES (${unsaved.length}) — not written until "Save Changes":`,
      ...unsaved.map((change) => `• ${change}`),
    );
  } else {
    lines.push("", "No unsaved changes.");
  }

  if (draftLines.length > 0) {
    lines.push(
      "",
      `UNSENT DRAFTS (${draftLines.length}):`,
      ...draftLines.map((draft) => `• ${draft}`),
    );
  }

  if (view.isSaving) lines.push("", "Saving…");

  lines.push(
    "",
    `Threads: ${view.comments.length} internal comment(s), ${view.userMessages.length} user message(s).`,
  );
  return lines.join("\n");
}

/**
 * THE what-I-see payload for the detail dialog — the default "Copy for AI".
 * The full record + threads dump stays available as the "Everything" variant
 * at the callsite, never as the default.
 */
export function feedbackDetailAgentPayload(
  view: FeedbackDetailView,
): AgentPayloadInput {
  const { item, form } = view;
  const chips = feedbackHeaderChips(item, view.headerCategoryName);
  const unsaved = feedbackDetailUnsavedChanges(view);
  const draftLines = feedbackDraftLines(view.drafts);

  return {
    kind: "feedback-detail-form",
    location:
      "AI Matrx Admin — Feedback Management · detail dialog (/administration/users/feedback)",
    description:
      "The feedback detail dialog as the admin sees it right now: the header chips, the open tab, the LIVE admin-decision form values (which may differ from the saved record), an explicit unsaved-changes diff, any unsent comment/reply/review drafts, and the loaded threads.",
    data: {
      feedback: {
        id: item.id,
        type: feedbackTypeLabels[item.feedback_type],
        route: item.route,
        username: item.username || "Anonymous",
        description: item.description,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
      // The dialog's leading chip strip, verbatim (saved values).
      page_kpis: chips,
      active_tab: view.activeTab,
      admin_decision_form: {
        note: 'LIVE control values at copy time — NOT in the database until "Save Changes" is clicked.',
        decision: form.decision,
        direction: form.direction,
        work_priority: form.workPriority,
        status: form.status,
        has_open_issues: form.hasOpenIssues,
        category: form.categoryName ?? noneToNull(form.categoryId),
        assignee: form.assigneeName ?? noneToNull(form.assigneeId),
        parent_id: noneToNull(form.parentId),
        admin_notes: form.adminNotes,
        unsaved_changes: unsaved,
        saving: view.isSaving,
      },
      unsent_drafts: {
        note: "Typed but NOT posted — these exist only in the open dialog.",
        internal_comment: view.drafts.newComment || null,
        user_reply: view.drafts.userReplyText || null,
        reply_images: view.drafts.replyImages,
        review_request_message: view.drafts.showUserReviewCompose
          ? view.drafts.userReviewMessage || null
          : null,
        review_request_images: view.drafts.composeImages,
        pending_test_result: view.drafts.pendingTestResult,
        test_feedback_text: view.drafts.testFeedbackText || null,
        summary: draftLines,
      },
      saved_record: {
        note: "The row as last fetched — the baseline the diff above is taken against.",
        status: item.status,
        priority: item.priority,
        admin_decision: item.admin_decision,
        admin_direction: item.admin_direction,
        admin_notes: item.admin_notes,
        work_priority: item.work_priority,
        category_id: item.category_id,
        assigned_to: item.assigned_to,
        parent_id: item.parent_id,
        has_open_issues: item.has_open_issues,
        testing_result: item.testing_result,
      },
      comments: view.comments,
      user_messages: view.userMessages,
    },
    summary: feedbackDetailHuman(view),
    attributes: {
      ...chips,
      id: item.id,
      tab: view.activeTab,
      unsaved_changes: unsaved.length,
      unsent_drafts: draftLines.length,
      comments: view.comments.length,
      user_messages: view.userMessages.length,
    },
  };
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
