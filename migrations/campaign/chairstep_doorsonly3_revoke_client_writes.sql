-- chair-step: DOORS-ONLY-3 -- WITHDRAW the dead client write GRANTs on the thirty-three
-- platform/iam tables that are already refused by a named restrictive policy but still declare
-- the privilege. This is the second half of the ruling: a refusal makes a write UNREACHABLE, a
-- revoke makes the surface GONE, and the campaign is about the surface -- `iam.apply_rls`
-- regenerates permissive policies, and a grant nobody uses is a grant the next regeneration
-- makes live again in one statement.
--
-- WHAT IS IN IT, AND WHAT IS DELIBERATELY NOT. Every table here carries a
-- `*_client_insert_refused` / `_update_` / `_delete_` restrictive policy TODAY, read live from
-- `pg_policy` when this file was written, so withdrawing the grant cannot take away a path
-- anybody is using -- the path is already shut. The three tables this lane has NOT yet closed
-- (`platform.saved_view`, `platform.rulebook`, `platform.categories`) are NOT here: their
-- callers still write them directly and revoking would break three live features.
--
-- IT COVERS TABLE-LEVEL AND COLUMN-LEVEL GRANTS BOTH. `iam.apply_table_grants` withholds a
-- column named in `client_excluded_columns` by granting the OTHER columns individually, so on
-- some of these tables `authenticated` holds no table privilege and a fistful of column ones --
-- and `REVOKE INSERT ON t` does not touch those. `has_any_column_privilege` is what the guard
-- asks, so a table-level-only revoke would leave the finding exactly where it was. The loop
-- below revokes the table grant and then every column grant it can still see.
--
-- WHY A CHAIR STEP: `platform` and `iam` are REVOKE-protected schemas
-- (scripts/lib/migration-target.ts REVOKE_PROTECTED_SCHEMAS), so the withdrawal is handed UP
-- rather than run by the lane. Run it with:
--   pnpm db:apply migrations/campaign/chairstep_doorsonly3_revoke_client_writes.sql \
--     --target production --source campaign --lane DOORS-ONLY-3 \
--     --confirm-chair-step chairstep_doorsonly3_revoke_client_writes.sql
-- Inverse: migrations/inverse/chairstep_doorsonly3_revoke_client_writes.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- 99 RESIDUAL triples disappear from the census
--        entirely rather than moving tier.

set lock_timeout = '5s';

do $revoke$
declare
  t record;
  c record;
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
    -- The table grant.
    execute format('revoke insert, update, delete on %I.%I from authenticated, anon', t.s, t.tb);
    -- Every column grant that survives it. `information_schema.column_privileges` is
    -- role-filtered and would miss a grant made to PUBLIC, so the revoke below names PUBLIC
    -- too -- a grant `authenticated` INHERITS is just as much a key as one it holds.
    for c in
      select cp.column_name, cp.privilege_type
        from information_schema.column_privileges cp
       where cp.table_schema = t.s and cp.table_name = t.tb
         and cp.grantee in ('authenticated', 'anon', 'PUBLIC')
         and cp.privilege_type in ('INSERT', 'UPDATE')
    loop
      execute format('revoke %s (%I) on %I.%I from authenticated, anon',
                     c.privilege_type, c.column_name, t.s, t.tb);
    end loop;
  end loop;
end;
$revoke$;
