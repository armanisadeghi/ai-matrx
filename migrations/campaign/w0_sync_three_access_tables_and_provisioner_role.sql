-- target: branch
-- w0_sync_three_access_tables_and_provisioner_role — THE BRANCH STOPS DOING SOMETHING
-- PRODUCTION STOPPED DOING.
--
-- 1. THE THREE TRIGGERS. `_stamp_org_default` is a BEFORE-INSERT trigger that fills
--    `organization_id` when the writer did not. It is live on roughly three hundred tables
--    on BOTH databases and this file touches none of them. It is live on exactly THREE
--    tables here that production removed it from — `iam.access_audit`,
--    `iam.emergency_door_request` and `platform.continued_access` — by aidream migration
--    `0758_the_three_access_tables_name_their_own_organization.sql` (2026-09-16 00:58).
--
--    That removal is the emergency work order `common-docs/projects/no-db-assigned-org/`:
--    every write carries an explicit `organization_id` and no trigger may choose one. So on
--    this branch an access-audit row written with no organization silently GETS one, and on
--    production the same write does not. `W2-ACCESS`, `W2-PRED` and `W2-TRUST` all rehearse
--    against `iam.access_audit` and `iam.emergency_door_request` under `LOCK:iam`. A lane
--    that proves an access decision against a row the branch quietly completed has proved
--    something about the branch, not about production.
--
--    The branch is AHEAD of production here, not behind, which is why no drift check that
--    only looks for ABSENCE would ever have found it. It came out of this lane's two-way
--    catalog comparison.
--
-- 2. THE ROLE. `matrx_provisioner` is lane B of the provisioner — NOLOGIN, no INHERIT, no
--    CREATEROLE, no BYPASSRLS, owning nothing and able to disable nothing (production's own
--    attributes, read from `pg_roles`). It does not exist on this branch, so production's
--    grants of `platform.provision_restricted` and `platform.provision_validate` to it could
--    not be carried over with the provisioner sync, and `platform`'s schema ACL differs by
--    exactly this one grantee. Created here with production's attributes and given
--    production's grants, so the provisioner rehearses with both its lanes present.
--
--    `svc_seo` is the OTHER role production has and this branch does not, and it is
--    deliberately NOT created here: it is a LOGIN role WITH BYPASSRLS, and an unattended
--    lane does not mint a login role that reads past every policy on a database holding a
--    copy of the real access graph. It stays named residue in BRANCH-SCHEMA-DRIFT.md.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync_three_access_tables_and_provisioner_role.sql --target branch --lane W0-SYNC --no-generate

drop trigger if exists _stamp_org_default on iam.access_audit;
drop trigger if exists _stamp_org_default on iam.emergency_door_request;
drop trigger if exists _stamp_org_default on platform.continued_access;

do $mig$
begin
  if not exists (select 1 from pg_roles where rolname = 'matrx_provisioner') then
    create role matrx_provisioner nologin noinherit nocreaterole nocreatedb nobypassrls;
    raise notice 'w0_sync: created role matrx_provisioner (nologin, noinherit) to match production.';
  else
    raise notice 'w0_sync: role matrx_provisioner already present; left as found.';
  end if;
end $mig$;

grant usage on schema platform to matrx_provisioner;
grant execute on function platform.provision_restricted(p_spec jsonb, p_org_id uuid) to matrx_provisioner;
grant execute on function platform.provision_validate(p_spec jsonb, p_lane text, p_org_id uuid) to matrx_provisioner;

-- and the three triggers are PROVED gone, rather than assumed gone.
do $mig$
declare v_left int;
begin
  select count(*) into v_left
    from pg_trigger t
   where t.tgname = '_stamp_org_default' and not t.tgisinternal
     and t.tgrelid in ('iam.access_audit'::regclass,
                       'iam.emergency_door_request'::regclass,
                       'platform.continued_access'::regclass);
  if v_left > 0 then
    raise exception 'w0_sync: % of the three _stamp_org_default triggers survived. The branch would still assign organizations production does not.', v_left;
  end if;
end $mig$;
