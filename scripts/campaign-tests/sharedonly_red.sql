-- SHARED-ONLY — THE RED TWIN. WITH THIS LANE'S INVERSES RUN, EVERY CLAUSE FAILS.
--
-- RUN IT FROM THE REPOSITORY ROOT (the `\i` paths are relative to it), against the MAIN
-- database, exactly like the green suite. It opens ONE transaction, builds the same throwaway
-- organization, EXECUTES THIS LANE'S FOUR INVERSE FILES inside it — which both proves those
-- files are valid SQL and puts the database back in the state the sixth independent pass
-- found — asks the green suite's questions, requires every one of them to FAIL, and ROLLS
-- BACK. Nothing it does survives the transaction; the last line proves that by re-asking.
--
-- A GUARD THAT CANNOT GO RED IS NOT A GUARD. The five blocks below are the five sentences of
-- the sixth pass's finding, in its own words:
--
--   1. "We shared one record with her at Editor... every screen and every read door answers no"
--   2. "We shared the whole table with her instead... at every level the table opens and
--      contains ZERO ROWS"
--   3. a record SHE created is in a table she cannot open
--   4. the table holding her record never appears in her table list
--   5. the RLS mirror admits every member of a `shared_only` organization to every internal row

\set ON_ERROR_STOP on
\timing off

\set ORG   '\'50a30000-0000-4a00-8a00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '600s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'campaign-test/sharedonly_red', true);

-- ── the same fixture, in its own organization id ────────────────────────────────────────
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'SHARED-ONLY Red Throwaway', 'sharedonly-red-throwaway', 'SOR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'SHARED-ONLY red twin'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'SHARED-ONLY red twin');

do $t$
declare
  v_org   constant uuid := '50a30000-0000-4a00-8a00-000000000001';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '50a30000-0000-4a00-8a00-000000000011';
  v_a     constant uuid := '50a30000-0000-4a00-8a00-000000000021';
  t uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'sharedonly_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, null, 'record', jsonb_build_object('name', 'SHARED-ONLY Red HQ'), v_admin);
  t := custom.table_declare(v_org, jsonb_build_object(
    'name','Case','slug','sor_case','label_singular','Case','label_plural','Cases',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_hq::text));
  update custom.record set id = v_a where organization_id = v_org and id = t;
  update custom.record set data = data || jsonb_build_object('entity_definition_id', v_a::text)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and (data ->> 'entity_definition_id')::uuid = t;
  update custom.field set entity_definition_id = v_a where organization_id = v_org and entity_definition_id = t;
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by) values
    ('50a30000-0000-4a00-8a00-000000000031', v_org, v_a, 'record', jsonb_build_object('title','Case one'), v_admin),
    ('50a30000-0000-4a00-8a00-000000000032', v_org, v_a, 'record', jsonb_build_object('title','Case two'), v_admin),
    ('50a30000-0000-4a00-8a00-000000000033', v_org, v_a, 'record', jsonb_build_object('title','Case three'), v_admin);
  -- A record SHE created, and a record shared with her.
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by) values
    ('50a30000-0000-4a00-8a00-000000000034', v_org, v_a, 'record', jsonb_build_object('title','Dana''s own'),
     '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', '50a30000-0000-4a00-8a00-000000000031', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'editor', v_admin);
end $t$;

-- ── THIS LANE, UNDONE, inside the transaction. Newest first, exactly as rule 27 runs them. ──
\i migrations/inverse/sharedonly_the_census_names_the_kind_of_disagreement_down.sql
\i migrations/inverse/sharedonly_the_carrying_table_is_the_organizations_own_down.sql
\i migrations/inverse/sharedonly_knowing_a_table_is_not_being_carried_by_it_down.sql
\i migrations/inverse/sharedonly_a_shared_table_shows_its_rows_down.sql
\i migrations/inverse/sharedonly_the_rls_mirror_knows_the_member_knob_down.sql

