/**
 * features/notifications/types.ts — the shell Inbox's row.
 *
 * One row of `communication.notification` as the recipient sees it through
 * the `communication.my_notifications` door: the in-app channel only, delivered
 * rows only, never the provider columns (to_address, provider_message_id, …).
 *
 * These columns mirror the door's RETURNS TABLE exactly. When
 * `types/database.types.ts` is regenerated (`pnpm db-types`) the door's return
 * type appears under `communication.Functions.my_notifications` and this type
 * can be derived from it instead of declared.
 */
export interface InboxNotification {
  id: string;
  event_key: string;
  subject: string | null;
  body: string | null;
  deep_link: string | null;
  target_kind: string | null;
  target_id: string | null;
  organization_id: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  acted_at: string | null;
  outcome: string | null;
}
