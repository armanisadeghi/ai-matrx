// Types for user feedback and bug reporting system

export type FeedbackType = "bug" | "feature" | "suggestion" | "other";
export type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "awaiting_review"
  | "user_review"
  | "resolved"
  | "closed"
  | "wont_fix"
  | "split"
  | "deferred";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";
export type AdminDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "deferred"
  | "split";
export type AiComplexity = "simple" | "moderate" | "complex";
export type TestingResult =
  | "pending"
  | "pass"
  | "fail"
  | "partial"
  /** Set with force-close to satisfy DB triggers; stored as plain string in Postgres */
  | "admin_closed";

export interface FeedbackCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface UserFeedback {
  id: string;
  user_id: string;
  username: string | null;
  feedback_type: FeedbackType;
  route: string;
  description: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  admin_notes: string | null;
  ai_assessment: string | null;
  autonomy_score: number | null;
  resolution_notes: string | null;
  image_urls: string[] | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  user_confirmed_at: string | null;
  // Parent-child for split issues
  parent_id: string | null;
  // Category
  category_id: string | null;
  // Admin assignee (must be a user in the admin.admins table). Set by admins
  // at submit time or post-submit. When this changes to a non-null value other
  // than the actor, an in-app DM + email notification is sent to the assignee.
  assigned_to: string | null;
  // AI triage fields
  ai_solution_proposal: string | null;
  ai_suggested_priority: string | null;
  ai_complexity: AiComplexity | null;
  ai_estimated_files: string[] | null;
  // Admin decision fields
  admin_direction: string | null;
  admin_decision: AdminDecision;
  work_priority: number | null;
  // Testing fields
  testing_instructions: string | null;
  testing_url: string | null;
  testing_result: TestingResult | null;
  // Flags
  has_open_issues: boolean;
}

export interface FeedbackComment {
  id: string;
  feedback_id: string;
  author_type: "user" | "admin" | "ai_agent";
  author_name: string | null;
  content: string;
  created_at: string;
}

/** Messages between admin and user (separate from internal comments) */
export interface FeedbackUserMessage {
  id: string;
  feedback_id: string;
  sender_type: "admin" | "user";
  sender_name: string | null;
  content: string;
  created_at: string;
  email_sent: boolean;
  image_urls?: string[] | null;
}

export interface CreateFeedbackInput {
  feedback_type: FeedbackType;
  route: string;
  description: string;
  image_urls?: string[];
  /**
   * Admin-only. Server action ignores these fields if the caller is not an
   * admin. Setting `assigned_to` to a non-self admin user fires a DM + email
   * notification post-insert.
   */
  category_id?: string | null;
  assigned_to?: string | null;
}

export interface UpdateFeedbackInput {
  description?: string;
  feedback_type?: FeedbackType;
  route?: string;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  admin_notes?: string;
  ai_assessment?: string;
  autonomy_score?: number;
  resolution_notes?: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  admin_direction?: string;
  admin_decision?: AdminDecision;
  work_priority?: number;
  testing_instructions?: string;
  testing_url?: string;
  testing_result?: TestingResult;
  has_open_issues?: boolean;
  category_id?: string | null;
  parent_id?: string | null;
  /** Admin-only. Reassigns the feedback item (DM + email fire on change). */
  assigned_to?: string | null;
}

/** Minimal info about an admin who can be assigned a feedback item. */
export interface FeedbackAssignableAdmin {
  user_id: string;
  email: string | null;
  display_name: string | null;
  level: "developer" | "senior_admin" | "super_admin";
}

/** Category color mappings (Tailwind classes) matching the color field in feedback_categories */
export const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  blue: {
    bg: "bg-blue-500/15",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-300 dark:border-blue-700",
  },
  purple: {
    bg: "bg-purple-500/15",
    text: "text-purple-700 dark:text-purple-400",
    border: "border-purple-300 dark:border-purple-700",
  },
  green: {
    bg: "bg-green-500/15",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-300 dark:border-green-700",
  },
  cyan: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-700 dark:text-cyan-400",
    border: "border-cyan-300 dark:border-cyan-700",
  },
  yellow: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-300 dark:border-yellow-700",
  },
  red: {
    bg: "bg-red-500/15",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-300 dark:border-red-700",
  },
  orange: {
    bg: "bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-300 dark:border-orange-700",
  },
  pink: {
    bg: "bg-pink-500/15",
    text: "text-pink-700 dark:text-pink-400",
    border: "border-pink-300 dark:border-pink-700",
  },
  indigo: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-400",
    border: "border-indigo-300 dark:border-indigo-700",
  },
  violet: {
    bg: "bg-violet-500/15",
    text: "text-violet-700 dark:text-violet-400",
    border: "border-violet-300 dark:border-violet-700",
  },
  gray: {
    bg: "bg-gray-500/15",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-300 dark:border-gray-700",
  },
};

/** Human-readable status labels for the user portal */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Submitted",
  triaged: "Under Review",
  in_progress: "In Progress",
  awaiting_review: "Fix Ready",
  user_review: "Your Review Needed",
  resolved: "Verified",
  closed: "Closed",
  wont_fix: "Won't Fix",
  split: "Split",
  deferred: "Deferred",
};

/** Pipeline-aligned status labels for the admin UI */
export const ADMIN_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In Progress",
  awaiting_review: "Ready for Testing",
  user_review: "User Review",
  resolved: "Verified",
  closed: "Closed",
  wont_fix: "Won't Fix",
  split: "Split",
  deferred: "Deferred",
};

/** Status badge color mappings (Tailwind classes) */
export const FEEDBACK_STATUS_COLORS: Record<
  FeedbackStatus,
  { bg: string; text: string }
> = {
  new: { bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  triaged: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-400",
  },
  in_progress: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-400",
  },
  awaiting_review: {
    bg: "bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-400",
  },
  user_review: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-700 dark:text-cyan-400",
  },
  resolved: {
    bg: "bg-green-500/15",
    text: "text-green-700 dark:text-green-400",
  },
  closed: { bg: "bg-muted", text: "text-muted-foreground" },
  wont_fix: { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
  split: {
    bg: "bg-purple-500/15",
    text: "text-purple-700 dark:text-purple-400",
  },
  deferred: { bg: "bg-gray-500/15", text: "text-gray-700 dark:text-gray-400" },
};

/** Admin decision labels and colors */
export const ADMIN_DECISION_LABELS: Record<AdminDecision, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  deferred: "Deferred",
  split: "Split",
};

export const ADMIN_DECISION_COLORS: Record<
  AdminDecision,
  { bg: string; text: string }
> = {
  pending: { bg: "bg-gray-500/15", text: "text-gray-700 dark:text-gray-400" },
  approved: {
    bg: "bg-green-500/15",
    text: "text-green-700 dark:text-green-400",
  },
  rejected: { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
  deferred: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-400",
  },
  split: {
    bg: "bg-purple-500/15",
    text: "text-purple-700 dark:text-purple-400",
  },
};

export type AnnouncementType = "info" | "warning" | "critical" | "update";

export interface SystemAnnouncement {
  id: string;
  title: string;
  message: string;
  announcement_type: AnnouncementType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  min_display_seconds: number;
}

export interface CreateAnnouncementInput {
  title: string;
  message: string;
  announcement_type?: AnnouncementType;
  min_display_seconds?: number;
}

export interface UpdateAnnouncementInput {
  title?: string;
  message?: string;
  announcement_type?: AnnouncementType;
  is_active?: boolean;
  min_display_seconds?: number;
}
