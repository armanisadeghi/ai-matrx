-- chair-step: DOORS-ONLY-3 inverse -- RE-GRANTS the client write privileges on the thirty-three
-- platform/iam tables the chair step withdrew. Running this puts the declared write surface back
-- on every one of them. The restrictive refusal policies stay in place, so no write becomes
-- reachable again by this file alone -- but the surface the ruling is about returns, and one
-- dropped policy would make it live. Only run it to undo a withdrawal that broke a real path,
-- and say which path.
--
-- It restores the TABLE grant only, deliberately: the column-level grants the forward file also
-- withdrew are `iam.apply_table_grants`' own output, and the way to get those back correctly is
-- to re-run that function for the table, which knows which columns are client-excluded. A blunt
-- column re-grant here would hand back a column somebody deliberately withheld.

do $regrant$
declare
  t record;
begin
  for t in select * from (values
  ('iam', 'access_audit'),
  ('iam', 'emergency_door_request'),
  ('iam', 'industries'),
  ('iam', 'industry_curators'),
  ('iam', 'invitations'),
  ('iam', 'membership_grant'),
  ('iam', 'memberships'),
  ('iam', 'org_industries'),
  ('iam', 'org_member_controls'),
  ('iam', 'organization_preferences'),
  ('iam', 'organizations'),
  ('iam', 'system_orgs'),
  ('iam', 'system_personal_org_failures'),
  ('platform', 'action_request'),
  ('platform', 'activity_log'),
  ('platform', 'assist_producer_policy_history'),
  ('platform', 'ddl_guard_log'),
  ('platform', 'egress_device'),
  ('platform', 'entity_grants'),
  ('platform', 'feature_knob'),
  ('platform', 'flexible_data'),
  ('platform', 'guided_checklist_run'),
  ('platform', 'knob_scope_kind'),
  ('platform', 'knob_write_door'),
  ('platform', 'lifecycle_archive'),
  ('platform', 'lifecycle_archive_row'),
  ('platform', 'lifecycle_audit'),
  ('platform', 'lifecycle_map_build'),
  ('platform', 'lifecycle_run'),
  ('platform', 'masterwork_run'),
  ('platform', 'retention_policy'),
  ('platform', 'route_manifest'),
  ('platform', 'share_links')
  ) as v(s, tb)
  loop
    execute format('grant insert, update, delete on %I.%I to authenticated', t.s, t.tb);
  end loop;
end;
$regrant$;
