-- LANE W1-ORG — THE RED TWIN of `scripts/campaign-tests/w1_org_c7.sql`.
--
-- A guard you cannot show failing is not a guard. This file makes the FOUR changes that would
-- undo this seat's four laws, one at a time, inside ONE transaction that ends in ROLLBACK, and
-- asserts that each one really does let the wrong thing through. If any block stays green after
-- its law is removed, the law was never doing the work and this file says so by name.
--
--   1. drop the trigger `_doctrine_field_shape_guard`  -> a picture lands as a URL string
--      (REC-31), a person lands as an email string (REC-30) and a per-person field lands on a
--      shared table (REC-39)
--   2. put `billing.resolve_tier`'s per-person body back -> the tier stops following the
--      person's default organization even with the guard ON (REC-47)
--   3. re-create `organizations_one_personal_per_creator` -> `is_personal` RULES again (REC-61)
--   4. take the `keep` arm out of `iam.legacy_column_worklist()` -> the verb happily renames the
--      personal variant's `user_id`, which is its table's access owner (REC-63)
--
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_org_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_org_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $b$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w1_org_red.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $b$;

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('entity_custom_fields_guard', 'signup_provisioning_guard');

do $t$
declare
  v_org   uuid := gen_random_uuid();
  v_defn  uuid;
  v_user  uuid;
  v_tier  billing.tier;
  v_n     integer;
  v_txt   text;
begin
  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'Cascade Electronics Recovery', 'cascade-electronics-recovery-red', 'CER');
  insert into platform.custom_entity_definition (id, slug, name, name_plural, organization_id)
  values (gen_random_uuid(), 'pickups', 'Pickup', 'Pickups', v_org)
  returning id into v_defn;

  -- ===================================================================== RED 1: the shape guard
  drop trigger _doctrine_field_shape_guard on platform.custom_field_definition;

  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'avatar_url', 'Avatar URL', 'url', v_org);
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'owner_email', 'Owner email', 'email', v_org);
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'my_rating', 'My rating', 'number', v_org);

  select count(*) into v_n from platform.custom_field_definition
   where organization_id = v_org and field_key in ('avatar_url', 'owner_email', 'my_rating');
  if v_n <> 3 then
    raise exception 'RED 1 IS NOT RED: with the trigger dropped only % of the 3 forbidden fields landed, so something else was refusing them and the trigger was never the guard', v_n;
  end if;
  raise notice 'RED 1 — trigger dropped: a picture as a URL, a person as an email and a per-person field ALL land. The guard is what was stopping them.';

  -- ================================================================ RED 2: the tier resolution
  create or replace function billing.resolve_tier(p_user uuid)
  returns billing.tier language sql stable set search_path to 'billing', 'public'
  as $f$
    select billing.tier_max(
      coalesce((select case when s.status = 'trialing' then 'trial'::billing.tier else 'premium'::billing.tier end
                  from billing.subscription s
                 where s.organization_id = iam.default_organization_id(p_user)
                   and s.status in ('trialing','active','past_due')
                 order by s.current_period_end desc nulls last limit 1), 'free'::billing.tier),
      coalesce((select up.tier from billing.user_plan up
                 where up.user_id = p_user and up.effective_from <= now()
                   and (up.expires_at is null or up.expires_at > now())), 'free'::billing.tier));
  $f$;

  select u.id into v_user from auth.users u order by u.created_at limit 1;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, v_user, 'owner', 'active');
  insert into users.user_preferences (user_id, preferences, default_organization_id)
  values (v_user, '{}'::jsonb, v_org)
  on conflict (user_id) do update set default_organization_id = excluded.default_organization_id;
  insert into billing.org_plan (organization_id, tier, source, note)
  values (v_org, 'premium', 'complimentary', 'RED fixture');

  v_tier := billing.resolve_tier(v_user);
  if v_tier <> 'free' then
    raise exception 'RED 2 IS NOT RED: the per-person body still answered % for a person whose only premium plan is their organization''s', v_tier;
  end if;
  raise notice 'RED 2 — the per-person body restored: the person''s organization holds a premium plan and resolve_tier answers free. The organization route is what was earning the premium.';

  -- ============================================================ RED 3: the deprecated flag rules
  create unique index organizations_one_personal_per_creator
    on iam.organizations using btree (created_by)
    where ((is_personal is true) and (created_by is not null));
  select count(*) into v_n from pg_indexes
   where schemaname = 'iam' and indexname = 'organizations_one_personal_per_creator';
  if v_n <> 1 then
    raise exception 'RED 3 IS NOT RED: the enforcement index could not be put back';
  end if;
  raise notice 'RED 3 — the partial unique index is back, so is_personal ENFORCES again and REC-61''s deprecation is undone by one statement.';

  -- ================================================== RED 4: the work list loses its `keep` arm
  create or replace function iam.legacy_column_worklist()
  returns table(schema_name text, table_name text, token text, variant text,
                legacy_column text, canonical_column text, disposition text, statement text)
  language sql stable set search_path to 'pg_catalog'
  as $f$
    select et.schema_name, et.table_name, et.token,
           coalesce(nullif(et.rls_variant, ''), 'standard'),
           'user_id', 'created_by', 'rename',
           format('alter table %I.%I rename column user_id to created_by;', et.schema_name, et.table_name)
      from platform.entity_types et
     where et.is_active and et.schema_name is not null and et.table_name is not null
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and coalesce(nullif(et.rls_variant, ''), 'standard') = 'personal'
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'user_id');
  $f$;

  select w.schema_name || '.' || w.table_name into v_txt
    from iam.legacy_column_worklist() w limit 1;
  if v_txt is null then
    raise exception 'RED 4 IS NOT RED: no personal-variant table carries user_id, so the trap cannot be demonstrated';
  end if;
  v_txt := iam.converge_legacy_column(split_part(v_txt, '.', 1), split_part(v_txt, '.', 2), 'user_id');
  if v_txt not like 'alter table%rename column user_id to created_by%' then
    raise exception 'RED 4 IS NOT RED: the verb still refused the personal variant (got %)', v_txt;
  end if;
  raise notice 'RED 4 — with the keep arm removed the verb hands back "%" for a table whose RLS lane READS user_id. That arm is the whole difference between a conversion and an outage.', v_txt;
end $t$;

rollback;
