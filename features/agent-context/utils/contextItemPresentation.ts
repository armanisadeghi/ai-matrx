import type { ContextItem } from "../types";

/** True when `next_review_at` is in the past (schema has no computed `is_overdue_review` column). */
export function isContextReviewOverdue(
  item: Pick<ContextItem, "next_review_at">,
): boolean {
  if (!item.next_review_at) return false;
  return new Date(item.next_review_at) < new Date();
}
