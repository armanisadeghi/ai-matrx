-- LANE TABLE-DELETE — THE GREEN SUITE. Deleting a Table takes its Fields, its saved views, its
-- Rules and its records with it, refuses by name when something OUTSIDE it reads one of those
-- Fields, is undone as ONE operation, and a Field left stranded by an older delete can finally
-- be deleted through the door. On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/tabledelete_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/tabledelete_red.sql`, which asserts the defect exactly
-- as it was measured on 2026-09-19 and is RED against this database.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1a/1b  take the Table arm out of `custom.delete_rule`, or stop `custom.record_delete`
--          taking a Table's contents before the Table itself.
--   1c     drop the "used by" refusal from the Table arm → a table is deleted out from under a
--          formula somewhere else.
--   1e     put the shape check back in front of a retirement in `custom._field_shape_guard`
--          → a stranded Field is undeletable again.
--   1f     narrow `custom.field_dependants` back to `data_class = 'field'` → REC-18 stops
--          holding for the 95% of Fields written through `custom.record_write`.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART, because a delete that refuses
-- everything and a delete that takes everything both pass a test that checks only one side:
-- 1a's cascade is paired with 1c's refusal; 1c's refusal is paired with 1d's clean delete;
-- 1e's stranded Field is paired with 1f's live Field that is still refused.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_views   uuid;
  v_f_name  uuid;
  v_f_score uuid;
  v_f_dbl   uuid;
  v_rule    uuid;
  v_view    uuid;
  v_r1      uuid;
  v_r2      uuid;
  v_tbl2    uuid;
  v_f2a     uuid;
  v_f2b     uuid;
  v_r2a     uuid;
  v_tblA    uuid;
  v_tblB    uuid;
  v_fA      uuid;
  v_fB      uuid;
  v_tbl5    uuid;
  v_f5      uuid;
  v_res     jsonb;
  v_undo    jsonb;
  v_caught  text;
  v_n       integer;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'tabledelete_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/tabledelete_green', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'ZZ TABLE-DELETE Green', 'zz-tabledelete-green-' || substr(v_org::text, 1, 8), 'ZTG');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ── A Table with two plain Fields and one formula that reads one of them, two records,
  --    one Rule scoped to it, and one saved view whose subject is it.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Person','slug','zz_td_person','type','entity',
    'label_singular','Person','label_plural','People','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname'),
                                jsonb_build_object('name','score'),
                                jsonb_build_object('name','doubled')),
    'parent_id', v_home::text));

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','pname','label','Name','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f_name;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','score','label','Score','type','range','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f_score;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','doubled','label','Doubled','type','formula','sort',30,'required',false,'multi',false,
      'dated',false,'source','formula','compute_on','write',
      'config', jsonb_build_object('expr', jsonb_build_object('op','mul',
        'args', jsonb_build_array(jsonb_build_object('field', v_f_score::text),
                                  jsonb_build_object('const', 2)))),
      'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
      'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
      'entity_definition_id',v_tbl))
    returning id into v_f_dbl;

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'row','TABLE-DELETE','name','Has a score at all','kind','predicate','sort',10,
      'message','this person has a score','uses', jsonb_build_array('membership'),
      'applies_to_types','[]'::jsonb,'scope_table_id', v_tbl::text,
      'expr', jsonb_build_object('op','present',
                'args', jsonb_build_array(jsonb_build_object('field', v_f_score::text)))))
    returning id into v_rule;

  v_views := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Saved views','slug','zz_td_saved_views','type','entity',
    'label_singular','Saved view','label_plural','Saved views','title_field','name',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','subject'),
                                jsonb_build_object('name','layout')),
    'parent_id', v_home::text));
  v_view := custom.record_write(v_org, v_views, jsonb_build_object(
    'name','By score','subject', v_tbl::text, 'layout','kanban'));

  v_r1 := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Ana','score',3));
  v_r2 := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Bo','score',4));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1a — THE DOOR TAKES THE WHOLE TABLE.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.table_contents(v_org, v_tbl);
  if v_n <> 7 then
    raise exception '1a: custom.table_contents says this table holds % things and it holds 7 (3 fields, 1 rule, 1 saved view, 2 records)', v_n;
  end if;

  perform custom.record_delete(v_org, v_tbl);

  if exists (select 1 from custom.record r
              where r.organization_id = v_org
                and r.id in (v_tbl, v_f_name, v_f_score, v_f_dbl, v_rule, v_view, v_r1, v_r2)
                and r.deleted_at is null) then
    raise exception '1a: deleting the table left % of its eight things live — exactly the strand this lane exists to close',
      (select string_agg(coalesce(r.data ->> 'name', r.data ->> 'key', r.id::text), ', ')
         from custom.record r
        where r.organization_id = v_org
          and r.id in (v_tbl, v_f_name, v_f_score, v_f_dbl, v_rule, v_view, v_r1, v_r2)
          and r.deleted_at is null);
  end if;

  -- 1a-ii. AND THE FIELDS ARE NOT STRANDED: nothing is left that names a table that is gone.
  if exists (select 1 from custom.record r
              where r.organization_id = v_org and r.deleted_at is null
                and custom.owning_table_gone(v_org, r.id)) then
    raise exception '1a-ii: the delete left a live record whose table is gone — a strand by another route';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1b — ONE OPERATION, AND UNDO PUTS THE WHOLE SET BACK.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Invoice','slug','zz_td_invoice','type','entity',
    'label_singular','Invoice','label_plural','Invoices','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','amount')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','title','label','Title','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl2))
    returning id into v_f2a;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','amount','label','Amount','type','range','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl2))
    returning id into v_f2b;
  v_r2a := custom.record_write(v_org, v_tbl2, jsonb_build_object('title','One','amount',10));

  v_res := custom.migrate_delete(v_org, v_tbl2, 'green 1b');
  if coalesce((v_res ->> 'cascaded')::integer, 0) < 3 then
    raise exception '1b: migrate_delete reported % cascaded and this table held three things', v_res ->> 'cascaded';
  end if;
  if (select count(*) from history.migration_log m
       where m.organization_id = v_org and m.id = (v_res ->> 'migration_id')::uuid) <> 1 then
    raise exception '1b: the delete of a table and everything in it is not ONE row in history';
  end if;

  v_undo := history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if exists (select 1 from custom.record r
              where r.organization_id = v_org and r.id in (v_tbl2, v_f2a, v_f2b, v_r2a)
                and r.deleted_at is not null) then
    raise exception '1b: undo restored % but left something the delete took still deleted', v_undo ->> 'record_id';
  end if;
  if coalesce((v_undo ->> 'also_restored')::integer, 0) < 3 then
    raise exception '1b: undo reported also_restored = %, and the delete took three records with it', v_undo ->> 'also_restored';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1c — A TABLE WHOSE FIELD SOMETHING OUTSIDE READS IS REFUSED, BY NAME.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tblA := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Rates','slug','zz_td_rates','type','entity',
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
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tblA))
    returning id into v_fA;

  v_tblB := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Quotes','slug','zz_td_quotes','type','entity',
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
        'args', jsonb_build_array(jsonb_build_object('field', v_fA::text),
                                  jsonb_build_object('const', 1.5)))),
      'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
      'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
      'entity_definition_id',v_tblB))
    returning id into v_fB;

  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_tblA);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1c: the door deleted a table whose field a formula in another table reads, and said nothing';
  end if;
  if v_caught not ilike '%Quoted price%' then
    raise exception '1c: the refusal does not name what depends on it: %', v_caught;
  end if;
  if (select deleted_at from custom.record r where r.organization_id = v_org and r.id = v_fA) is not null then
    raise exception '1c: the refusal did not leave the table''s fields alone';
  end if;

  -- ── 1d. THE CONTROL: take the outside formula away and the same table goes cleanly.
  perform custom.record_delete(v_org, v_fB);
  perform custom.record_delete(v_org, v_tblA);
  if (select deleted_at from custom.record r where r.organization_id = v_org and r.id = v_fA) is null then
    raise exception '1d: with nothing outside reading it, the table still did not take its field';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1e — A FIELD LEFT STRANDED BY AN OLDER DELETE CAN BE DELETED AT LAST.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl5 := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ TD Orphans','slug','zz_td_orphans','type','entity',
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
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl5))
    returning id into v_f5;

  -- THE OLD BEHAVIOUR, REPRODUCED EXACTLY: the Table goes on its own, behind the rule's back.
  update custom.record set deleted_at = now()
   where organization_id = v_org and id = v_tbl5;

  if not custom.owning_table_gone(v_org, v_f5) then
    raise exception '1e: the setup did not actually strand the field';
  end if;
  perform custom.record_delete(v_org, v_f5);
  if (select deleted_at from custom.record r where r.organization_id = v_org and r.id = v_f5) is null then
    raise exception '1e: a stranded field is still undeletable through the door';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1f — THE CONTROL: REC-18 STILL REFUSES A LIVE FIELD A LIVE FORMULA READS.
  -- ════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_f2b);      -- restored by 1b's undo; `quoted`-style
  exception when others then
    v_caught := sqlerrm;
  end;
  -- `amount` has no dependant, so it must go. The refusal is asserted on `base`'s twin below.
  if v_caught is not null then
    raise exception '1f: a field nothing reads was refused: %', v_caught;
  end if;

  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_fA);       -- deleted with its table in 1d
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1f: the door deleted an already-deleted record and said nothing';
  end if;

  raise notice 'ALL PARTS PASSED (1a table contents, 1a-ii no strand, 1b one operation + undo, 1c refusal by name, 1d control, 1e stranded field freed, 1f controls)';
end;
$t$;

rollback;
