-- LANE DOOR-FIX — THE RED TWIN. The same four defects, asserted EXACTLY AS THEY WERE MEASURED
-- on the main database on 2026-09-19, before this lane's files landed:
--
--   RED 1 (T7)  custom.record_delete soft-deletes the record a person named and LEAVES the
--               records it contained live and orphaned.
--   RED 2 (T5)  custom.migrate_merge drops the loser's other value: the winner's document is
--               unchanged and carries no alternate, while values_taken still counts it.
--   RED 3 (T5)  after history.migration_undo the loser's id STILL resolves to the winner.
--   RED 4 (T12) changing a Field's behaviour leaves the values alone, and the next write to a
--               record holding one is refused naming a field it never touched.
--   RED 5 (B1)  custom.promote_field refuses for an organization whose store is ON, because it
--               reads custom/field_index_guard, which has no override anywhere.
--
-- AGAINST THIS DATABASE IT IS RED, and each block says which fix made it red. Run it, see it
-- fail on RED 1, and you have the proof that the door delete now consults the rule; run each
-- inverse in migrations/inverse/doorfix_*_down.sql and the blocks come back green one by one,
-- which is the only way to know a green suite is measuring anything.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/doorfix_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_inv     uuid;
  v_f_name  uuid;
  v_f_phone uuid;
  v_f_amt   uuid;
  v_f_tax   uuid;
  v_f_code  uuid;
  v_parent  uuid;
  v_child   uuid;
  v_grand   uuid;
  v_a       uuid;
  v_b       uuid;
  v_ann     uuid;
  v_res     jsonb;
  v_undo    jsonb;
  v_doc     jsonb;
  v_msg     text;
  v_caught  text;
  v_n       integer;
  v_home2   uuid;
  v_tbl2    uuid;
  -- EVERY block is measured, not only the first: a red twin that stops at its first failure
  -- says nothing about the other four. They are collected and raised together at the end.
  v_reds    text[] := '{}';
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'doorfix_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- platform._gc_entity_associations. This suite is a named system, and says so.
  perform set_config('app.actor_system', 'campaign-test/doorfix_red', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'ZZ DOOR-FIX Red', 'zz-doorfix-red-' || substr(v_org::text, 1, 8), 'ZDR');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ Person', 'slug', 'zz_doorfix_person', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People', 'title_field', 'pname',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'pname'),
                                jsonb_build_object('name', 'phone')),
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
      'key','phone','label','Phone','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f_phone;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 (T7) — the door orphans what the record contained.
  -- Made red by: custom.record_delete asking custom.delete_rule and cascading through itself.
  -- ════════════════════════════════════════════════════════════════════════════
  v_parent := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Parent'));
  v_child  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Child','parent_id',v_parent::text));
  perform custom.record_delete(v_org, v_parent);
  if (select deleted_at from custom.record r where r.organization_id=v_org and r.id=v_child) is not null then
    v_reds := array_append(v_reds, 'RED 1 did not go red: the door took the contained record with it, so the delete rule is being consulted');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 (T5) — the losing value disappears with no alternate.
  -- Made red by: the merge BUILDING the envelope instead of jsonb_set-ing into a path that
  -- may not exist, and reading the document back afterwards.
  -- ════════════════════════════════════════════════════════════════════════════
  v_a := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','111'));
  v_b := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','222'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'red 2');
  select r.data into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_values' -> 'phone' -> 'alternates','[]'::jsonb)) x
              where x -> 'value' = '"222"'::jsonb) then
    v_reds := array_append(v_reds, 'RED 2 did not go red: the winner carries the losing phone number as an alternate');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 (T5) — undo restores the record and leaves the id pointing at the survivor.
  -- Made red by: history.migration_undo honouring the inverse's `unalias`, and
  -- custom.resolve_id skipping a revoked alias.
  -- ════════════════════════════════════════════════════════════════════════════
  v_undo := history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if custom.resolve_id(v_org, v_b) = v_b then
    v_reds := array_append(v_reds, 'RED 3 did not go red: after the undo the restored record''s own id resolves to itself');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 (T12) — the field changes behaviour and the record is bricked.
  -- Made red by: the trigger custom_record_field_type_converts_values.
  -- ════════════════════════════════════════════════════════════════════════════
  v_ann := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Ann','phone','abc'));
  perform custom.record_update(v_org, v_f_phone,
    jsonb_build_object('type','range','config', jsonb_build_object('kind','number')));
  v_caught := null;
  begin
    perform custom.record_update(v_org, v_ann, jsonb_build_object('pname','Ann Lee'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 4 did not go red: the record is still writable after the field changed what it holds, so the values were converted or retired');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 5 (B1) — promotion refuses although the organization's store is ON.
  -- Made red by: promote_field reading custom/system_enabled through custom.store_is_open.
  -- ════════════════════════════════════════════════════════════════════════════
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'doorfix_red');
  perform custom.record_update(v_org, v_f_name, jsonb_build_object('promoted', true, 'unique', false));
  v_caught := null;
  begin
    perform custom.promote_field(v_org, v_tbl, v_f_name);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 5 did not go red: a field was promoted for an organization whose store is on, so promotion follows the system switch');
  end if;

  if array_length(v_reds, 1) > 0 then
    raise exception 'doorfix_red: % of 5 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'doorfix_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end $t$;

rollback;
