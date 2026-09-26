-- chair-step: rehearsal inverse of rca8b — restores the two org-member SELECT policies on the knob override tables.
-- window-class: two ALTER POLICY on the knob override tables; the supautils set (auth/storage/realtime) frozen until commit, milliseconds
-- Inverse of migrations/rca8b_personal_setting_rows_are_their_persons.sql (rehearsal only).

set local lock_timeout = '2s';

alter policy knob_override_read on platform.knob_override
  using ((organization_id in (select iam.my_orgs() as my_orgs)));

alter policy std_select on platform.knob_override_audit
  using (((organization_id is not null) and (organization_id in (select iam.my_orgs() as my_orgs))));
