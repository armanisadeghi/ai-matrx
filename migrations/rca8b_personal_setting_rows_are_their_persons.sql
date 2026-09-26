-- chair-step: narrows two SELECT policies (platform.knob_override knob_override_read, platform.knob_override_audit std_select) so a `user`-rung row is readable only by its own person; policy DDL holds ACCESS EXCLUSIVE on the two tables (and the auth/storage/realtime relations the generator touches) for milliseconds.
--
-- RC-A8 Q1, the table door (register row RC-A8; chair ruling 2026-09-26, access is personal).
-- platform.knob_override and platform.knob_override_audit are readable by every member of the row's
-- organization, so the stored `user`-rung rows — a person's own voice, default chat model, default
-- authoring model, and their history — were readable by any co-member straight through PostgREST
-- (REST seat, production, as test@test.com: admin@admin.com's rows in knob_override_audit came back).
-- A `user` row is now readable only by its person; the organization's own rows are unchanged; the
-- platform_admin_read lane and svc_all are untouched (law: our own admin access is never removed).
-- Both tables are uncertified (audit.summary.certified = false; hand policies from
-- scfg_02_scope_kinds_and_override_store.sql) — when they are canonicalized, the personal-row rule
-- must carry into the generated policies (noted in register row RC-A8).
-- Forcing suite: aidream db/tests/test_rca8_personal_settings_are_personal.py
-- (test_the_table_door_holds_no_colleagues_personal_rows, REST seat).
-- Inverse (rehearsal only): migrations/inverse/rca8b_personal_setting_rows_are_their_persons_down.sql

set local lock_timeout = '2s';

alter policy knob_override_read on platform.knob_override
  using ((organization_id in (select iam.my_orgs() as my_orgs))
         and (scope_kind <> 'user' or scope_id = (select auth.uid())));

alter policy std_select on platform.knob_override_audit
  using ((organization_id is not null)
         and (organization_id in (select iam.my_orgs() as my_orgs))
         and (scope_kind <> 'user' or scope_id = (select auth.uid())));
