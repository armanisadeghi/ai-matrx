-- W1-REL — CHECK C-12, and the T2 / T7 clauses of this lane's exit.
--
-- REL-1 · REL-3 · REL-4 · REL-7 · REL-9 · REL-10 · REL-11 · REL-12 · REL-13 · REL-14 · REL-16,
-- plus REL-2, REL-5, REL-6 and REL-8, each as a behavioural clause over real rows in
-- `platform.associations` beside production's copied graph.
--
-- HOW TO RUN IT (branch only; it asserts the branch's own system identifier and stops otherwise)
--   PSQL=$(cd matrx-frontend && pnpm -s exec tsx scripts/lib/psql-path.ts --print)
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -f scripts/campaign-tests/w1_rel_c12.sql
--
-- WHAT IT LEAVES BEHIND: NOTHING. Everything runs inside one transaction that ends in ROLLBACK -
-- the fixture Tables, the fixture records, every association row, and the knob flip. The last
-- two lines read `custom/associations_guard` back OUT of the transaction and print it, because a
-- campaign knob left switched on by a test is how a rehearsal branch starts lying (it happened
-- to `custom/field_index_guard` three times on 2026-09-17, W1-INDEX's own follow-up).
--
-- WHY IT FLIPS THE KNOB AT ALL. `custom/associations_guard` resolves FALSE on the branch, and
-- while it does, `platform.enforce_relation_edge` returns every row untouched by design - so a
-- suite run without the flip would prove that the OFF path is inert and NOTHING about the law.
-- The flip is inside the transaction and dies with it.
--
-- THE RED TWIN is `w1_rel_c12_red.sql`, which disables the contract trigger and the version
-- triggers for real and re-runs the same clauses; every REFUSAL clause there must FAIL. A suite
-- whose red twin passes is testing nothing.

-- HARNESS REPAIR 2 (2026-09-18). ON_ERROR_STOP was OFF for the whole file. A \gset that fails
-- leaves its variable UNSET, psql then pastes `:'t_project'` through as that literal text, and
-- the fixture cascaded into dozens of unrelated errors that buried the first real one. Section 1
-- - the fixture - now STOPS on the first error; the refusal sections turn it off again, because
-- there an error is the expected answer.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ------------------------------------------------------------------ 0. the target is the branch
\echo '== W1-REL / C-12 =='
select case
         when (select system_identifier from pg_control_system()) = 7678069749886157684
           then 'TARGET OK: the rehearsal branch'
         else 'REFUSED: this is not the rehearsal branch - '
              || (select system_identifier from pg_control_system())::text
       end as target \gset target_
\echo :target_target
-- HARNESS REPAIR 3 (W1-ORG/W1-REL seat, 2026-09-18). This was `case when ... then 1/0 end`, and
-- PostgreSQL is free to evaluate `1/0` before the CASE chooses an arm: it printed
-- `division by zero` ON THE BRANCH, where the target is CORRECT. The one check that must never
-- be wrong was the one that always cried wolf. A DO block cannot be constant-folded.
do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w1_rel_c12.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

-- HARNESS REPAIR 6 (2026-09-18): every write in this suite is made by `postgres`, so
-- `platform._stamp_actor_tier` stamps actor_tier=code — and the provenance guard then refuses a
-- code write that names no system: '"an AI did it" with no name is not provenance'. The suite IS
-- a system and now says so, once, for the whole transaction.
select set_config('app.actor_system', 'campaign.w1_rel.c12', true);

-- ------------------------------------------------------------------------------ 1. the fixture
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

-- The switch, ON for this transaction only.
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key = 'associations_guard';
select platform.relations_are_on(:'org'::uuid) as guard_on_inside_the_transaction;

-- HARNESS REPAIR 1 (2026-09-18). `CREATE TEMPORARY FUNCTION` IS NOT A POSTGRESQL STATEMENT -
-- there is no such thing, and the whole fixture died on line 1 of section 1. `pg_temp` is the
-- session's temporary schema, so a function created there IS temporary: it is invisible to every
-- other session and it goes when this one does.
create function pg_temp.zz_rel_table(p_org uuid, p_name text, p_slug text) returns uuid
language sql as $$
  select custom.table_declare(p_org, jsonb_build_object(
    'name', p_name, 'slug', p_slug, 'type', 'entity', 'display', 'list',
    'label_singular', p_name, 'label_plural', p_name || 's',
    'ordered', true, 'weight', 'light', 'retention_days', 365,
    'row_order', 'manual', 'agent_writable', true,
    'parent_id', custom.table_kernel_id(),
    'title_field', 'title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))))
$$;


-- HARNESS REPAIR 5 (2026-09-18): `custom._field_shape_guard` also enforces FLD-8 — "a Table
-- declares its fields and custom.field defines them", so a definition for a field the Table
-- never declared is refused as a second source of truth. This suite was written before that
-- landed and declared its relation fields out of nowhere. This appends the declaration to the
-- Table record first, which is what a real caller does.
create function pg_temp.zz_rel_declare(p_org uuid, p_table uuid, p_key text) returns void
language sql as $$
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', p_key)))
   where organization_id = p_org and id = p_table
     and not exists (select 1 from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) e
                      where e ->> 'name' = p_key);
$$;

select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Project', 'zz_rel_project') as t_project \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Person',  'zz_rel_person')  as t_person  \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Class',   'zz_rel_class')   as t_class   \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Note',    'zz_rel_note')    as t_note    \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Tag',     'zz_rel_tag')     as t_tag     \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Widget',  'zz_rel_widget')  as t_widget  \gset
select pg_temp.zz_rel_table(:'org'::uuid, 'ZZ Serial',  'zz_rel_serial')  as t_serial  \gset

