// features/employee-performance-reviews/standard/status.ts
//
// Words and tones for review statuses, and "what is the next step for me" — shared by the home
// list, the cycle page and the workspace so they never describe one review three ways.

import type { BadgeTone } from "@ai-matrx/design-system/controls";

import type { Outstanding, RatingPoint, ReviewStatus, ReviewSummary } from "./types";

const LABELS: Record<ReviewStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  self_submitted: "Self review in",
  manager_submitted: "Manager review in",
  both_submitted: "Ready to share",
  shared: "Shared",
  acknowledged: "Acknowledged",
  reopened: "Reopened",
  cancelled: "Cancelled",
};

const TONES: Record<ReviewStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  self_submitted: "info",
  manager_submitted: "info",
  both_submitted: "warning",
  shared: "primary",
  acknowledged: "success",
  reopened: "warning",
  cancelled: "neutral",
};

export const statusLabel = (s: ReviewStatus): string => LABELS[s] ?? String(s);
export const statusTone = (s: ReviewStatus): BadgeTone => TONES[s] ?? "neutral";

export const OUTSTANDING_LABEL: Record<Outstanding, string> = {
  self: "Employee's self review",
  manager: "Manager's review",
  share: "Manager to share",
  acknowledge: "Employee to acknowledge",
};

export function ratingLabel(points: RatingPoint[], key: string | null): string {
  if (!key) return "Not rated";
  return points.find((p) => p.key === key)?.label ?? key;
}

/** The one thing this person does next on this review, in the viewer's own terms. */
export function nextStep(r: ReviewSummary): string {
  if (r.status === "cancelled") return "Cancelled";
  if (r.cycleStatus !== "open") return "Cycle closed";
  if (r.can.acknowledge) return "Read and acknowledge";
  if (r.can.share) return "Share with the employee";
  if (r.can.submit_self || r.can.save_self) return "Write your self review";
  if (r.can.submit_manager || r.can.save_manager) return "Write your review";
  if (r.status === "acknowledged") return "Done";
  if (r.seats.includes("employee")) return r.status === "shared" ? "Read and acknowledge" : "Waiting for your manager";
  return "Waiting";
}

/** The due date that matters for what this review is waiting on. */
export function dueOn(r: ReviewSummary): string | null {
  if (r.status === "acknowledged" || r.status === "cancelled") return null;
  if (r.status === "both_submitted" || r.status === "shared") return r.shareDueOn;
  if (r.can.save_self || r.can.submit_self) return r.selfDueOn;
  return r.managerDueOn;
}

export function formatDay(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function periodLabel(start: string | null, end: string | null): string {
  return start && end ? `${formatDay(start)} to ${formatDay(end)}` : "-";
}
