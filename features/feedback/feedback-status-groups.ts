/**
 * The groups the Feedback window's success counts use — and the list page's
 * `?show=` filter, so each count opens exactly the rows it counted
 * (page-pass 2026-09-27). One definition; the window and the page read it.
 */
import type { FeedbackStatus } from "@/types/feedback.types";

export const FEEDBACK_COUNT_GROUPS = {
  pending: ["new", "in_progress"],
  resolved: ["resolved", "closed"],
} as const satisfies Record<string, readonly FeedbackStatus[]>;

export type FeedbackCountGroup = keyof typeof FEEDBACK_COUNT_GROUPS;

export const FEEDBACK_LIST_HREF = "/settings/feedback";

export function feedbackListHref(group?: FeedbackCountGroup): string {
  return group ? `${FEEDBACK_LIST_HREF}?show=${group}` : FEEDBACK_LIST_HREF;
}

export function isFeedbackCountGroup(value: string | null): value is FeedbackCountGroup {
  return value === "pending" || value === "resolved";
}

export function inFeedbackGroup(status: string, group: FeedbackCountGroup): boolean {
  return (FEEDBACK_COUNT_GROUPS[group] as readonly string[]).includes(status);
}
