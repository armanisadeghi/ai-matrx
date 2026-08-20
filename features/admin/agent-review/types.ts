import type { Database } from "@/types/database.types";

export type ReviewQueueRow = Database["agent"]["Tables"]["review_queue"]["Row"];
export type ReviewQueueUpdate =
  Database["agent"]["Tables"]["review_queue"]["Update"];

export const REVIEW_STATUSES = [
  "submitted",
  "agent_review",
  "agent_changes_requested",
  "ready_for_human",
  "human_changes_requested",
  "approved",
  "archived",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: string): value is ReviewStatus {
  return REVIEW_STATUSES.some((status) => status === value);
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  submitted: "Submitted",
  agent_review: "Agent review",
  agent_changes_requested: "Agent repair",
  ready_for_human: "Ready for you",
  human_changes_requested: "Your changes requested",
  approved: "Approved",
  archived: "Archived",
};

export const REVIEW_STAGE_ORDER: ReviewStatus[] = [
  "submitted",
  "agent_review",
  "agent_changes_requested",
  "ready_for_human",
  "human_changes_requested",
  "approved",
  "archived",
];
