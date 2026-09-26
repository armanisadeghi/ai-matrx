-- Lane STORE-RESTORE-DOORS — the proof for
-- migrations/campaign/storerestoredoors_a_removed_field_rule_link_template_dashboard_or_mandate_comes_back_from_trash.sql
--
-- Use case: the office manager of Harbor Dental Group (admin@admin.com, its owner) keeps a
-- "Sterilizer maintenance log" Table. She removes a column, a cross-column Rule, a link between two
-- log entries, a document template and a dashboard, each on its own, and archives one of her own
-- mandates — then looks for each in Trash and brings it back. Everything runs as the person (role
-- authenticated + her JWT claims) inside ONE transaction that is ROLLED BACK.
--
--   F1  a removed Field is in personal Trash (kind field, token record, "<label> (in <table>)")
--   F2  its values never left the records, and still hold after another column is written
--   F3  test@test.com (a member) does not see it in their personal Trash (access is personal)
--   F4  counts carry the field kind
--   F5  Restore (entity_undelete 'record') brings it back: live, declared by its Table, same values
--   F6  removed again: Organization Trash lists it; org_trash_restore brings it back
--   F7  a column made since under the same key keeps the old one in Trash, with a sentence
--   R1  a removed Rule is in Trash (kind rule) and comes back through custom.rule_restore
--   L1  an unlinked link is in Trash (kind relation, "<record> → <record>") and comes back live
--   T1  a removed document template is in Trash and comes back
--   D1  a removed dashboard is in Trash and comes back; also through Organization Trash
--   M1  an archived mandate is in Trash (kind mandate, label Mandate) and comes back through
--       mandate.definition_restore; test@test.com cannot restore it (42501)
--   G1  a door's refusal in Organization Trash is restored=false with the door's own sentence
--
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storerestoredoors_green.sql (clone or production).
-- RED under the inverse (F1 fails: no field kind), GREEN after the up.

begin;
set local statement_timeout = '120s';

select set_config('srd.uid', (select id::text from auth.users where email = 'admin@admin.com'), true);
select set_config('srd.test', (select id::text from auth.users where email = 'test@test.com'), true);
select set_config('srd.org', (
  select o.id::text from iam.organizations o
    join iam.organization_member a on a.organization_id = o.id and a.role = 'owner'
                                   and a.user_id = current_setting('srd.uid')::uuid
    join iam.organization_member t on t.organization_id = o.id
                                   and t.user_id = current_setting('srd.test')::uuid
   where o.name = 'Harbor Dental Group'
   order by o.created_at limit 1), true);
-- The Table lives in the organization's existing Home (the parent its other Tables name).
select set_config('srd.home', coalesce((
  select t.data ->> 'parent_id' from custom.record t
   where t.organization_id = current_setting('srd.org')::uuid and t.data_class = 'table'
     and t.deleted_at is null and nullif(t.data ->> 'parent_id', '') is not null
   group by 1 order by count(*) desc limit 1), ''), true);
select set_config('srd.mandate', coalesce((
  select d.id::text from mandate.definition d
   where d.created_by = current_setting('srd.uid')::uuid and d.origin = 'user' and d.deleted_at is null
     and d.organization_id is distinct from public.system_org_id('system')
   order by d.created_at desc limit 1), ''), true);

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', current_setting('srd.uid'), 'role', 'authenticated')::text, true);

do $$
declare
  v_uid  uuid := current_setting('srd.uid')::uuid;
  v_test uuid := current_setting('srd.test')::uuid;
  v_org  uuid := current_setting('srd.org')::uuid;
  v_mand uuid := nullif(current_setting('srd.mandate', true), '')::uuid;
  v_home text := nullif(current_setting('srd.home', true), '');
  v_tbl  uuid;
  v_f_unit uuid; v_f_tech uuid; v_f_note uuid; v_f_note2 uuid;
  v_r1 uuid; v_r2 uuid;
  v_rule uuid; v_rel uuid; v_tpl uuid; v_dash uuid;
  v_res jsonb;
  v_title text;
  v_ok boolean;
  v_n int;
  v_fail int := 0;
  v_msg text;
