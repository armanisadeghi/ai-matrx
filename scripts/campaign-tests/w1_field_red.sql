-- W1-FIELD — THE RED TWIN of `w1_field_t4_t8.sql` (rules 2 and 3).
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file turns each of
-- W1-FIELD's four guards off INSIDE ONE TRANSACTION, performs the write the green suite
-- proves is refused, and asserts it LANDS — then rolls the whole thing back, guards
-- included, because `ALTER TABLE … DISABLE TRIGGER` is itself transactional.
--
-- IT IS NOT A MIGRATION, it lives outside `migrations/`, it runs on the REHEARSAL BRANCH
-- only, and it never runs against production: the first statement refuses on any server
-- whose control-file identifier is not the branch's.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching refusal was passing for some other reason — a typo in the
-- write, a constraint somewhere else, an exception handler catching the wrong thing. The
-- four guards, and what each one alone is load-bearing for:
--   custom_record_field_shape_guard        FLD-1, FLD-3, FLD-7, FLD-9, FLD-12, FLD-N-1, FLD-8
--   custom_record_field_validation         REC-51 on the store: type, required, options, relations
--   custom_record_merge_field_shape_guard  DYN-2's three axes
--   custom_fields_validation (crm.party)   REC-51's second half — proven through its KNOB, since
--                                          the trigger is already OFF by knob, not by absence

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_src_tbl constant uuid := '11111111-0001-4000-8000-000000000001';
  v_kitchen uuid;
  v_landed  uuid;
  v_n       integer;
  v_j       jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_field_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- ── RED 1: THE DEFINITION GUARD ──────────────────────────────────────────
  -- With custom._field_shape_guard off, a field definition with TWO behaviours, an invented
  -- source, a constraint smuggled into config and no compute_on on a formula all land in one
  -- row. Every one of section F's refusals in the green suite is this guard and nothing else.
  alter table custom.record disable trigger custom_record_field_shape_guard;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field',
          '{"key":"zz_red","label":"ZZ Red","type":["text","list"],"source":"typed_by_a_person",
            "config":{"min":0,"max":100},"presentation":{"unit":"mm"},"multi":"maybe"}'::jsonb)
    returning id into v_landed;
  if v_landed is null then raise exception 'RED 1: the write did not land with custom_record_field_shape_guard disabled'; end if;
  select data into v_j from custom.record where organization_id = v_org and id = v_landed;
  if jsonb_typeof(v_j -> 'type') <> 'array' then
    raise exception 'RED 1: the two-behaviour definition did not survive - type is %', jsonb_typeof(v_j -> 'type');
  end if;
  if (v_j -> 'config') is null or not (v_j -> 'config' ? 'min') then
    raise exception 'RED 1: the constraint smuggled into config did not survive';
  end if;
  if (v_j ->> 'source') <> 'typed_by_a_person' then
    raise exception 'RED 1: the invented source did not survive - it reads %', v_j ->> 'source';
  end if;
  -- And it is visible through the projection, which is how a broken definition would reach a
  -- consumer: the view does not re-check anything, and it was never supposed to.
  select count(*) into v_n from custom.field where id = v_landed;
  if v_n <> 1 then raise exception 'RED 1: the broken definition is not visible on custom.field'; end if;
  alter table custom.record enable trigger custom_record_field_shape_guard;
  raise notice 'RED 1 - with custom_record_field_shape_guard disabled, a definition with two behaviours, a constraint in config, an invented source and a non-boolean modifier LANDS and reads back through custom.field';

  -- ── RED 2: THE VALIDATION TRIGGER (REC-51) ───────────────────────────────
  -- A table with a required list field. With the validator off, a record with the field
  -- MISSING, a record whose value is the wrong TYPE, and a record whose value is not one of
  -- the options all land. Those are three of section E's four refusals.
  v_kitchen := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Red Table','slug','zz_red_table','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','pick')),
    'title_field','name','parent_id', v_mf_kern::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_kitchen::text,'key','pick','label','Pick','type','list',
    'multi',false,'dated',false,'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_src_tbl::text),
    'required', true,'sort',10,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include',
    'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));

  alter table custom.record disable trigger custom_record_field_validation;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_kitchen, '{"name":"missing"}') returning id into v_landed;
  if v_landed is null then raise exception 'RED 2 required: the write did not land'; end if;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_kitchen, '{"name":"wrong type","pick":7}') returning id into v_landed;
  if v_landed is null then raise exception 'RED 2 type: the write did not land'; end if;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_kitchen, '{"name":"not an option","pick":"not-an-option"}') returning id into v_landed;
  if v_landed is null then raise exception 'RED 2 options: the write did not land'; end if;
  select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_kitchen;
  if v_n <> 3 then raise exception 'RED 2: % of the three invalid records landed', v_n; end if;
  alter table custom.record enable trigger custom_record_field_validation;
  raise notice 'RED 2 - with custom_record_field_validation disabled, a record MISSING its required field, one whose value is a number where words were declared, and one whose value is not one of its choices ALL land: 3 of 3';

  -- ── RED 3: THE MERGE-FIELD GUARD (DYN-2) ─────────────────────────────────
  alter table custom.record disable trigger custom_record_merge_field_shape_guard;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_mf_kern,
          '{"key":"zz_red_mf","type":"overrideable_state_person_reference_variable",
            "source":["record","tool"],"semantic_type":"everything","modifiers":["urgent"],
            "override_policy":"whenever"}'::jsonb)
    returning id into v_landed;
  select data into v_j from custom.record where organization_id = v_org and id = v_landed;
  if not (v_j ? 'type') then raise exception 'RED 3: the fused type did not survive'; end if;
  if jsonb_typeof(v_j -> 'source') <> 'array' then raise exception 'RED 3: the two sources did not survive'; end if;
  if (v_j ->> 'semantic_type') <> 'everything' then raise exception 'RED 3: the invented semantic type did not survive'; end if;
  select count(*) into v_n from custom.merge_field where id = v_landed;
  if v_n <> 1 then raise exception 'RED 3: the broken merge field is not visible on custom.merge_field'; end if;
  alter table custom.record enable trigger custom_record_merge_field_shape_guard;
  raise notice 'RED 3 - with custom_record_merge_field_shape_guard disabled, a merge field that fuses all three axes into one type, names two sources, invents a semantic type and invents a modifier LANDS and reads back through custom.merge_field';

  -- ── RED 4: REC-51's SECOND HALF, PROVEN THROUGH ITS KNOB ─────────────────
  -- This one is inverted, and deliberately: `custom_fields_validation` on crm.party is
  -- ALREADY off, held by `custom/entity_custom_fields_guard`. So the RED here is not
  -- disabling the trigger — it is turning the KNOB ON and showing the same write is then
  -- refused, which proves the knob is the switch and the OFF half of the green suite is a
  -- real withholding rather than an absent mechanism.
  perform set_config('app.actor_system', 'W1-FIELD red twin', true);
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'table_token','party','key','zz_red_tier','label','ZZ Red tier','type','list',
    'multi',false,'dated',false,'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_src_tbl::text),
    'required', false,'sort',10,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include',
    'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));

  -- OFF: it lands, which is the green suite's H section.
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person','ZZ Red party', v_org, '{"zz_red_tier":"not-an-option"}'::jsonb)
    returning id into v_landed;
  if v_landed is null then raise exception 'RED 4: the OFF write did not land'; end if;

  -- ON: the SAME write is refused, by the field's own name.
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'entity_custom_fields_guard';
  begin
    insert into crm.party (party_kind, display_name, organization_id, custom_fields)
    values ('person','ZZ Red party two', v_org, '{"zz_red_tier":"not-an-option"}'::jsonb);
    raise exception 'RED 4: the write landed with custom/entity_custom_fields_guard ON - the knob is not the switch';
  exception when check_violation then
    null;
  end;
  -- And the POSITIVE control with the knob still ON: a valid option lands.
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person','ZZ Red party three', v_org,
          jsonb_build_object('zz_red_tier','11111111-0002-4000-8000-000000000002'))
    returning id into v_landed;
  if v_landed is null then raise exception 'RED 4: a VALID option was refused with the knob ON'; end if;
  raise notice 'RED 4 - with custom/entity_custom_fields_guard OFF the invalid custom_fields payload lands; with the SAME knob ON the SAME payload is refused and a valid option still lands. The knob is the switch, and what it withholds is real';

  raise notice 'W1-FIELD RED TWIN COMPLETE - all four guards demonstrated doing NOTHING when removed, and the whole transaction now rolls back';
end;
$r$;

rollback;
