/**
 * Are the inbox triage doors (`communication.inbox_notifications`, `my_inbox_summary`,
 * `mark_inbox_seen`, `set_notifications_state`, `my_inbox_organizations`) on the live database?
 *
 * They are NOT: `migrations/notifications_inbox_triage.sql` is a held draft (its first line: the owner is
 * told before it touches live). `my_inbox_summary` was never dropped — it was never created there, so
 * asking for it was a 404 on every page load. While this is false the reader goes straight to the
 * pre-triage doors (`my_notifications`, `my_notification_unread_count`) and says so (`triage: false`),
 * asking nothing that cannot answer. Flip it to true in the same change that lands the migration on live.
 */
export const TRIAGE_DOORS_LIVE = false;
