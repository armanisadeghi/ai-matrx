-- The three shell-Inbox doors join the reviewed baseline of client-reachable
-- notification doors (CHECK 35, hr_l3_107). They were created 2026-09-19 through the
-- Supabase MCP (communication_my_notifications_doors) and, touching the notification
-- spine, entered the check's derived door set as "neither credentialed nor baselined" —
-- which failed `HR punch write path` on every branch, main included, from that moment.
--
-- Each door resolves auth.uid() inside its body and reads/updates ONLY rows where
-- recipient_user_id = caller, on the in_app channel; anon holds no EXECUTE. That is
-- exactly the own-data shape the baseline exists to sanction.
--
-- Applied live 2026-09-20 through the Supabase MCP with these same bytes. Idempotent.

insert into hr.notify_outsider_door_baseline (schema_name, function_name, identity_args, anon_ok, reason)
values
  ('communication','my_notifications','p_limit integer, p_before timestamp with time zone, p_unread_only boolean', false,
   'Own-data read: the caller''s own delivered in_app notices (recipient_user_id = auth.uid()). The shell Inbox list. anon has no EXECUTE.'),
  ('communication','my_notification_unread_count','', false,
   'Own-data read: count of the caller''s own unread in_app notices. The shell Inbox badge. anon has no EXECUTE.'),
  ('communication','mark_my_notifications_read','', false,
   'Own-data writer: stamps read_at on the caller''s own unread in_app notices only. The shell Inbox "Mark all read". anon has no EXECUTE.')
on conflict (schema_name, function_name, identity_args) do nothing;