-- ── EVERY QUESTION THIS LANE ANSWERS, ASKED OF THE UNDONE DATABASE ──────────────────────
--
-- These are asked of the ONE LADDER and of the READ DOOR'S OWN SET, as the role that owns the
-- store, rather than through the doors from the member's seat. That is deliberate: the green
-- suite drives the doors from two real seats, and `custom.assert_may_know_table` — the first
-- line of every one of them — asks EXACTLY block 1's question and nothing else, so a false
-- there IS the refusal the sixth pass photographed. Asking it here keeps the red twin from
-- depending on a definer/role boundary inside a transaction that has just replaced eleven
-- function bodies underneath itself.
do $t$
declare
  v_org   constant uuid := '50a30000-0000-4a00-8a00-000000000001';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_a     constant uuid := '50a30000-0000-4a00-8a00-000000000021';
  v_rec1  constant uuid := '50a30000-0000-4a00-8a00-000000000031';
  v_mine  constant uuid := '50a30000-0000-4a00-8a00-000000000034';
  v_set   record;
  v_red   text[] := '{}';
begin
  -- 1. SHE HOLDS THE RECORD AND THE TABLE IT LIVES IN IS INVISIBLE.
  if custom.has_visibility(v_dana, 'record', v_rec1, 'viewer')
     and not custom.has_visibility(v_dana, 'record', v_a, 'viewer') then
    v_red := v_red || array['1: she holds the record and the table it lives in answers no, so every screen refuses her'::text];
  end if;

  -- 2. THE WHOLE TABLE SHARED AT ADMIN, AND THE READ DOOR'S OWN SET CARRIES NOT ONE ROW.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', v_a, v_dana, 'admin', '87a6e699-3622-4869-8843-d0867456c0dd');
  v_set := custom.visible_set(v_dana, v_org, v_a, 'viewer'::public.permission_level);
  if not v_set.o_all_visible
     and coalesce(array_length(v_set.o_true_visibility, 1), 0) = 0
     and coalesce(array_length(v_set.o_carried_visible, 1), 0) = 0 then
    v_red := v_red || array['2: the whole table shared at ADMIN and the read door''s own set carries not one of its rows'::text];
  end if;
  delete from iam.permissions where resource_type = 'record' and resource_id = v_a and granted_to_user_id = v_dana;

  -- 3. A RECORD SHE CREATED, IN A TABLE THAT ANSWERS NO.
  if custom.has_visibility(v_dana, 'record', v_mine, 'viewer')
     and not custom.has_visibility(v_dana, 'record', v_a, 'viewer') then
    v_red := v_red || array['3: she created a row in this table and the table still answers no'::text];
  end if;

  -- 4. AND SO THE TABLE IS NOT IN THE LIST THE SCREENS BUILD.
  v_set := custom.visible_set(v_dana, v_org, custom.table_kernel_id(), 'viewer'::public.permission_level);
  if not (v_a = any (coalesce(v_set.o_carried_visible, '{}'::uuid[])))
     and not (v_a = any (coalesce(v_set.o_granted_visible, '{}'::uuid[]))) then
    v_red := v_red || array['4: the table holding her shared record and her own record is not in her table list'::text];
  end if;

  -- 5. THE RLS MIRROR ADMITS EVERY MEMBER OF A shared_only ORGANIZATION TO EVERY INTERNAL ROW.
  if iam.entity_read_expr('custom', 'record', 'record') not like '%member_lane_open%' then
    v_red := v_red || array['5: the RLS policy text has no idea the organization said shared_only'::text];
  end if;

  if array_length(v_red, 1) is distinct from 5 then
    raise exception 'THE RED TWIN IS NOT RED: only % of 5 blocks failed - %',
      coalesce(array_length(v_red, 1), 0), v_red;
  end if;
  raise notice '5 of 5 blocks are RED - %', array_to_string(v_red, ' | ');
end $t$;
rollback;

-- ── AND NOTHING SURVIVED IT. ────────────────────────────────────────────────────────────
do $t$
declare v_n integer;
begin
  select count(*) into v_n from iam.organizations where id = '50a30000-0000-4a00-8a00-000000000001';
  if v_n <> 0 then raise exception 'ROLLBACK FAILED: the red twin''s organization is still here'; end if;
  if iam.entity_read_expr('custom', 'record', 'record') not like '%member_lane_open%' then
    raise exception 'ROLLBACK FAILED: the RLS mirror is still the inverse''s version';
  end if;
  if to_regprocedure('custom.reaches_directly(uuid, text, uuid, public.permission_level)') is null then
    raise exception 'ROLLBACK FAILED: custom.reaches_directly is still dropped';
  end if;
  if to_regprocedure('custom.shared_only_disagreements(text)') is null then
    raise exception 'ROLLBACK FAILED: the census is still dropped';
  end if;
  raise notice 'ROLLBACK VERIFIED — the five inverse files ran as valid SQL and nothing they did survived.';
end $t$;
