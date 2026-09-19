-- FIELD-GUARDS — A REFUSAL IS A WHOLE SENTENCE, AND A RETIREMENT IS NOT A SHAPE.
--
-- Run it:  psql "$MAIN_DSN" -f migrations/tests/fieldguards_refusals_are_complete_tests.sql
--
-- Every clause runs as admin@admin.com, through the store's own doors, in a THROWAWAY
-- organization created inside the transaction and rolled back at the end — so the
-- organization's census is zero before the suite and zero after it, and the switch
-- (custom/system_enabled) is left exactly as it was found.
--
-- RED then GREEN, measured on the main database on 2026-09-19:
--
--   before migrations/campaign/fieldguards_a_refusal_is_a_whole_sentence.sql — all five fail
--     [FAIL] clause 1 — the refusal stops mid-air: "a field needs a key made of lower-case
--            letters, digits and underscores, and this one says "
--     [FAIL] clause 2 — the refusal stops mid-air: "the field Probe says its behavior is ,
--            and a field behaves as a list, a range, text, a relation or a formula"
--     [FAIL] clause 3 — the field Lead name reads through a relation called crew_lead, and
--            this table has no field called crew_lead
--     [FAIL] clause 4 — Another field on this table works out its answer from "Crew lead",
--            so removing it would break that one.
--     [FAIL] clause 5 — custom.guard_refusals_are_complete() does not exist (24 sites)
--
--   after it — all five pass, and the census returns 24 → 0.
--
-- To see it red again: apply migrations/inverse/fieldguards_a_refusal_is_a_whole_sentence_down.sql
-- and run this file.
\set ON_ERROR_STOP on
\timing off
\set ORG '9f9f0001-0000-4000-8000-f1e1d90a2d01'
\set ADMIN '87a6e699-3622-4869-8843-d0867456c0dd'

begin;
set local lock_timeout = '10s';
insert into iam.organizations (id, name, slug, abbreviation, description, is_personal, created_by)
values (:'ORG'::uuid, 'ZZZ Field Guards Throwaway', 'zzz-field-guards-throwaway', 'ZFG',
        'thrown away at rollback', false, :'ADMIN'::uuid);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:'ORG'::uuid, 'organization', :'ORG'::uuid, :'ADMIN'::uuid, 'owner', 'active');
update platform.feature_knob set value='true' where feature='custom' and key='system_enabled';
select 'census at the start' as clause, count(*) as records
  from custom.record where organization_id = :'ORG'::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","email":"admin@admin.com"}', true);

select custom.record_write(:'ORG'::uuid, custom.person_kernel_id(), '{"name":"ZZZ Field Guards Home"}'::jsonb) as home \gset
select custom.table_declare(:'ORG'::uuid, jsonb_build_object(
  'name','ZZZ Field Guards','slug','zzz_field_guards','type','entity',
  'label_singular','Job','label_plural','Jobs','display','list','weight','light',
  'ordered',false,'row_order','manual','title_field','title','retention_days',365,
  'agent_writable',true,'default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
  'fields',jsonb_build_array(jsonb_build_object('name','title')),'parent_id',:'home')) as tbl \gset
select custom.record_write(:'ORG'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'key','title','label','Title','type','text','multi',false,'dated',false,'required',false,'sort',10,
  'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
  'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
  'depends_on','[]'::jsonb,'entity_definition_id',:'tbl'));
select custom.field_declare(:'ORG'::uuid, :'tbl', '{"label":"Crew lead","parity_type":"member"}'::jsonb) as f_rel \gset
select custom.field_declare(:'ORG'::uuid, :'tbl', '{"label":"Lead name","parity_type":"lookup","via":"crew_lead","pick":"name"}'::jsonb) as f_look \gset
select set_config('fg.tbl', :'tbl', true), set_config('fg.rel', :'f_rel', true), set_config('fg.look', :'f_look', true);

-- Clauses 1 and 2 go through the client write door, as the signed-in admin.
do $c$
declare
  v_org uuid := '9f9f0001-0000-4000-8000-f1e1d90a2d01';
  v_base jsonb;
  v_msg text;
begin
  v_base := jsonb_build_object(
    'label','Probe','type','text','multi',false,'dated',false,
    'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual',
    'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
    'depends_on','[]'::jsonb,'entity_definition_id', current_setting('fg.tbl')::uuid);

  begin
    perform custom.record_write(v_org, custom.field_kernel_id(), v_base || jsonb_build_object('key',''));
    raise notice '[FAIL] clause 1 — a field with no key at all was accepted';
  exception when others then
    v_msg := sqlerrm;
    if v_msg ~ 'this one says nothing' then
      raise notice '[ OK ] clause 1 — %', v_msg;
    else
      raise notice '[FAIL] clause 1 — the refusal stops mid-air: "%"', v_msg;
    end if;
  end;

  begin
    perform custom.record_write(v_org, custom.field_kernel_id(),
      v_base || jsonb_build_object('key','blank_behaviour','type',''));
    raise notice '[FAIL] clause 2 — a field with no behaviour at all was accepted';
  exception when others then
    v_msg := sqlerrm;
    if v_msg ~ 'behaviou?r is nothing' then
      raise notice '[ OK ] clause 2 — %', v_msg;
    else
      raise notice '[FAIL] clause 2 — the refusal stops mid-air: "%"', v_msg;
    end if;
  end;
