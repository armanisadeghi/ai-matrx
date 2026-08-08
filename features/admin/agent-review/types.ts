import type { Database } from "@/types/database.types";

export type ReviewQueueRow = Database["agent"]["Tables"]["review_queue"]["Row"];
export type ReviewQueueUpdate =
  Database["agent"]["Tables"]["review_queue"]["Update"];

export const REVIEW_STATUSES = [
  "pending",
  "changes_requested",
  "approved",
  "archived",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: string): value is ReviewStatus {
  return REVIEW_STATUSES.some((status) => status === value);
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
  archived: "Archived",
};