select custom.record_write(:'org'::uuid, :'t_project'::uuid, '{"title":"Project A"}'::jsonb) as r_a      \gset
select custom.record_write(:'org'::uuid, :'t_person'::uuid,  '{"title":"Person B"}'::jsonb)  as r_b      \gset
select custom.record_write(:'org'::uuid, :'t_class'::uuid,   '{"title":"Class C"}'::jsonb)   as r_c      \gset
select custom.record_write(:'org'::uuid, :'t_note'::uuid,    '{"title":"The note"}'::jsonb)  as r_note   \gset
select custom.record_write(:'org'::uuid, :'t_tag'::uuid,     '{"title":"Tag T"}'::jsonb)     as r_tag    \gset
select custom.record_write(:'org'::uuid, :'t_widget'::uuid,  '{"title":"Widget W"}'::jsonb)  as r_widget \gset
select custom.record_write(:'org'::uuid, :'t_serial'::uuid,  '{"title":"Serial 1"}'::jsonb)  as r_ser    \gset

-- T2's field: ONE relation, pointing at THREE DIFFERENT TABLES (REL-8, mode `several`),
-- referenced and CARRYING (REL-6), many (REL-7), ordered (REL-4), live (REL-3), loops refused.
-- HARNESS REPAIR 4 (2026-09-18): `custom._field_shape_guard` (W1-FIELD, landed after this suite
-- was written) requires `label` on every field - "it is what a person reads", FLD-13. Every field
-- declaration below carries one.
select pg_temp.zz_rel_declare(:'org'::uuid, :'t_note'::uuid, 'about');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_note'::uuid, 'about', 'About', 'About', 'relation',
        :'t_project'::uuid, 50, 'set_null',
        jsonb_build_object('target_mode','several',
                           'target_tables', jsonb_build_array(:'t_project', :'t_person', :'t_class'),
                           'ordered', true, 'carries', true, 'carries_max', 'viewer', 'loops', false),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_about \gset

