-- staff_door_six_tokens_dd137b_2026_09_18
--
-- 🚨 TWO FILES, ONE FINDING. This is the ADDITIVE half: the registry declares the lane closed,
-- row_version regenerates, the bespoke read policies are superseded through the generator's own
-- door and re-created without the staff arm, the vault owner gets their read lane. The four
-- `drop policy platform_admin_all` statements (a generated, platform-wide lane the supersede door
-- refuses by design, and a DROP the header-less judge refuses by name) live in
-- migrations/chair_step_2026_09_18_db_guard_findings_non_additive.sql, confirmed by the owner at a
-- terminal (migrations/JUDGMENT.md §5). check-staff-door stays red on those four until it lands.
--
-- THE FINDING. `pnpm exec tsx scripts/check-staff-door.ts --strict` names six tokens that resolve
-- `private` or `confidential` and still let our own staff read with no door: four components /
-- ledgers (data_rights_event, integration_connection_resource, row_version, user_secret_audit — a
-- component asks its parent, db-rules §6d-1) and two more (integration_connection, admin_markdown_sample).
--
-- THE CLASS. DD-137b closed the platform-admin lane on 147 private/confidential tables by ONE
-- mechanism: `suppress_platform_admin_lane = true` on the registry row, then regeneration. Every
-- table here missed it for one of two reasons — it carries BESPOKE policies the generator never
-- authored (so no regeneration ever touched its `is_platform_admin()` arm), or it was registered
-- after the sweep with the flag left false. Each is closed the DD-137b way, and the registry row
-- declares it, so the next regeneration cannot put the lane back.
--
--   row_version (history.row_versions, ledger, confidential) — generated std_select carried the staff
--     arm because the flag was false. Flag + regeneration. Its restrictive bespoke `platform_admin_only`
--     is left where it is (it narrows, never widens).
--   data_rights_event (education, ledger, private) — bespoke `data_rights_event_select` had an
--     `is_platform_admin() OR` arm and `platform_admin_all` beside it. Both go; the subject reads
--     their own rights events. No client reads it today (census 2026-09-18).
--   integration_connection + integration_connection_resource (users.*, entity + component, private) —
--     bespoke `*_read_owner_or_org` policies with the staff arm and `platform_admin_all`. The staff
--     arm and the admin policy go on both; the owner/org arms are untouched (five features read
--     these as the signed-in user: github, microsoft, google and bing marketing). Note for the owner
--     lane, not decided here: the class was DERIVED (`private`) while the live policy is owner-or-org;
--     that disagreement is recorded in FOUND_DEFECTS, not resolved by this file.
--   user_secret_audit (users, ledger, private, BESPOKE BY DESIGN with users.user_secrets — DD-137b11:
--     never iam.apply_rls) — its only policy was `platform_admin_all`. It goes; the vault owner reads
--     their own audit trail (§3.1: the owner lane exists for every class; the sibling
--     user_secret_grants already has `user_secret_grants_self_read`). No client reads it today.
--   admin_markdown_sample (admin, system, confidential) — platform-operator tooling content read by
--     the admin markdown tester as a super admin; it has no organization_id at all, so no class
--     lane other than staff can ever describe it. The staff lane IS the table. It stays open BY
--     DESIGN and becomes named residue in check-staff-door.ts with the reason stored here.
--
-- iam.apply_rls needs a short ACCESS EXCLUSIVE lock per policy change; history.row_versions is hot,
-- so the wait is bounded at 30s instead of the 2s default (a bound on waiting, never on holding).

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('row_version', 'data_rights_event', 'integration_connection',
                 'integration_connection_resource', 'user_secret_audit')
   and not suppress_platform_admin_lane;

-- row_version: generated set, regenerated with the lane suppressed.
select iam.apply_rls('history', 'row_versions', 'row_version', 'ledger');

-- data_rights_event: bespoke read loses the staff arm; the permissive admin policy goes.
select iam.supersede_bespoke_policies('education', 'data_rights_event', array['data_rights_event_select'],
  'DD-137b staff door (2026-09-18): the bespoke read lane carried an is_platform_admin() OR arm on a private ledger; re-created as the subject-only read the class allows.');
create policy data_rights_event_select on education.data_rights_event
  for select to authenticated
  using (user_id = (select auth.uid()));

-- integration_connection(+_resource): same, owner/org arms verbatim.
select iam.supersede_bespoke_policies('users', 'integration_connections', array['integration_connections_read_owner_or_org'],
  'DD-137b staff door (2026-09-18): the bespoke owner-or-org read lane carried an is_platform_admin() OR arm on a private entity; re-created with the owner/org arms verbatim and no staff arm.');
create policy integration_connections_read_owner_or_org on users.integration_connections
  for select to authenticated
  using (
    (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false)
    and deleted_at is null
    and (owner_user_id = (select auth.uid())
         or (organization_id is not null and organization_id in (select iam.my_orgs())))
  );
select iam.supersede_bespoke_policies('users', 'integration_connection_resources', array['integration_connection_resources_read_owner_or_org'],
  'DD-137b staff door (2026-09-18): the bespoke owner-or-org read lane carried an is_platform_admin() OR arm on a private component; re-created with the parent owner/org arms verbatim and no staff arm.');
create policy integration_connection_resources_read_owner_or_org on users.integration_connection_resources
  for select to authenticated
  using (
    (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false)
    and deleted_at is null
    and exists (
      select 1 from users.integration_connections connection
       where connection.id = integration_connection_resources.connection_id
         and connection.deleted_at is null
         and (connection.owner_user_id = (select auth.uid())
              or (connection.organization_id is not null
                  and connection.organization_id in (select iam.my_orgs()))))
  );

-- user_secret_audit: bespoke by design; the owner lane (the staff lane goes in the chair-step file).
create policy user_secret_audit_self_read on users.user_secret_audit
  for select to authenticated
  using (user_id = (select auth.uid()));

-- admin_markdown_sample: declared residue, reason stored where the guard prints it from.
update platform.entity_types
   set data_class_reason = coalesce(data_class_reason, '')
     || ' | STAFF LANE OPEN BY DESIGN (2026-09-18, staff_door_six_tokens_dd137b): platform-operator tooling '
     || 'content read by the admin markdown tester as a super admin; the table has no organization_id, so no '
     || 'class lane but the staff lane can describe it. Named residue in scripts/check-staff-door.ts.'
 where token = 'admin_markdown_sample'
   and coalesce(data_class_reason, '') not like '%STAFF LANE OPEN BY DESIGN%';

-- Proof, same transaction: no permissive read lane on the five closed tokens carries a staff
-- predicate in its qual (platform_admin_all itself is the chair-step file's to remove).
do $proof$
declare v_bad text; v_n int;
begin
  select count(*), string_agg(et.token || ':' || p.polname, ', ') into v_n, v_bad
    from platform.entity_types et
    join pg_policy p on p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
   where et.token in ('row_version', 'data_rights_event', 'integration_connection',
                      'integration_connection_resource', 'user_secret_audit')
     and p.polpermissive and p.polcmd in ('r', '*')
     and p.polname <> 'platform_admin_all'
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'is_platform_admin|is_super_admin';
  if v_n > 0 then
    raise exception 'staff_door: % permissive staff read arm(s) remain: %', v_n, v_bad;
  end if;
  if (select count(*) from platform.entity_types where token in ('row_version','data_rights_event',
        'integration_connection','integration_connection_resource','user_secret_audit')
        and suppress_platform_admin_lane) <> 5 then
    raise exception 'staff_door: a token does not declare the lane closed';
  end if;
end $proof$;
