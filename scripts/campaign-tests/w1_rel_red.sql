-- LANE W1-REL — THE RED TWIN of `scripts/campaign-tests/w1_rel_c12.sql`.
--
-- C-12 is sixteen PASSes and six refusals. A suite made of refusals proves nothing until you
-- can show the refusals disappearing when the thing that makes them is removed. This file
-- removes the contract trigger and the version triggers FOR REAL, re-runs the same clauses over
-- the same fixture, and asserts that each one now lets the wrong thing through.
--
--   RED 1  drop `trg_associations_zzz_relation_contract`
--          -> a relation lands on a Table its field never named (REL-8 gone)
--          -> a `one` relation takes a second target (REL-7 gone)
--          -> a relation points back at itself through the same role (REL-5 gone)
--   RED 2  drop `trg_associations_zzz_touch_row` and `trg_associations_zzz_version_capture`
--          -> the edge's version never moves and its history stays empty (REL-16 / REL-13 gone)
--
-- ONE transaction, ROLLBACK at the end: the dropped triggers, the flipped knob and the whole
-- fixture go with it. Nothing here survives the session.
--
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rel_red.sql

\set ON_ERROR_STOP on
\timing off
\pset pager off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w1_rel_red.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w1_rel.red', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key = 'associations_guard';

do $red$
declare
  v_org      uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_note_t   uuid;
  v_proj_t   uuid;
  v_tag_t    uuid;
  v_pers_t   uuid;
  v_note     uuid;
  v_a        uuid;
  v_tag      uuid;
  v_b        uuid;
  v_d        uuid;
  v_edge     uuid;
  v_ver      integer;
  v_n        integer;
begin
  -- ------------------------------------------------------------------ the same fixture, briefly
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Red Note','slug','zz_red_note','type','entity','display','list',
    'label_singular','ZZ Red Note','label_plural','ZZ Red Notes','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', custom.table_kernel_id(),'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));

  -- The Table declares its fields and custom.field defines them (FLD-8). `custom.table_declare`
  -- normalises the list it is given at declare time, so the relation field is appended to the
  -- Table record afterwards - the same order a real caller uses, and the same order C-12 uses.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name','about')))
   where organization_id = v_org and id = v_note_t;
  v_proj_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Red Project','slug','zz_red_project','type','entity','display','list',
    'label_singular','ZZ Red Project','label_plural','ZZ Red Projects','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', custom.table_kernel_id(),'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  v_pers_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Red Person','slug','zz_red_person','type','entity','display','list',
    'label_singular','ZZ Red Person','label_plural','ZZ Red Persons','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', custom.table_kernel_id(),'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  v_tag_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Red Tag','slug','zz_red_tag','type','entity','display','list',
    'label_singular','ZZ Red Tag','label_plural','ZZ Red Tags','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', custom.table_kernel_id(),'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));

  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_org, v_note_t, 'about', 'About', 'About', 'relation', v_proj_t, 50, 'set_null',
          jsonb_build_object('target_mode','one','loops',false),
          'manual','{}'::jsonb,'internal','include',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,true,false,false,10);

  -- REL-5's clause needs a field that points a Table at ITSELF, declared on the project Table,
  -- because `platform.relation_set` resolves the field off the SOURCE record's Table before the
  -- contract trigger ever runs — a fact this twin measured the hard way.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name','about')))
   where organization_id = v_org and id = v_proj_t;
  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_org, v_proj_t, 'about', 'About', 'About', 'relation', v_proj_t, 50, 'set_null',
          jsonb_build_object('target_mode','one','loops',false),
          'manual','{}'::jsonb,'internal','include',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,true,false,false,10);

  v_note := custom.record_write(v_org, v_note_t, '{"title":"Red note"}'::jsonb);
  v_a    := custom.record_write(v_org, v_proj_t, '{"title":"Red project A"}'::jsonb);
  v_b    := custom.record_write(v_org, v_proj_t, '{"title":"Red project B"}'::jsonb);
  v_tag  := custom.record_write(v_org, v_tag_t,  '{"title":"Red tag"}'::jsonb);

  -- ==================================================================== RED 1: the contract goes
  drop trigger trg_associations_zzz_relation_contract on platform.associations;

  -- (a) a Table the field never named
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_tag));
  select count(*) into v_n from platform.associations
   where source_id = v_note and target_id = v_tag and deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 1a IS NOT RED: a relation onto a Table the field never named was still refused, so the contract trigger was not what was refusing it';
  end if;

  -- (b) `one` takes a second target
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_a));
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_b));
  select count(*) into v_n from platform.associations
   where source_id = v_note and role = 'about' and deleted_at is null;
  if v_n < 3 then
    raise exception 'RED 1b IS NOT RED: a one-target relation still holds only % edges', v_n;
  end if;

  -- (c) it points back at itself
  perform platform.relation_set(v_org, v_a, 'about', jsonb_build_array(v_a));
  select count(*) into v_n from platform.associations
   where source_id = v_a and target_id = v_a and deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 1c IS NOT RED: a self-relation was still refused';
  end if;

  raise notice 'RED 1 — contract trigger dropped: a relation lands on a Table its field never named, a "one" relation holds % targets, and a record points at itself. REL-8, REL-7 and REL-5 were that one trigger.', v_n + 2;

  -- ===================================================================== RED 2: the versions go
  select a.id into v_edge from platform.associations a
   where a.source_id = v_note and a.role = 'about' and a.target_id = v_a limit 1;
  select a.version into v_ver from platform.associations a where a.id = v_edge;

  drop trigger trg_associations_zzz_touch_row on platform.associations;
  drop trigger trg_associations_zzz_version_capture on platform.associations;

  update platform.associations set label = 'red_moved_it' where id = v_edge;

  if (select version from platform.associations where id = v_edge) <> v_ver then
    raise exception 'RED 2a IS NOT RED: the version moved with both version triggers dropped, so something else is writing it';
  end if;
  select count(*) into v_n from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_n <> 0 then
    raise exception 'RED 2b IS NOT RED: % history row(s) were still filed for an edge nobody is capturing', v_n;
  end if;
  raise notice 'RED 2 — both version triggers dropped: the edge was edited, its version stayed at % and its history recorded nothing. REL-16 and REL-13 were those two triggers.', v_ver;
end $red$;

rollback;