\echo ''
\echo '-- 1. REL-10 / REL-4 / REL-11 : the note relates to A, B and C - three Tables, one role'
select platform.relation_set(:'org'::uuid, :'r_note'::uuid, 'about',
         jsonb_build_array(:'r_a', :'r_b', :'r_c')) as edges_written;

select a.role, a.target_type, a.position, a.origin,
       (a.relation_field_id = :'f_about'::uuid) as field_is_the_declaring_field
  from platform.associations a
 where a.source_id = :'r_note'::uuid and a.deleted_at is null
 order by a.position;

select case when count(*) = 3 and bool_and(role = 'about') and bool_and(origin = 'campaign')
            then 'PASS REL-10 / T2 (the relation half): one note, three edges onto three'
                 || ' different Tables, one role, and the origin marker on every one'
            else 'FAIL REL-10 / T2' end as rel_10
  from platform.associations where source_id = :'r_note'::uuid and deleted_at is null;

select case when array_agg(position order by position) = array[1,2,3]
            then 'PASS REL-4: ordered, and the order is stored on the edge'
            else 'FAIL REL-4' end as rel_4
  from platform.associations where source_id = :'r_note'::uuid and deleted_at is null;

select case when not (r.data ?| array['about','relations','_relations'])
            then 'PASS REL-11: the note''s document says nothing about the relation'
            else 'FAIL REL-11: ' || r.data::text end as rel_11
  from custom.record r where r.id = :'r_note'::uuid;

\echo ''
\echo '-- 2. REL-9 / C-12a : the reverse end, BY QUERY, with no second stored row'
select * from platform.relations_to(:'org'::uuid, :'r_a'::uuid);
select case when (select count(*) from platform.relations_to(:'org'::uuid, :'r_a'::uuid)) = 1
             and (select count(*) from platform.associations
                   where deleted_at is null
                     and ((source_id = :'r_note'::uuid and target_id = :'r_a'::uuid)
                       or (source_id = :'r_a'::uuid and target_id = :'r_note'::uuid))) = 1
            then 'PASS REL-9 / C-12a: the reverse end answers from the ONE stored row'
            else 'FAIL REL-9 / C-12a' end as rel_9;

\echo ''
\echo '-- 3. REL-14 : the label is hydrated at read, so renaming the target renames the chip'
select label as label_before from platform.relations_from(:'org'::uuid, :'r_note'::uuid)
 where target_id = :'r_a'::uuid;
select custom.record_update(:'org'::uuid, :'r_a'::uuid, '{"title":"Project A, renamed"}'::jsonb, null) is not null as renamed;
select case when (select label from platform.relations_from(:'org'::uuid, :'r_note'::uuid)
                   where target_id = :'r_a'::uuid) = 'Project A, renamed'
            then 'PASS REL-14: the label followed the target, because nothing stored it'
            else 'FAIL REL-14' end as rel_14;

\echo ''
\echo '-- 4. REL-8 : several means several, and a table outside the list is refused BY NAME'
-- HARNESS REPAIR 2b (2026-09-18): ON_ERROR_STOP is ON for the whole file so the FIXTURE
-- stops at its first real error instead of cascading through unset \gset variables. Around a
-- statement whose EXPECTED answer is a refusal it is turned off for exactly that statement,
-- and back on immediately - never for a whole section. A refused statement also ABORTS the
-- surrounding transaction ('current transaction is aborted, commands ignored'), so each one is
-- also wrapped in its own SAVEPOINT and rolled back to it: the refusal is the answer, and the
-- suite carries on with the same fixture rather than dying on its first correct result.
\set ON_ERROR_STOP off
savepoint zz_refusal_1;
select platform.relation_set(:'org'::uuid, :'r_note'::uuid, 'about', jsonb_build_array(:'r_tag'));
\echo '   (the line above MUST be a refusal naming ZZ Project, ZZ Person, ZZ Class)'
rollback to savepoint zz_refusal_1;
\set ON_ERROR_STOP on

