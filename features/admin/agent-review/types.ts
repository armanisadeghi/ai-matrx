import type { Database } from "@/types/database.types";

export type ReviewQueueRow = Database["agent"]["Tables"]["review_queue"]["Row"];

export type ReviewStatus = "pending" | "changes_requested" | "approved" | "archived";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
  archived: "Archived",
};
