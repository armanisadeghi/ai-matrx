-- chair-step: DROPS only the outbound FK system_personal_org_failures_user_id_fkey on the empty iam.system_personal_org_failures and moves that table to graveyard (SET SCHEMA, reversible). No rows exist; no other object is touched.
-- lane: access-ladder T-3
-- lock: iam
--
-- access-ladder T-3 leftover: retire iam.system_personal_org_failures to the graveyard.
--
-- The table recorded failures of the retired "personal organization" provisioning path
-- (iam.ensure_personal_organization, dropped with iam.organizations.is_personal on 2026-09-26).
-- Signup now provisions through iam.provision_signup_organization, which never writes here.
-- Verified before this file: 0 rows; audit.relation_usage shows only its own triggers, one
-- outbound FK to auth.users and its entity_types row; no code in either repo reads it (only
-- generated ORM/type files, regenerated after this lands).
--
-- Reversible: SET SCHEMA, never DROP. Inverse: inverse/access_ladder_t3_retire_system_personal_org_failures_down.sql

-- 1. The registration goes inactive first (platform._enforce_entity_is_table refuses an active
--    entity pointing at graveyard).
update platform.entity_types
   set is_active = false
 where token = 'system_personal_org_failure';

-- 2. The outbound FK to a live table goes before the move (graveyard -> live FKs break
--    catalog-walking functions; see db-graveyard-table step 3).
alter table iam.system_personal_org_failures
  drop constraint if exists system_personal_org_failures_user_id_fkey;

-- 3. The move.
do $$ begin
  if to_regclass('iam.system_personal_org_failures') is not null then
    execute 'alter table iam.system_personal_org_failures set schema graveyard';
  end if;
end $$;

-- 4. Clean cut: the old name is registered dead.
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
select 'iam.system_personal_org_failures', null, 'graveyard.system_personal_org_failures',
       'access-ladder T-3 (2026-09-26): the personal-organization concept is gone; signup provisions via iam.provision_signup_organization and never recorded failures here. 0 rows.'
where not exists (select 1 from platform.deprecated_relations where old_ref = 'iam.system_personal_org_failures');

-- 5. Post-condition: nothing in graveyard points at a live table from this relation.
do $$ begin
  if exists (select 1 from pg_constraint
              where contype = 'f'
                and conrelid = 'graveyard.system_personal_org_failures'::regclass
                and confrelid::regclass::text not like 'graveyard.%') then
    raise exception 'graveyard.system_personal_org_failures still has an outbound FK to a live table';
  end if;
end $$;