begin
  if v_org is null then raise exception 'SETUP: admin@admin.com owns no "Harbor Dental Group" with test@test.com in it'; end if;
  if v_home is null then raise exception 'SETUP: Harbor Dental Group has no Home its Tables live in'; end if;

  -- The disposable Table, as her page makes it.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Sterilizer maintenance log', 'type', 'entity', 'slug', 'sterilizer_maintenance_log_srd',
    'label_singular', 'Log entry', 'label_plural', 'Log entries', 'title_field', 'unit',
    'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 2555, 'row_order', 'sorted',
    'agent_writable', true, 'parent_id', v_home, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'unit', 'direction', 'asc')),
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'unit', 'type', 'text'),
      jsonb_build_object('name', 'technician', 'type', 'text'),
      jsonb_build_object('name', 'spore_test_note', 'type', 'text'))));
  reset role;
  select (array_agg(f.id) filter (where f.data ->> 'key' = 'unit'))[1],
         (array_agg(f.id) filter (where f.data ->> 'key' = 'technician'))[1],
         (array_agg(f.id) filter (where f.data ->> 'key' = 'spore_test_note'))[1]
    into v_f_unit, v_f_tech, v_f_note
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_tbl::text;
  set local role authenticated;
  if v_f_note is null then raise exception 'SETUP: the spore test note column was not made'; end if;

  v_r1 := custom.record_write(v_org, v_tbl, jsonb_build_object('unit', 'Autoclave 2 (Operatory B)',
            'technician', 'Dana Whitfield', 'spore_test_note', 'Weekly spore test passed, strip lot 44821'));
  v_r2 := custom.record_write(v_org, v_tbl, jsonb_build_object('unit', 'Statim 5000 (Hygiene room)',
            'technician', 'Luis Ortega', 'spore_test_note', 'Door gasket replaced; retest scheduled Monday'));

  -- ── F1 remove the column, from the column panel's door ──────────────────────────────────────
  perform custom.field_retire(v_org, v_f_note);
  select r.title into v_title
    from public.trash_list(array['field'], 50, 0) r where r.id = v_f_note;
  if v_title is distinct from 'spore_test_note (in Sterilizer maintenance log)' and v_title not like '% (in Sterilizer maintenance log)' then
    raise warning 'F1 FAIL: removed column not in personal Trash as "<label> (in <table>)" (got %)', v_title; v_fail := v_fail + 1;
  else raise notice 'F1 ok: %', v_title; end if;

  -- ── F2 the values stayed, and hold after another column is written ─────────────────────────
  perform custom.record_update(v_org, v_r1, jsonb_build_object('technician', 'Dana Whitfield, RDA'));
  reset role;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id in (v_r1, v_r2) and r.data ? 'spore_test_note';
  set local role authenticated;
  if v_n <> 2 then raise warning 'F2 FAIL: the removed column''s values left % record(s)', 2 - v_n; v_fail := v_fail + 1;
  else raise notice 'F2 ok: both records keep the removed column''s value'; end if;

  -- ── F3 access is personal ───────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_test, 'role', 'authenticated')::text, true);
  select exists (select 1 from public.trash_list(array['field'], 200, 0) r where r.id = v_f_note) into v_ok;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  if v_ok then raise warning 'F3 FAIL: test@test.com sees admin''s removed column'; v_fail := v_fail + 1;
  else raise notice 'F3 ok: not in test@test.com''s Trash'; end if;

  -- ── F4 counts ───────────────────────────────────────────────────────────────────────────────
  select coalesce(max(c.n), 0) into v_n from public.trash_counts() c where c.artifact_kind = 'field';
  if v_n < 1 then raise warning 'F4 FAIL: counts carry no field kind'; v_fail := v_fail + 1;
  else raise notice 'F4 ok: field count %', v_n; end if;

  -- ── F5 Restore from personal Trash ──────────────────────────────────────────────────────────
  v_ok := public.entity_undelete('record', v_f_note);
  reset role;
  select (f.deleted_at is null)
     and exists (select 1 from custom.record t, jsonb_array_elements(t.data -> 'fields') x
                  where t.organization_id = v_org and t.id = v_tbl and x ->> 'name' = 'spore_test_note')
     and (select r.data ->> 'spore_test_note' from custom.record r where r.organization_id = v_org and r.id = v_r2)
         = 'Door gasket replaced; retest scheduled Monday'
    into v_ok
    from custom.record f where f.organization_id = v_org and f.id = v_f_note;
  set local role authenticated;
  if not coalesce(v_ok, false) then raise warning 'F5 FAIL: the column did not come back declared with its values'; v_fail := v_fail + 1;
  else raise notice 'F5 ok: column back, declared, values intact'; end if;
  select exists (select 1 from public.trash_list(array['field'], 200, 0) r where r.id = v_f_note) into v_ok;
  if v_ok then raise warning 'F5 FAIL: still listed after restore'; v_fail := v_fail + 1; end if;

  -- ── F6 Organization Trash ───────────────────────────────────────────────────────────────────
  perform custom.field_retire(v_org, v_f_note);
  select exists (select 1 from public.org_trash_list(v_org, array['field'], null, 200, 0) r where r.id = v_f_note) into v_ok;
  if not v_ok then raise warning 'F6 FAIL: not in Organization Trash'; v_fail := v_fail + 1; end if;
  v_res := public.org_trash_restore(v_org, 'record', v_f_note);
  if not coalesce((v_res ->> 'restored')::boolean, false) then
    raise warning 'F6 FAIL: org_trash_restore said %', v_res; v_fail := v_fail + 1;
  else raise notice 'F6 ok: %', v_res ->> 'message'; end if;

  -- ── F7 a column made since under the same key ───────────────────────────────────────────────
  perform custom.field_retire(v_org, v_f_note);
  v_f_note2 := custom.field_declare(v_org, v_tbl, jsonb_build_object('label', 'spore test note', 'key', 'spore_test_note', 'type', 'text'));
  begin
    perform public.entity_undelete('record', v_f_note);
    raise warning 'F7 FAIL: the old column came back beside the new one'; v_fail := v_fail + 1;
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'F7 ok: %', v_msg;
  end;
  -- G1 the same refusal through Organization Trash is a sentence, not an error
  v_res := public.org_trash_restore(v_org, 'record', v_f_note);
  if coalesce((v_res ->> 'restored')::boolean, true) or coalesce(v_res ->> 'message', '') not like '%again%' then
    raise warning 'G1 FAIL: org refusal was %', v_res; v_fail := v_fail + 1;
  else raise notice 'G1 ok: %', v_res ->> 'message'; end if;

  -- ── R1 a cross-column Rule ──────────────────────────────────────────────────────────────────
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name', 'every entry names its unit and technician', 'kind', 'predicate',
    'uses', jsonb_build_array('validate'), 'scope_table_id', v_tbl, 'applies_to_types', '[]'::jsonb,
    'expr', jsonb_build_object('op', 'and', 'args', jsonb_build_array(
      jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_unit))),
      jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_tech))))),
    'description', 'A log entry is only complete when it says which unit and who checked it.'), null);
  perform custom.record_delete(v_org, v_rule);
  select r.label || ': ' || r.title into v_title
    from public.trash_list(array['rule'], 50, 0) r where r.id = v_rule;
  v_ok := v_title is not null and public.entity_undelete('record', v_rule);
  reset role;
  v_ok := v_ok and exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rule and r.deleted_at is null);
  set local role authenticated;
  if not coalesce(v_ok, false) then raise warning 'R1 FAIL: rule listed as % and back=%', v_title, v_ok; v_fail := v_fail + 1;
  else raise notice 'R1 ok: %', v_title; end if;

  -- ── L1 a link between two log entries ───────────────────────────────────────────────────────
  v_rel := custom.relation_carry(v_org, v_r1, v_r2);
  reset role;
  select count(*) into v_n from platform.associations a
   where a.organization_id = v_org and a.deleted_at is null
     and ((a.source_id = v_r1 and a.target_id = v_r2) or (a.source_id = v_r2 and a.target_id = v_r1));
  perform set_config('srd.edges', v_n::text, true);
  set local role authenticated;
  perform custom.relation_uncarry(v_org, v_r1, v_r2);
  select r.title into v_title
    from public.trash_list(array['relation'], 50, 0) r where r.id = v_rel;
  v_ok := v_title like '%→%' and public.entity_undelete('record', v_rel);
  reset role;
  v_ok := v_ok and exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rel and r.deleted_at is null);
  select count(*) into v_n from platform.associations a
   where a.organization_id = v_org and a.deleted_at is null
     and ((a.source_id = v_r1 and a.target_id = v_r2) or (a.source_id = v_r2 and a.target_id = v_r1));
  if v_n <> current_setting('srd.edges')::int then
    raise warning 'L1 FAIL: % live edge(s) after restore, % before the unlink', v_n, current_setting('srd.edges'); v_fail := v_fail + 1;
  end if;
  set local role authenticated;
  if not coalesce(v_ok, false) then raise warning 'L1 FAIL: link listed as % and back=%', v_title, v_ok; v_fail := v_fail + 1;
  else raise notice 'L1 ok: % (live edges before the unlink and after the restore: %)', v_title, current_setting('srd.edges'); end if;

  -- ── T1 a document template ──────────────────────────────────────────────────────────────────
  v_tpl := custom.doc_template_save(v_org, v_tbl, 'Sterilizer service record',
             format('Unit: {{field:%s}}. Checked by {{field:%s}}.', v_f_unit, v_f_tech), null);
  perform custom.doc_template_delete(v_org, v_tpl);
  select r.title into v_title
    from public.trash_list(array['doc_template'], 50, 0) r where r.id = v_tpl;
  v_ok := v_title = 'Sterilizer service record (in Sterilizer maintenance log)' and public.entity_undelete('record', v_tpl);
  reset role;
  v_ok := v_ok and exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_tpl and r.deleted_at is null);
  set local role authenticated;
  if not coalesce(v_ok, false) then raise warning 'T1 FAIL: template listed as % and back=%', v_title, v_ok; v_fail := v_fail + 1;
  else raise notice 'T1 ok: %', v_title; end if;

  -- ── D1 a dashboard, personal then organization ──────────────────────────────────────────────
  v_dash := custom.dashboard_declare(v_org, v_tbl, 'Sterilizer checks this month', '[]'::jsonb, '{}'::jsonb, null);
  perform custom.dashboard_delete(v_org, v_dash);
  select r.title into v_title
    from public.trash_list(array['dashboard'], 50, 0) r where r.id = v_dash;
  v_ok := v_title = 'Sterilizer checks this month (in Sterilizer maintenance log)' and public.entity_undelete('record', v_dash);
  perform custom.dashboard_delete(v_org, v_dash);
  v_res := public.org_trash_restore(v_org, 'record', v_dash);
  v_ok := v_ok and coalesce((v_res ->> 'restored')::boolean, false);
  if not coalesce(v_ok, false) then raise warning 'D1 FAIL: dashboard listed as %, org %', v_title, v_res; v_fail := v_fail + 1;
  else raise notice 'D1 ok: % / %', v_title, v_res ->> 'message'; end if;

  -- ── M1 a mandate she made ───────────────────────────────────────────────────────────────────
  if v_mand is null then
    raise notice 'M1 skipped: admin@admin.com has no live person-made mandate on this database';
  else
    update mandate.definition set deleted_at = now() where id = v_mand and deleted_at is null;
    select r.label || ': ' || r.title into v_title
      from public.trash_list(array['mandate'], 200, 0) r where r.id = v_mand;
    -- test@test.com may not bring it back
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_test, 'role', 'authenticated')::text, true);
    begin
      perform mandate.definition_restore(v_mand);
      raise warning 'M1 FAIL: test@test.com restored admin''s mandate'; v_fail := v_fail + 1;
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_ok := v_title like 'Mandate: %' and public.entity_undelete('mandate', v_mand);
    reset role;
    v_ok := v_ok and exists (select 1 from mandate.definition d where d.id = v_mand and d.deleted_at is null);
    set local role authenticated;
    if not coalesce(v_ok, false) then raise warning 'M1 FAIL: mandate listed as % and back=%', v_title, v_ok; v_fail := v_fail + 1;
    else raise notice 'M1 ok: %', v_title; end if;
  end if;

  if v_fail > 0 then
    raise exception 'STORE-RESTORE-DOORS: % check(s) failed', v_fail;
  end if;
  raise notice 'STORE-RESTORE-DOORS GREEN';
end
$$;

rollback;
