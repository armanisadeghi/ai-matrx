-- W3-MIG — THE RED TWIN of `scripts/campaign-tests/w3_mig_c18.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each thing C-18 relies on DISAPPEARS — and, where the failure is silent rather
-- than loud, that the WRONG THING IS ACTUALLY WRITTEN.
--
--   RED 1 — REC-18, and it is the verifier's own case. `custom.field_dependants` loses its
--           by-id arm, and `amount_usd` DELETES CLEANLY although `amount_with_tax` reads it.
--           This is not a hypothetical: it is the exact measurement that made this lane's
--           exit clause "unbuilt rather than unproven", reproduced on demand.
--   RED 2 — REC-18's second arm. The by-key arm goes, and a formula reading it through
--           `depends_on` no longer protects it either.
--   RED 3 — REC-13. `custom.migrate_delete` stops asking about Homes, and Project Y is
--           deleted out from under the table that lives there.
--   RED 4 — REC-12. The containment cascade goes, and deleting Widget leaves its serial
--           numbers alive with a parent that is gone — the silent half, counted.
--   RED 5 — REC-21. `custom.resolve_id` stops following the alias, and a merged-away id
--           resolves to itself: a dead id, answering confidently.
--   RED 6 — REC-23. `custom.migrate_purge` ignores retention, and a record deleted moments
--           ago is destroyed while it was still meant to be reversible.
--   RED 7 — HIS-8 / REC-20. A verb writes before it logs: `custom.migrate_rename` renames
--           first and records nothing, and the old name is gone with no inverse to restore.
--
-- It refuses to run anywhere but the rehearsal branch, by system identifier, and it is not a
-- migration: nothing in `migrations/` and no sweep can see it.
--
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_mig_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org    constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_home   constant uuid := '11111111-0000-4000-8000-000000000001';
  v_inv    uuid;
  v_widget uuid;
  v_f_amt  uuid;
  v_f_tax  uuid;
  v_f_key  uuid;
  v_homerec uuid;
  v_tbl_at_home uuid;
  v_w1     uuid;
  v_s1     uuid;
  v_a      uuid;
  v_b      uuid;
  v_rec    uuid;
  v_res    jsonb;
  v_txt    text;
  v_n      integer;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_mig_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Invoice', 'slug', 'w3_mig_red_invoice', 'type', 'entity',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax'),
                                jsonb_build_object('name','amount_rounded')),
    'parent_id', v_home));

  v_widget := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Widget', 'slug', 'w3_mig_red_widget', 'type', 'entity',
    'label_singular', 'Widget', 'label_plural', 'Widgets', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_inv));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_widget));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount_usd','label','Amount USD','type','range','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_inv))
  returning id into v_f_amt;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount_with_tax','label','Amount with tax','type','formula','sort',30,'required',false,
    'multi',false,'dated',false,'source','formula','compute_on','write',
    'config', jsonb_build_object('expr', jsonb_build_object('op','mul',
                'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text),
                                          jsonb_build_object('const', 1.2)))),
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_inv))
  returning id into v_f_tax;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount_rounded','label','Amount rounded','type','formula','sort',40,'required',false,
    'multi',false,'dated',false,'source','formula','compute_on','write',
    'config', '{"expression":"round(amount_usd)"}'::jsonb,
    'rules','[]'::jsonb,'depends_on', jsonb_build_array('amount_usd'),
    'sensitivity','internal','source_config','{}'::jsonb,'context_policy','include',
    'applies_to_types','[]'::jsonb,'entity_definition_id',v_inv))
  returning id into v_f_key;

  -- GREEN FIRST, so a red that was already red cannot be mistaken for a guard working.
  select count(*) into v_n from custom.field_dependants(v_org, v_f_amt);
  if v_n < 2 then
    raise exception 'RED 1/2 precondition: field_dependants found % dependants before anything was weakened', v_n;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 and RED 2 — REC-18. The two arms, taken away one at a time.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
  returns table(kind text, dependant_id uuid, label text, how text)
  language plpgsql stable set search_path to 'pg_catalog' as $red$
  declare v_key text; v_table uuid;
  begin
    select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id','')::uuid
      into v_key, v_table from custom.record f
     where f.organization_id = p_organization_id and f.id = p_field_id and f.data_class = 'field';
    if v_key is null then return; end if;
    -- THE WEAKENING: only the by-key arm survives.
    return query
    select 'field', r.id,
           coalesce(nullif(r.data ->> 'label',''), r.data ->> 'key', r.id::text),
           'reads it by name in depends_on'
      from custom.record r
     where r.organization_id = p_organization_id and r.deleted_at is null
       and r.data_class = 'field' and r.id <> p_field_id
       and nullif(r.data ->> 'entity_definition_id','')::uuid is not distinct from v_table
       and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on','[]'::jsonb)) d
                    where d = v_key);
  end;
  $red$;

  select string_agg(d.label, ', ') into v_txt from custom.field_dependants(v_org, v_f_amt) d;
  if v_txt ~ 'Amount with tax' then
    raise exception 'RED 1 did not go red: the by-id dependant is still found';
  end if;
  raise notice 'RED 1 — field_dependants loses its by-id arm: amount_usd now reads as used only by "%". "Amount with tax", which reads it BY ID in config.expr, has vanished — the verifier''s exact measurement, on demand.', v_txt;

  create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
  returns table(kind text, dependant_id uuid, label text, how text)
  language plpgsql stable set search_path to 'pg_catalog' as $red$
  begin
    return;            -- THE WEAKENING: nothing depends on anything.
  end;
  $red$;

  -- And now the delete LANDS, which is the whole point.
  v_res := custom.migrate_delete(v_org, v_f_amt);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_f_amt and r.deleted_at is not null) then
    raise exception 'RED 2 did not go red: amount_usd was still refused';
  end if;
  raise notice 'RED 2 — both arms gone: amount_usd DELETED CLEANLY on migration %, although two formulas read it. T7''s refusal, and this lane''s required exit input, disappear together.',
               v_res ->> 'migration_id';
  perform custom.record_restore(v_org, v_f_amt);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — REC-13. The Home stops being asked.
  -- ══════════════════════════════════════════════════════════════════════════
  v_homerec := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Project Y'));
  v_tbl_at_home := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Incident', 'slug', 'w3_mig_red_incident', 'type', 'entity',
    'label_singular', 'Incident', 'label_plural', 'Incidents', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home));
  perform custom.home_add(v_org, v_tbl_at_home, v_homerec);

  -- The refusal lives in custom.migrate_delete's Home block, which asks
  -- custom.tables_at_home. Making that reader answer "nothing lives here" is the weakening.
  create or replace function custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
  returns table(table_id uuid, home_record_id uuid, kind text)
  language sql stable set search_path to 'pg_catalog' as $red$
    select null::uuid, null::uuid, null::text where false;
  $red$;
  v_res := custom.migrate_delete(v_org, v_homerec);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_homerec and r.deleted_at is not null) then
    raise exception 'RED 3 did not go red: Project Y was still refused';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id = v_tbl_at_home and r.deleted_at is null;
  raise notice 'RED 3 — the Home link gone: Project Y deleted with % table(s) still declaring it home. REC-13''s default refusal, with the table named, disappears.', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — REC-12. The containment cascade, and the orphans it leaves.
  -- ══════════════════════════════════════════════════════════════════════════
  v_w1 := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Widget'));
  v_s1 := custom.record_write(v_org, v_widget,
            jsonb_build_object('client_name', 'SN-0001', 'parent_id', v_w1::text));

  create or replace function custom.containment_edges(p_organization_id uuid)
  returns table(parent_id uuid, child_id uuid, via text)
  language sql stable set search_path to 'pg_catalog' as $red$
    select null::uuid, null::uuid, null::text where false;   -- THE WEAKENING: nothing contains anything
  $red$;

  v_res := custom.migrate_delete(v_org, v_w1);
  if coalesce((v_res ->> 'cascaded')::integer, 0) <> 0 then
    raise exception 'RED 4 did not go red: % records still cascaded', v_res ->> 'cascaded';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id = v_s1 and r.deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 4 did not go red: the serial number went anyway';
  end if;
  raise notice 'RED 4 — the containment cascade gone: Widget was deleted and its serial number is STILL LIVE with a parent that no longer exists. Nothing raised; T7''s 500 contained records would simply be left behind.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 5 — REC-21. A dead id, answering confidently.
  -- ══════════════════════════════════════════════════════════════════════════
  v_a := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Winner'));
  v_b := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Loser'));
  perform custom.migrate_merge(v_org, v_a, v_b);
  if custom.resolve_id(v_org, v_b) <> v_a then
    raise exception 'RED 5 precondition: the alias did not resolve before it was weakened';
  end if;

  create or replace function custom.resolve_id(p_organization_id uuid, p_id uuid)
  returns uuid language sql stable set search_path to 'pg_catalog' as $red$
    select p_id;          -- THE WEAKENING: every id resolves to itself
  $red$;

  if custom.resolve_id(v_org, v_b) <> v_b then
    raise exception 'RED 5 did not go red';
  end if;
  raise notice 'RED 5 — resolve_id stops following the alias: the merged-away id % resolves to ITSELF, a soft-deleted record. REC-21''s "forever" becomes a confident answer to a dead link.', v_b;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 6 — REC-23. Retention ignored, and a reversible delete is not one.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Purge me'));
  perform custom.migrate_delete(v_org, v_rec);

  create or replace function custom.migrate_purge(p_organization_id uuid, p_table_id uuid default null,
                                                  p_dry_run boolean default true)
  returns jsonb language plpgsql volatile set search_path to 'pg_catalog' as $red$
  declare v_count bigint := 0;
  begin
    perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');
    -- THE WEAKENING: no cutoff, and no alias check either.
    with gone as (
      delete from custom.record c
       where not p_dry_run and c.organization_id = p_organization_id
         and c.deleted_at is not null
         and (p_table_id is null or c.table_id = p_table_id)
      returning 1)
    select count(*) from gone into v_count;
    return jsonb_build_object('function','custom.migrate_purge','rows_purged',v_count);
  end;
  $red$;

  v_res := custom.migrate_purge(v_org, v_widget, false);
  if exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rec) then
    raise exception 'RED 6 did not go red: the record deleted moments ago survived';
  end if;
  if exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_b) then
    raise exception 'RED 6 partial: the merge loser survived a purge with no alias check';
  end if;
  raise notice 'RED 6 — purge ignores retention and the alias check: % row(s) destroyed, including a record deleted seconds ago and the merge loser whose id is supposed to resolve forever. REC-23''s reversibility window and REC-21''s "forever" go in one statement.',
               v_res ->> 'rows_purged';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 7 — HIS-8 / REC-20. A verb that writes before it logs.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function custom.migrate_rename(p_organization_id uuid, p_id uuid, p_to text,
                                                   p_note text default null)
  returns jsonb language plpgsql volatile set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_store_door(p_organization_id, 'custom.migrate_rename');
    -- THE WEAKENING: the write happens and nothing is recorded. The old name is gone and
    -- there is no inverse anywhere to put it back with.
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('client_name', p_to));
    return jsonb_build_object('verb','rename','record_id',p_id,'now',p_to);
  end;
  $red$;

  select count(*) into v_n from history.migration_log m
   where m.organization_id = v_org and m.verb = 'rename';
  v_res := custom.migrate_rename(v_org, v_a, 'Renamed with no way back');
  select count(*) - v_n into v_n from history.migration_log m
   where m.organization_id = v_org and m.verb = 'rename';
  if v_n <> 0 then
    raise exception 'RED 7 did not go red: % rename(s) were still logged', v_n;
  end if;
  select r.data ->> 'client_name' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_a;
  raise notice 'RED 7 — a verb writes before it logs: the record now reads "%" and the Migration log gained NOTHING. REC-20''s "logged and reversible" is gone and the only sign is a log that does not mention it.', v_txt;

  raise notice '════ W3-MIG RED — seven arms, seven things C-18 relies on gone. Rolling back; nothing here survives this transaction. ════';
end;
$r$;

rollback;
