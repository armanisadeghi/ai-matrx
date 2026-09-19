-- LANE TABLE-DELETE — THE RED TWIN. The same defect, asserted EXACTLY AS IT WAS MEASURED on the
-- main database on 2026-09-19, before this lane's files landed:
--
--   RED 1  custom.record_delete marks a Table deleted and LEAVES its Fields, its saved views,
--          its Rules and its records live — the strand lane LATENCY hit and wrote down.
--   RED 2  and those Fields are then undeletable through every door in the store, because
--          custom._field_shape_guard refuses the soft delete with "the field <key> says it
--          belongs to a table this organization does not have". Raw SQL was the only way out.
--   RED 3  custom.migrate_delete of a Table records an inverse that takes nothing with it, so
--          history.migration_undo has nothing to put back but the Table row.
--   RED 4  a Table whose Field a formula in ANOTHER table reads is deleted without a word, and
--          that formula quietly stops being able to find what it multiplies.
--
-- AGAINST THIS DATABASE IT IS RED, and the exception says so. Run each inverse in
-- migrations/inverse/tabledelete_*_down.sql and the blocks come back green one by one, which is
-- the only way to know the green suite is measuring anything.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/tabledelete_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_f1      uuid;
  v_f2      uuid;
  v_rec     uuid;
  v_tblA    uuid;
  v_tblB    uuid;
  v_fA      uuid;
  v_fB      uuid;
  v_res     jsonb;
  v_undo    jsonb;
  v_caught  text;
  -- EVERY block is measured, not only the first: a red twin that stops at its first failure
  -- says nothing about the others. They are collected and raised together at the end.
  v_reds    text[] := '{}';
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'tabledelete_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/tabledelete_red', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'ZZ TABLE-DELETE Red', 'zz-tabledelete-red-' || substr(v_org::text, 1, 8), 'ZTR');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TDR Person','slug','zz_tdr_person','type','entity',
    'label_singular','Person','label_plural','People','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname'),
                                jsonb_build_object('name','note')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','pname','label','Name','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f1;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','note','label','Note','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f2;
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Ana','note','hello'));

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — the Table goes and its Fields and records stay.
  -- Made red by: the Table arm of custom.delete_rule + contents-first in custom.record_delete.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.record_delete(v_org, v_tbl);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id in (v_f1, v_f2, v_rec)
                    and r.deleted_at is null) then
    v_reds := array_append(v_reds, 'RED 1 did not go red: deleting the table took its fields and its records with it');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — and the stranded Field cannot be deleted through the door.
  -- Made red by: a retirement is not a change of shape (custom._field_shape_guard).
  -- ════════════════════════════════════════════════════════════════════════════
  -- The strand is made the way the old door made it — the Table row goes on its own, behind
  -- the rule's back — so this block measures the GUARD and not the cascade RED 1 measures.
  declare
    v_tblS uuid;
    v_fS   uuid;
  begin
    v_tblS := custom.table_declare(v_org, jsonb_build_object(
      'name','ZZ TDR Orphans','slug','zz_tdr_orphans','type','entity',
      'label_singular','Orphan','label_plural','Orphans','title_field','label','display','page',
      'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
      'agent_writable',true,'retention_days',365,'on_delete','cascade',
      'fields', jsonb_build_array(jsonb_build_object('name','label')),
      'parent_id', v_home::text));
    insert into custom.record (organization_id, table_id, data_class, data) values
      (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
        'key','label','label','Label','type','text','sort',10,'required',false,'multi',false,
        'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
        'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
        'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tblS))
      returning id into v_fS;
    update custom.record set deleted_at = now()
     where organization_id = v_org and id = v_tblS;
    v_caught := null;
    begin
      perform custom.record_delete(v_org, v_fS);
    exception when others then
      v_caught := sqlerrm;
    end;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 2 did not go red: the stranded field was deleted through the door, so a retirement is no longer judged as a change of shape');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — the verb's inverse takes nothing with it.
  -- Made red by: the Table arm's cascade_to reaching custom.delete_cascade_closure.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblA := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TDR Invoice','slug','zz_tdr_invoice','type','entity',
    'label_singular','Invoice','label_plural','Invoices','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','title','label','Title','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tblA))
    returning id into v_fA;
  v_res := custom.migrate_delete(v_org, v_tblA, 'red 3');
  if coalesce((v_res ->> 'cascaded')::integer, 0) > 0 then
    v_reds := array_append(v_reds, format('RED 3 did not go red: migrate_delete took %s record(s) with the table, so the inverse names them', v_res ->> 'cascaded'));
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 — a Table whose Field a formula elsewhere reads goes without a word.
  -- Made red by: the Table arm's "This table's fields are used by …" refusal.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblB := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TDR Rates','slug','zz_tdr_rates','type','entity',
    'label_singular','Rate','label_plural','Rates','title_field','base','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','base')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','base','label','Base rate','type','range','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tblB))
    returning id into v_fB;
  declare
    v_tblC uuid;
    v_fC   uuid;
  begin
    v_tblC := custom.table_declare(v_org, jsonb_build_object(
      'name','ZZ TDR Quotes','slug','zz_tdr_quotes','type','entity',
      'label_singular','Quote','label_plural','Quotes','title_field','quoted','display','page',
      'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
      'agent_writable',true,'retention_days',365,'on_delete','cascade',
      'fields', jsonb_build_array(jsonb_build_object('name','quoted')),
      'parent_id', v_home::text));
    insert into custom.record (organization_id, table_id, data_class, data) values
      (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
        'key','quoted','label','Quoted price','type','formula','sort',10,'required',false,
        'multi',false,'dated',false,'source','formula','compute_on','write',
        'config', jsonb_build_object('expr', jsonb_build_object('op','mul',
          'args', jsonb_build_array(jsonb_build_object('field', v_fB::text),
                                    jsonb_build_object('const', 1.5)))),
        'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
        'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
        'entity_definition_id',v_tblC))
      returning id into v_fC;
  end;
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_tblB);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is not null then
    v_reds := array_append(v_reds, format('RED 4 did not go red: the door refused the table and named what reads its field — "%s"', left(v_caught, 120)));
  end if;

  if array_length(v_reds, 1) > 0 then
    raise exception 'tabledelete_red: % of 4 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'tabledelete_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end $t$;

rollback;