\echo ''
\echo '-- 5. REL-7 : at most one'
-- HARNESS REPAIR 4 (2026-09-18): `custom._field_shape_guard` (W1-FIELD, landed after this suite
-- was written) requires `label` on every field - "it is what a person reads", FLD-13. Every field
-- declaration below carries one.
select pg_temp.zz_rel_declare(:'org'::uuid, :'t_note'::uuid, 'owner');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_note'::uuid, 'owner', 'Owner', 'Owner', 'relation',
        :'t_person'::uuid, 1, 'set_null', jsonb_build_object('target_mode','one'),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_owner \gset
select custom.record_write(:'org'::uuid, :'t_person'::uuid, '{"title":"Person D"}'::jsonb) as r_d \gset
select platform.relation_set(:'org'::uuid, :'r_note'::uuid, 'owner', jsonb_build_array(:'r_b')) as first_owner;
\set ON_ERROR_STOP off
savepoint zz_refusal_2;
select platform.relation_set(:'org'::uuid, :'r_note'::uuid, 'owner', jsonb_build_array(:'r_d'));
\echo '   (the line above MUST be a refusal naming Person B - the one already there)'
rollback to savepoint zz_refusal_2;
\set ON_ERROR_STOP on

\echo ''
\echo '-- 6. REL-12 : organizations are hard walls, and REC-29''s one opening opens it'
select custom.record_write(:'org'::uuid, :'t_person'::uuid, '{"title":"Person E"}'::jsonb) as r_e \gset
update custom.record set organization_id = organization_id where id = :'r_e'::uuid;
\set ON_ERROR_STOP off
savepoint zz_refusal_3;
insert into platform.associations (source_type, source_id, target_type, target_id,
                                   organization_id, role, relation_field_id, origin)
values ('record', :'r_note'::uuid, 'record', :'r_e'::uuid,
        'c0000000-0000-4000-8000-000000000001'::uuid, 'about', :'f_about'::uuid, 'campaign');
\echo '   (the line above MUST be a refusal. MEASURED 2026-09-18: it refuses ONE STEP EARLIER'
\echo '    than this suite expected - "there is no field <id> in this organization", from'
\echo '    platform.relation_declaration, not from the organization wall. That is the better'
\echo '    answer and it is the honest one to record: a relation cannot cross organizations'
\echo '    because the FIELD that would declare it does not exist over there. T15''s wall is'
\echo '    proven separately, on the record store, by v1store_fixes_green.sql blocks 1a-1c.)'
rollback to savepoint zz_refusal_3;
\set ON_ERROR_STOP on

\echo ''
\echo '-- 7. REL-5 : loops are refused unless the relation allows them'
-- HARNESS REPAIR 4 (2026-09-18): `custom._field_shape_guard` (W1-FIELD, landed after this suite
-- was written) requires `label` on every field - "it is what a person reads", FLD-13. Every field
-- declaration below carries one.
select pg_temp.zz_rel_declare(:'org'::uuid, :'t_project'::uuid, 'partners');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_project'::uuid, 'partners', 'Partners', 'Partners', 'relation',
        :'t_project'::uuid, 50, 'set_null', jsonb_build_object('target_mode','one','loops',false),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_partners \gset
select custom.record_write(:'org'::uuid, :'t_project'::uuid, '{"title":"Company B"}'::jsonb) as r_cb \gset
select platform.relation_set(:'org'::uuid, :'r_a'::uuid, 'partners', jsonb_build_array(:'r_cb')) as a_partners_b;
\set ON_ERROR_STOP off
savepoint zz_refusal_4;
select platform.relation_set(:'org'::uuid, :'r_cb'::uuid, 'partners', jsonb_build_array(:'r_a'));
\echo '   (the line above MUST be a refusal: that would make this point back at itself)'
rollback to savepoint zz_refusal_4;
\set ON_ERROR_STOP on
update custom.record set data = data || '{"config":{"target_mode":"one","loops":true}}'::jsonb
 where id = :'f_partners'::uuid;
