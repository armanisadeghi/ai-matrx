/**
 * Are the inbox triage doors (`communication.inbox_notifications`, `my_inbox_summary`,
 * `mark_inbox_seen`, `set_notifications_state`, `my_inbox_organizations`) on the live database?
 *
 * Yes: `migrations/notifications_inbox_triage.sql` was approved by Arman and applied to live on
 * 2026-10-07 (lane BELL-OWNER). The pre-triage fallback in `service.ts` still answers if a door ever
 * goes missing, and says so.
 */
export const TRIAGE_DOORS_LIVE = true;
