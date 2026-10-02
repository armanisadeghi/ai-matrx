/**
 * features/notifications/types.ts — the shell Inbox's row and its states.
 *
 * One row of `communication.notification` as the recipient sees it, read through
 * `communication.inbox_notifications` (the triage door, migration
 * `notifications_inbox_triage.sql`) or — while that door is not on this database —
 * the pre-triage `communication.my_notifications`, whose missing columns read as
 * null here and whose rows are labelled `triage: false` by the service.
 *
 * The columns mirror the door's RETURNS TABLE exactly. When
 * `types/database.types.ts` is regenerated (`pnpm db-types`) after the door lands
 * on the main database, derive this from `communication.Functions.inbox_notifications`.
 */

/** Where a notice appears and whether it interrupts (RESEARCH.md §3.1). */
export type NoticeBucket = "needs_you" | "direct" | "updates";

/** The page's views over the spine. `all` is never offered; it exists for the door. */
export type InboxState = "inbox" | "done" | "snoozed";

export interface InboxNotification {
  id: string;
  event_key: string;
  /** `notification_event_type.label` — the title when a producer wrote no subject. */
  event_label: string | null;
  bucket: NoticeBucket;
  subject: string | null;
  body: string | null;
  deep_link: string | null;
  target_kind: string | null;
  target_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  /** The person who caused it; null for the system or the recipient themselves. */
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  created_at: string;
  /** The moment it entered the list: `created_at`, or when a snooze ended. */
  sort_at: string;
  seen_at: string | null;
  read_at: string | null;
  done_at: string | null;
  snoozed_until: string | null;
  acted_at: string | null;
  outcome: string | null;
}

/** The badge and the tab counts (`communication.my_inbox_summary`). */
export interface InboxSummary {
  unseenNeedsYou: number;
  unseenDirect: number;
  unseenUpdates: number;
  unread: number;
  inbox: number;
  snoozed: number;
  done: number;
}

export type TriageAction =
  | "done"
  | "undone"
  | "read"
  | "unread"
  | "snooze"
  | "unsnooze";