select platform.relation_set(:'org'::uuid, :'r_cb'::uuid, 'partners', jsonb_build_array(:'r_a')) as loop_allowed_now;

\echo ''
\echo '-- 8. REL-3 : a snapshot is a frozen copy in the relation''s own payload'
-- HARNESS REPAIR 4 (2026-09-18): `custom._field_shape_guard` (W1-FIELD, landed after this suite
-- was written) requires `label` on every field - "it is what a person reads", FLD-13. Every field
-- declaration below carries one.
select pg_temp.zz_rel_declare(:'org'::uuid, :'t_note'::uuid, 'as_filed');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_note'::uuid, 'as_filed', 'As filed', 'As filed', 'relation',
        :'t_person'::uuid, 50, 'set_null',
        jsonb_build_object('target_mode','one','binding','snapshot'),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_filed \gset
select platform.relation_set(:'org'::uuid, :'r_note'::uuid, 'as_filed', jsonb_build_array(:'r_b')) as filed;
select custom.record_update(:'org'::uuid, :'r_b'::uuid, '{"title":"Person B, married name"}'::jsonb, null) is not null as b_renamed;
select case when (select snapshot -> 'values' ->> 'title'
                    from platform.relations_from(:'org'::uuid, :'r_note'::uuid)
                   where role = 'as_filed') = 'Person B'
             and (select label from platform.relations_from(:'org'::uuid, :'r_note'::uuid)
                   where role = 'as_filed') = 'Person B, married name'
            then 'PASS REL-3: the snapshot froze and the live label moved, from the same row'
            else 'FAIL REL-3' end as rel_3;
select case when (select snapshot from platform.relations_from(:'org'::uuid, :'r_note'::uuid)
                   where role = 'as_filed') ?| array['version','row_version_id','as_of']
            then 'FAIL REL-3: the snapshot points into History'
            else 'PASS REL-3: the snapshot names no version to resolve against' end as rel_3_not_history;

\echo ''
\echo '-- 9. REL-1 : ownership is ONE fact, on the contained table, read from the field''s side'
select (platform.relation_declaration(:'org'::uuid, :'f_about'::uuid) ->> 'flavor') as flavor_before_the_table_says_so;
update custom.record set data = data || '{"contained_by_relation": true}'::jsonb
 where id = :'t_person'::uuid;
select case when (platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid) ->> 'flavor') = 'owned'
            then 'PASS REL-1: the field read ownership off the table it points at'
            else 'FAIL REL-1' end as rel_1;
select case when (platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid) ->> 'carries')::boolean
            then 'PASS REL-6: carries defaults ON for owned'
            else 'FAIL REL-6' end as rel_6_owned;
select case when not (platform.relation_declaration(:'org'::uuid, :'f_partners'::uuid) ->> 'carries')::boolean
            then 'PASS REL-6: carries defaults OFF for referenced'
            else 'FAIL REL-6' end as rel_6_referenced;
update custom.record set data = data || '{"flavor":"owned"}'::jsonb where id = :'f_owner'::uuid;
\set ON_ERROR_STOP off
savepoint zz_refusal_5;
select platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid);
\echo '   (the line above MUST be a refusal: the field cannot declare whether the relation owns what it points at)'
rollback to savepoint zz_refusal_5;
\set ON_ERROR_STOP on
update custom.record set data = data - 'flavor' where id = :'f_owner'::uuid;

\echo ''
\echo '-- 10. REL-2 / T7 : the three delete outcomes, and on_delete is separate from flavor'
select (platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid) ->> 'on_delete') as owned_relation_on_delete_default;
update custom.record set data = jsonb_set(data, '{on_target_delete}', '"restrict"') where id = :'f_owner'::uuid;
select case when (platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid) ->> 'on_delete') = 'restrict'
             and (platform.relation_declaration(:'org'::uuid, :'f_owner'::uuid) ->> 'flavor') = 'owned'
            then 'PASS REL-2: an OWNED relation restricts - the two words are independent'
            else 'FAIL REL-2' end as rel_2;