end
$c$;

-- Clause 3 is the sweep's write: nobody reaches custom.record directly through a client,
-- so this one is the table owner, exactly as a cascade or a sweep arrives.
reset role;
do $c$
declare v_org uuid := '9f9f0001-0000-4000-8000-f1e1d90a2d01';
begin
  begin
    update custom.record set deleted_at = now()
     where organization_id = v_org
       and id in (current_setting('fg.rel')::uuid, current_setting('fg.look')::uuid);
    raise notice '[ OK ] clause 3 — the relation and the lookup that reads through it retired in one statement';
  exception when others then
    raise notice '[FAIL] clause 3 — %', sqlerrm;
  end;
end
$c$;
rollback;

-- CLAUSE 4 — the door takes the dependent field with the relation, in ONE operation.
begin;
set local lock_timeout = '10s';
insert into iam.organizations (id, name, slug, abbreviation, description, is_personal, created_by)
values (:'ORG'::uuid, 'ZZZ Field Guards Throwaway', 'zzz-field-guards-throwaway', 'ZFG',
        'thrown away at rollback', false, :'ADMIN'::uuid);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:'ORG'::uuid, 'organization', :'ORG'::uuid, :'ADMIN'::uuid, 'owner', 'active');
update platform.feature_knob set value='true' where feature='custom' and key='system_enabled';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","email":"admin@admin.com"}', true);
select custom.record_write(:'ORG'::uuid, custom.person_kernel_id(), '{"name":"ZZZ Field Guards Home"}'::jsonb) as home2 \gset
select custom.table_declare(:'ORG'::uuid, jsonb_build_object(
  'name','ZZZ Field Guards','slug','zzz_field_guards','type','entity',
  'label_singular','Job','label_plural','Jobs','display','list','weight','light',
  'ordered',false,'row_order','manual','title_field','title','retention_days',365,
  'agent_writable',true,'default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
  'fields',jsonb_build_array(jsonb_build_object('name','title')),'parent_id',:'home2')) as tbl2 \gset
select custom.record_write(:'ORG'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'key','title','label','Title','type','text','multi',false,'dated',false,'required',false,'sort',10,
  'rules','[]'::jsonb,'config','{}'::jsonb,'source','manual','source_config','{}'::jsonb,
  'sensitivity','internal','context_policy','include','applies_to_types','[]'::jsonb,
  'depends_on','[]'::jsonb,'entity_definition_id',:'tbl2'));
select custom.field_declare(:'ORG'::uuid, :'tbl2', '{"label":"Crew lead","parity_type":"member"}'::jsonb) as g_rel \gset
select custom.field_declare(:'ORG'::uuid, :'tbl2', '{"label":"Lead name","parity_type":"lookup","via":"crew_lead","pick":"name"}'::jsonb) as g_look \gset
select set_config('fg.tbl', :'tbl2', true), set_config('fg.rel', :'g_rel', true), set_config('fg.look', :'g_look', true);
do $c$
declare v_org uuid := '9f9f0001-0000-4000-8000-f1e1d90a2d01';
begin
  begin
    perform custom.field_retire(v_org, current_setting('fg.rel')::uuid);
    perform set_config('fg.retired', 'yes', true);
  exception when others then
    perform set_config('fg.retired', sqlerrm, true);
  end;
end
$c$;
reset role;
do $c$
declare v_org uuid := '9f9f0001-0000-4000-8000-f1e1d90a2d01'; v_fields text; v_gone boolean;
begin
  if current_setting('fg.retired') <> 'yes' then
    raise notice '[FAIL] clause 4 — %', current_setting('fg.retired');
    return;
  end if;
  select string_agg(f ->> 'name', ', ') into v_fields
    from custom.record t, jsonb_array_elements(coalesce(t.data->'fields','[]'::jsonb)) f
   where t.organization_id=v_org and t.id=current_setting('fg.tbl')::uuid;
  select (deleted_at is not null) into v_gone from custom.record
   where organization_id=v_org and id=current_setting('fg.look')::uuid;
  if v_gone then
    raise notice '[ OK ] clause 4 — the door took the lookup with the relation; the table now declares: %', v_fields;
  else
    raise notice '[FAIL] clause 4 — the relation went and the lookup that fed off it is still there (table declares: %)', v_fields;
  end if;
end
$c$;
rollback;

\echo ''
\echo '=== CLAUSE 5 — no guard in the store refuses with a sentence that can stop mid-air'
\set ON_ERROR_STOP off
select count(*) as guards_that_can_stop_mid_air from custom.guard_refusals_are_complete();
select guard, said from custom.guard_refusals_are_complete();
\set ON_ERROR_STOP on

\echo ''
\echo '=== CENSUS — the throwaway organization left nothing behind'
select (select count(*) from custom.record where organization_id = :'ORG'::uuid) as records,
       (select count(*) from iam.organizations where id = :'ORG'::uuid) as organizations,
       (select value from platform.feature_knob where feature='custom' and key='system_enabled') as knob;
