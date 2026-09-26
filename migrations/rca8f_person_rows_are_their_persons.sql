-- draft: rc-a2-deep RC-A8 L4 person rows; remove when rehearsed + suite green on the clone
--
-- RC-A8 L4 (register row RC-A8; chair ruling 2026-09-26). A ROW THAT NAMES A PERSON IS THAT PERSON'S
-- ALONE — keyed on the row's PERSON column (user_id), never on whoever created it.
--
-- ui.ui_surface_agent_pref: a person's pick (user_id set), a scope's (scope_id set), or the
-- organization's default (neither). Its visibility defaults to `internal` and the generated read
-- admits every member for internal rows, so a colleague read which agent a person picked on every
-- surface (REST seat, production: test@test.com read admin@admin.com's probe pick in 884d1ce8).
-- communication.sms_notification_preferences: 2 of 3 live rows carry created_by NULL, so the
-- generated owner lane (created_by) and the personal variant (which refuses a table whose created_by
-- and user_id disagree, iam._apply_rls_unchecked) cannot own them; the chair ruled no data change —
-- the owner is the row's person column.
--
-- The form, the one this estate already uses for person-keyed rows (users.user_secrets "Users manage
-- own secrets", users.credential_items credential_items_owner_read) and the DD-147 rule that
-- iam.apply_rls preserves bespoke policies:
--   * a RESTRICTIVE read policy — a row that names a person is readable only by that person or a
--     platform admin (our own admin read is never removed); a row that names nobody is untouched, so
--     organization defaults and scope rows keep the generated rules;
--   * for sms_notification_preferences also a PERMISSIVE read keyed on user_id, so its person reads a
--     row with no created_by.
-- The personal variant is not used: its owner column is created_by by ruling (Arman 2026-09-23,
-- "user_id was retired in favour of created_by", recorded in iam._apply_rls_unchecked); keying the
-- generator on user_id would re-open the kernel/RLS split that ruling closed. Recorded in RC-A8.
-- Forcing suite: aidream db/tests/test_rca8_l4_a_persons_surface_agent_pick_is_theirs.py (REST seat).
-- Inverse (rehearsal only): migrations/inverse/rca8f_person_rows_are_their_persons_down.sql

set local lock_timeout = '2s';

create policy ui_surface_agent_pref_person_rows_are_theirs on ui.ui_surface_agent_pref
  as restrictive for select to authenticated
  using (user_id is null or user_id = (select auth.uid()) or (select public.is_platform_admin()));
comment on policy ui_surface_agent_pref_person_rows_are_theirs on ui.ui_surface_agent_pref is
  'RC-A8 L4 (2026-09-26): a row that names a person (user_id) is readable only by that person or a platform admin; organization defaults and scope rows (user_id NULL) keep the generated rules. RESTRICTIVE and bespoke, so iam.apply_rls preserves it (DD-147).';

create policy sms_notification_preferences_person_rows_are_theirs on communication.sms_notification_preferences
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
comment on policy sms_notification_preferences_person_rows_are_theirs on communication.sms_notification_preferences is
  'RC-A8 L4 (2026-09-26): a person''s SMS preference (their phone number) is readable only by that person (user_id) or a platform admin. RESTRICTIVE and bespoke, so iam.apply_rls preserves it (DD-147).';

create policy sms_notification_preferences_person_reads_own on communication.sms_notification_preferences
  as permissive for select to authenticated
  using (user_id = (select auth.uid()));
comment on policy sms_notification_preferences_person_reads_own on communication.sms_notification_preferences is
  'RC-A8 L4 (2026-09-26): the owner of an SMS preference is its person column, not its creator — a row written with created_by NULL is still read by its person. Bespoke, preserved by iam.apply_rls (DD-147).';