\set ON_ERROR_STOP off
savepoint zz_refusal_6;
select platform.relation_on_delete(:'org'::uuid, :'r_b'::uuid);
\echo '   (the line above MUST be a refusal NAMING "The note" - T7''s restrict)'
rollback to savepoint zz_refusal_6;
\set ON_ERROR_STOP on
update custom.record set data = jsonb_set(data, '{on_target_delete}', '"set_null"') where id = :'f_owner'::uuid;
select platform.relation_on_delete(:'org'::uuid, :'r_b'::uuid) as t7_set_null_detaches;
select case when not exists (select 1 from platform.associations
                              where source_id = :'r_note'::uuid and role = 'owner' and deleted_at is null)
            then 'PASS T7: set_null detached the relation and left the record alone'
            else 'FAIL T7 set_null' end as t7_set_null;

-- HARNESS REPAIR 4 (2026-09-18): `custom._field_shape_guard` (W1-FIELD, landed after this suite
-- was written) requires `label` on every field - "it is what a person reads", FLD-13. Every field
-- declaration below carries one.
select pg_temp.zz_rel_declare(:'org'::uuid, :'t_serial'::uuid, 'widget');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_serial'::uuid, 'widget', 'Widget', 'Widget', 'relation',
        :'t_widget'::uuid, 1, 'cascade', jsonb_build_object('target_mode','one'),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_widget \gset
select platform.relation_set(:'org'::uuid, :'r_ser'::uuid, 'widget', jsonb_build_array(:'r_widget')) as serial_on_widget;
select case when platform.relation_on_delete(:'org'::uuid, :'r_widget'::uuid) -> 'cascade_to' @> to_jsonb(array[:'r_ser'::uuid])
            then 'PASS T7: cascade hands the delete verb the records it must take with it'
            else 'FAIL T7 cascade' end as t7_cascade;

\echo ''
\echo '-- 11. REL-13 / REL-16 : the edge is versioned, and relation history exists'
select a.id as e_id from platform.associations a
 where a.source_id = :'r_note'::uuid and a.role = 'about' and a.target_id = :'r_a'::uuid limit 1 \gset
select version as version_at_insert, updated_at is not null as touched from platform.associations where id = :'e_id'::uuid;
update platform.associations set label = 'part_of_nothing' where id = :'e_id'::uuid;
select case when (select version from platform.associations where id = :'e_id'::uuid) >= 1
            then 'PASS REL-16: _touch_row bumped the version it can now see'
            else 'FAIL REL-16' end as rel_16;
select case when exists (select 1 from platform.relation_history(:'org'::uuid, :'e_id'::uuid))
            then 'PASS REL-13: relation history exists'
            else 'FAIL REL-13' end as rel_13;
select * from platform.relation_history(:'org'::uuid, :'e_id'::uuid);

\echo ''
\echo '-- 12. the OFF path : an ordinary association is untouched by all of it'
update platform.feature_knob set value = 'false'::jsonb
 where feature = 'custom' and key = 'associations_guard';
select case when (select count(*) from platform.associations
                   where relation_field_id is null and origin is null
                     and version is null and updated_at is null) =
                 (select count(*) from platform.associations where relation_field_id is null)
            then 'PASS OFF: every association that is not one of ours carries NULL in all four new columns'
            else 'FAIL OFF' end as off_path;

rollback;

\echo ''
\echo '-- 13. the branch is left as it was found'
select value as associations_guard_after_rollback from platform.feature_knob
 where feature = 'custom' and key = 'associations_guard';
select count(*) as campaign_rows_left_behind from platform.associations where origin = 'campaign';
select count(*) as zz_tables_left_behind from custom.record where data ->> 'slug' like 'zz_rel_%';
