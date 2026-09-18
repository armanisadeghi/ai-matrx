-- W3-MIG — CHECK C-18, plus T5, T7, T9 and T12.
-- REC-12 · REC-13 · REC-18 · REC-20 · REC-21 · REC-22 · REC-23 · REC-24 · REC-N-18 · FLD-4.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_mig_c18.sql
--
-- IT IS NOT A MIGRATION: outside `migrations/`, no sweep can see it, and it ROLLS BACK. It
-- refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_mig_red.sql`.
--
-- 🚨 THE REQUIRED INPUT OF THIS LANE'S EXIT IS PART 2 (a). A verifier measured, on this
-- branch, that deleting `amount_usd` SUCCEEDED although `amount_with_tax`'s `config.expr`
-- read it by id — so T7's "deleting a Field a Formula depends on is refused, naming the
-- Formula" was UNBUILT rather than unproven. PART 2 (a) builds a Field read BY ID by a
-- formula and BY NAME in another formula's `depends_on`, deletes it, and requires the refusal
-- to name BOTH. (b) is its control: a Field nothing reads deletes cleanly.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   · drop the by-id arm of `custom.field_dependants`   → PART 2 (a), the verifier's case
--   · drop the by-key arm                               → PART 2 (a)'s second dependant
--   · take the Home check out of `custom.migrate_delete` → PART 3
--   · stop passing the containment children to the one delete verb → PART 4
--   · have `custom.migrate_merge` write the alias AFTER the delete → PART 5 (c)'s instant
--   · have `custom.migrate_split` create two new ids    → PART 6
--   · have `custom.migrate_retype` write a new row      → PART 7's "kept the id"
--   · let `custom.migrate_purge` ignore retention        → PART 9
--   · let any verb write before `history.migration_record` → every undo in PARTS 5-8
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: every refusal below is paired with the same
-- act succeeding (a Field nothing reads; a Home whose Table cascades; a purge past retention
-- beside one inside it), and every undo is EXECUTED and the restored rows READ BACK.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_home    constant uuid := '11111111-0000-4000-8000-000000000001';
  v_inv     uuid;
  v_person  uuid;
  v_widget  uuid;
  v_f_amt   uuid;
  v_f_tax   uuid;
  v_f_key   uuid;
  v_f_lonely uuid;
  v_f_pname uuid;
  v_f_phone uuid;
  v_f_role  uuid;
  v_rule    uuid;
  v_homerec uuid;
  v_tbl_at_home uuid;
  v_w1      uuid;
  v_serial  uuid;
  v_serial2 uuid;
  v_chen1   uuid;
  v_chen2   uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_rec     uuid;
  v_new     uuid;
  v_res     jsonb;
  v_log     uuid;
  v_msg     text;
  v_txt     text;
  v_n       integer;
  v_tid     uuid;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_mig_c18.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 1 — ALL TEN VERBS EXIST, by name. A census, not a promise.
  -- ══════════════════════════════════════════════════════════════════════════
  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname like 'migrate\_%';
  if v_txt is distinct from 'migrate_delete,migrate_demote,migrate_extract_parent,migrate_merge,migrate_promote,migrate_purge,migrate_rename,migrate_reparent,migrate_retype,migrate_split' then
    raise exception 'C-18 (1): the Migration verbs on this database are "%", and there are ten', coalesce(v_txt, 'none');
  end if;
  raise notice 'PART 1 — REC-20: ten verbs, by name: %', v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE
  -- ══════════════════════════════════════════════════════════════════════════
  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Invoice', 'slug', 'w3_mig_invoice', 'type', 'entity',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax'),
                                jsonb_build_object('name','amount_rounded'),
                                jsonb_build_object('name','memo')),
    'parent_id', v_home));

  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Person', 'slug', 'w3_mig_person', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name'),
                                jsonb_build_object('name','phone')),
    'parent_id', v_home));

  v_widget := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Widget', 'slug', 'w3_mig_widget', 'type', 'entity',
    'label_singular', 'Widget', 'label_plural', 'Widgets', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name')),
    'parent_id', v_home));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_inv));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount_usd','label','Amount USD','type','range','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_inv))
  returning id into v_f_amt;

  -- THE VERIFIER'S EXACT CASE: a formula that reads amount_usd BY ID inside config.expr.
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

  -- THE SECOND WAY a dependency is written here: by KEY, in depends_on.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount_rounded','label','Amount rounded','type','formula','sort',40,'required',false,
    'multi',false,'dated',false,'source','formula','compute_on','write',
    'config', '{"expression":"round(amount_usd)"}'::jsonb,
    'rules','[]'::jsonb,'depends_on', jsonb_build_array('amount_usd'),
    'sensitivity','internal','source_config','{}'::jsonb,'context_policy','include',
    'applies_to_types','[]'::jsonb,'entity_definition_id',v_inv))
  returning id into v_f_key;

  -- The CONTROL: a Field nothing reads.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','memo','label','Memo','type','text','sort',50,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_inv))
  returning id into v_f_lonely;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','person_name','label','Name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_person))
  returning id into v_f_pname;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','phone','label','Phone','type','text','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_person))
  returning id into v_f_phone;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','person_name','label','Name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_widget));

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 2 — REC-18 / T7. THE REQUIRED INPUT OF THIS LANE'S EXIT.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.field_dependants(v_org, v_f_amt);
  if v_n < 2 then
    raise exception 'C-18 (2a): amount_usd is read by a formula by id AND by another by name, and field_dependants found % of them', v_n;
  end if;

  begin
    perform custom.migrate_delete(v_org, v_f_amt);
    raise exception 'C-18 (2a) — THE VERIFIER''S CASE IS STILL OPEN: amount_usd deleted although amount_with_tax reads it';
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Amount with tax' then
      raise exception 'C-18 (2a): the refusal did not name the formula that reads it by id — "%"', v_msg;
    end if;
    if v_msg !~ 'Amount rounded' then
      raise exception 'C-18 (2a): the refusal named the by-id dependant and not the by-name one — "%"', v_msg;
    end if;
  end;

  -- (b) THE CONTROL. A Field nothing reads deletes cleanly, through the same verb.
  v_res := custom.migrate_delete(v_org, v_f_lonely);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_f_lonely and r.deleted_at is not null) then
    raise exception 'C-18 (2b): the control field was not deleted';
  end if;
  raise notice 'PART 2 — REC-18 / T7: amount_usd refused, naming BOTH "Amount with tax" (by id) and "Amount rounded" (by name); a field nothing reads deleted cleanly on migration %.',
               v_res ->> 'migration_id';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 3 — REC-13. Deleting a Home is refused BY DEFAULT, naming the Tables.
  -- ══════════════════════════════════════════════════════════════════════════
  v_homerec := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Project Y'));
  v_tbl_at_home := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Incident', 'slug', 'w3_mig_incident', 'type', 'entity',
    'label_singular', 'Incident', 'label_plural', 'Incidents', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name')),
    'parent_id', v_home));
  perform custom.home_add(v_org, v_tbl_at_home, v_homerec);

  begin
    perform custom.migrate_delete(v_org, v_homerec);
    raise exception 'C-18 (3): Project Y was deleted although Incident lives there';
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Incident' then
      raise exception 'C-18 (3): the refusal did not name the table that lives there — "%"', v_msg;
    end if;
  end;

  -- THE CONTROL: the same Home, the same verb, once the Table says cascade.
  perform custom.record_update(v_org, v_tbl_at_home, jsonb_build_object('on_delete', 'cascade'));
  v_res := custom.migrate_delete(v_org, v_homerec);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_homerec and r.deleted_at is not null) then
    raise exception 'C-18 (3) control: the Home was still not deleted after its Table said cascade';
  end if;
  raise notice 'PART 3 — REC-13 / T7: deleting a Home is refused by DEFAULT naming "W3-MIG Incident"; the same delete goes through once that table declares cascade.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 4 — REC-12 / T7. Containment cascades through the ONE delete verb.
  -- ══════════════════════════════════════════════════════════════════════════
  v_w1 := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Widget'));
  v_serial := custom.record_write(v_org, v_widget,
                jsonb_build_object('person_name', 'SN-0001', 'parent_id', v_w1::text));
  v_serial2 := custom.record_write(v_org, v_widget,
                jsonb_build_object('person_name', 'SN-0002', 'parent_id', v_w1::text));

  v_res := custom.migrate_delete(v_org, v_w1);
  if coalesce((v_res ->> 'cascaded')::integer, 0) < 2 then
    raise exception 'C-18 (4): deleting Widget took % of its contained records', v_res ->> 'cascaded';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id in (v_w1, v_serial, v_serial2) and r.deleted_at is not null;
  if v_n <> 3 then
    raise exception 'C-18 (4): % of the three rows are deleted', v_n;
  end if;
  raise notice 'PART 4 — REC-12 / T7: deleting Widget took its % contained records with it, every one through custom.record_delete. Migration %.',
               v_res ->> 'cascaded', v_res ->> 'migration_id';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — T5 / REC-21. Two Chens, a parent extracted from each, then merged.
  -- ══════════════════════════════════════════════════════════════════════════
  v_chen1 := custom.record_write(v_org, v_person,
               jsonb_build_object('person_name', 'Chen', 'phone', '555-0001'));
  v_chen2 := custom.record_write(v_org, v_person,
               jsonb_build_object('person_name', 'Chen', 'phone', '555-0002'));

  v_res := custom.migrate_extract_parent(v_org, v_chen1, v_person, array['person_name','phone']);
  v_p1 := (v_res ->> 'parent')::uuid;
  v_res := custom.migrate_extract_parent(v_org, v_chen2, v_person, array['person_name','phone']);
  v_p2 := (v_res ->> 'parent')::uuid;
  if v_p1 is null or v_p2 is null or v_p1 = v_p2 then
    raise exception 'T5: extracting a parent from each Chen produced % and %', v_p1, v_p2;
  end if;

  v_res := custom.migrate_merge(v_org, v_p1, v_p2, 'the two Chens are one person');
  v_log := (v_res ->> 'migration_id')::uuid;

  -- (a) THE LOSING ID RESOLVES TO THE WINNER, FOREVER.
  if custom.resolve_id(v_org, v_p2) <> v_p1 then
    raise exception 'REC-21 (a): the losing id resolves to %, and the winner is %',
                    custom.resolve_id(v_org, v_p2), v_p1;
  end if;
  -- An id that was never merged resolves to itself, so every caller may ask.
  if custom.resolve_id(v_org, v_chen1) <> v_chen1 then
    raise exception 'REC-21 (a) second input: an id that was never aliased did not resolve to itself';
  end if;

  -- (b) BOTH NOTE SETS ARE REACHABLE through the surviving Person.
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = v_p1;
  if v_n < 2 then
    raise exception 'T5 (b): % of the two Chens hang off the surviving Person', v_n;
  end if;

  -- (c) THE TWO PHONE NUMBERS ARE ALTERNATES inside ONE document, each with its source.
  select jsonb_array_length(coalesce(r.data -> '_values' -> 'phone' -> 'alternates', '[]'::jsonb))
    into v_n
    from custom.record r where r.organization_id = v_org and r.id = v_p1;
  if v_n < 1 then
    raise exception 'T5 (c): the losing Person''s phone number is not an alternate on the winner';
  end if;
  -- The source is INTERNED: the alternate holds a pointer and _sources holds the description,
  -- which is VAL-1 working. Following the pointer is how a reader asks "where did this come
  -- from", so that is what this asserts.
  select (r.data -> '_sources' -> (r.data -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'src') ->> 'id')
    into v_txt from custom.record r where r.organization_id = v_org and r.id = v_p1;
  if v_txt is distinct from v_p2::text then
    raise exception 'T5 (c): the alternate does not say where it came from — "%"', coalesce(v_txt, 'nothing');
  end if;

  -- (d) UNDO RESTORES BOTH PERSONS AND BOTH IDS. It is EXECUTED, and read back.
  perform history.migration_undo(v_org, v_log);
  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_p2 and r.deleted_at is null) then
    raise exception 'T5 (d): undoing the merge did not bring the losing Person back';
  end if;
  raise notice 'PART 5 — T5 / REC-21: two Chens, a Person extracted from each, merged; the losing id resolves to the winner, the second phone number is an alternate carrying its source, and the undo brought both Persons and both ids back.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 6 — REC-22. On split, ONE SIDE KEEPS THE ID.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_person,
             jsonb_build_object('person_name', 'Split me', 'phone', '555-9999'));
  v_res := custom.migrate_split(v_org, v_rec, array['phone']);
  v_new := (v_res ->> 'new_record')::uuid;

  if (v_res ->> 'kept_the_id')::uuid <> v_rec then
    raise exception 'REC-22: the id that was kept is %, and it should be %', v_res ->> 'kept_the_id', v_rec;
  end if;
  if custom.resolve_id(v_org, v_rec) <> v_rec then
    raise exception 'REC-22: the old id now resolves to %, and it should still be itself', custom.resolve_id(v_org, v_rec);
  end if;
  select r.data ->> 'phone' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_rec;
  if v_txt is not null then
    raise exception 'REC-22: the moved key is still on the keeper — "%"', v_txt;
  end if;
  select r.data ->> 'phone' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_new;
  if v_txt <> '555-9999' then
    raise exception 'REC-22: the split-off side did not get the moved value — "%"', coalesce(v_txt, 'nothing');
  end if;
  raise notice 'PART 6 — REC-22: split kept the id % and moved phone to the new record %; the old id still resolves to itself.', v_rec, v_new;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 7 — T9 / REC-N-18 and T12 / FLD-4. Retype, both arms.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_person,
             jsonb_build_object('person_name', 'Retype me', 'phone', '555-1234'));
  -- No note is passed: the verb's OWN sentence is what a person reads on the log, and that is
  -- what has to carry the reason. A caller's note would mask it.
  v_res := custom.migrate_retype(v_org, v_rec, 'w3_mig_widget');

  -- THE ID DOES NOT CHANGE, which is the whole verb.
  if (v_res ->> 'record_id')::uuid <> v_rec then
    raise exception 'REC-N-18: retype returned a different id';
  end if;
  select r.table_id into v_tid from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if v_tid <> v_widget then
    raise exception 'REC-N-18: the record is still on table %', v_tid;
  end if;
  -- The Value the target Table accepts STAYED.
  select r.data ->> 'person_name' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_rec;
  if v_txt <> 'Retype me' then
    raise exception 'REC-N-18: the value the target table accepts did not survive — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- The MISFIT went to History WITH THE REASON, and was neither coerced nor deleted.
  if not (v_res -> 'misfits' ? 'phone') then
    raise exception 'REC-N-18: phone is not a misfit of the target table — %', v_res ->> 'misfits';
  end if;
  select m.note into v_txt from history.migration_log m
   where m.organization_id = v_org and m.id = (v_res ->> 'migration_id')::uuid;
  if v_txt !~* 'did not fit' then
    raise exception 'REC-N-18: the Migration log does not carry the reason — "%"', coalesce(v_txt, 'nothing');
  end if;
  if ((select m.inverse -> 'patch' ->> 'phone' from history.migration_log m
        where m.organization_id = v_org and m.id = (v_res ->> 'migration_id')::uuid)) <> '555-1234' then
    raise exception 'REC-N-18: the misfit value is not in the stored inverse, so it IS lost';
  end if;

  -- T12 / FLD-4: a Field's behaviour changes and NOTHING is coerced or deleted.
  v_res := custom.migrate_retype(v_org, v_f_phone, 'range');
  select r.data ->> 'type' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_f_phone;
  if v_txt <> 'range' then
    raise exception 'FLD-4: the field still behaves as "%"', v_txt;
  end if;
  select r.data ->> 'phone' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_chen1;
  if v_txt <> '555-0001' then
    raise exception 'FLD-4 / T12: the text value on a record was changed by the behaviour change — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- T12's OTHER half, and it is the store working rather than a problem: a NEW write to a
  -- record whose phone is now a range is validated against the range and refused. The value
  -- already there is untouched (asserted above); what changes is what may be written next.
  -- The field goes back to text so the later parts exercise the verbs and not this refusal.
  begin
    perform custom.record_update(v_org, v_chen1, jsonb_build_object('phone', '555-0009'));
    raise exception 'FLD-4: a string was accepted into a field that now behaves as a range';
  exception when check_violation then null;
  end;
  perform custom.migrate_retype(v_org, v_f_phone, 'text');

  raise notice 'PART 7 — T9 / REC-N-18: a record retyped keeps its id %, keeps what fits, and its misfit phone is in History with the reason and inside the stored inverse. T12 / FLD-4: a field became a range and "555-0001" is still exactly where it was.', v_rec;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 8 — REC-20 / REC-24. Every verb logged, reversible, and atomic.
  -- ══════════════════════════════════════════════════════════════════════════
  select string_agg(distinct m.verb, ',' order by m.verb) into v_txt
    from history.migration_log m where m.organization_id = v_org;
  if v_txt !~ 'delete' or v_txt !~ 'merge' or v_txt !~ 'retype'
     or v_txt !~ 'split' or v_txt !~ 'extract_parent' then
    raise exception 'REC-20: the verbs on the log are "%"', v_txt;
  end if;
  select count(*) into v_n from history.migration_log m
   where m.organization_id = v_org and (m.inverse is null or m.inverse = '{}'::jsonb);
  if v_n <> 0 then
    raise exception 'REC-20: % logged Migrations carry no inverse', v_n;
  end if;

  -- REC-24: the reparent and the containment edge every Visibility answer reads are ONE
  -- commit. Read the edge immediately after the verb returns — inside the same transaction,
  -- which is the only place an out-of-band window could be observed at all.
  v_res := custom.migrate_reparent(v_org, v_chen1, v_p1);
  if not exists (select 1 from custom.containment_edges(v_org) e
                  where e.parent_id = v_p1 and e.child_id = v_chen1 and e.via = 'contained') then
    raise exception 'REC-24: the containment edge is not there in the same commit as the reparent';
  end if;
  perform history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);

  -- A rename, undone, and READ BACK.
  v_res := custom.migrate_rename(v_org, v_p1, 'Chen, merged');
  select r.data ->> 'person_name' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_p1;
  if v_txt <> 'Chen, merged' then
    raise exception 'REC-20: the rename did not land — "%"', coalesce(v_txt, 'nothing');
  end if;
  perform history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);
  select r.data ->> 'person_name' into v_txt from custom.record r
   where r.organization_id = v_org and r.id = v_p1;
  if v_txt = 'Chen, merged' then
    raise exception 'REC-20: undoing the rename left it renamed';
  end if;

  -- promote / demote, the two verbs that move a Table's storage.
  v_res := custom.migrate_promote(v_org, v_person);
  if custom.table_storage(v_org, v_person) <> 'heavy' then
    raise exception 'REC-20: promote left the table on %', custom.table_storage(v_org, v_person);
  end if;
  v_res := custom.migrate_demote(v_org, v_person);
  if custom.table_storage(v_org, v_person) <> 'light' then
    raise exception 'REC-20: demote left the table on %', custom.table_storage(v_org, v_person);
  end if;
  raise notice 'PART 8 — REC-20 / REC-24: every logged Migration carries an inverse (0 without), the reparent''s containment edge exists in the same commit, an undone rename reads back as "%", and promote/demote moved the table both ways.', v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 9 — REC-23. Soft within retention; the purge only after it.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Purge me'));
  perform custom.migrate_delete(v_org, v_rec);

  -- Inside retention: still here, still reversible. The purge takes nothing.
  v_res := custom.migrate_purge(v_org, v_widget, false);
  if not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rec) then
    raise exception 'REC-23: a record deleted moments ago was purged';
  end if;
  perform custom.record_restore(v_org, v_rec);
  if exists (select 1 from custom.record r
              where r.organization_id = v_org and r.id = v_rec and r.deleted_at is not null) then
    raise exception 'REC-23: the delete was not reversible inside retention';
  end if;

  -- SECOND INPUT: past retention, the same call destroys it.
  perform custom.migrate_delete(v_org, v_rec);
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_rec;
  v_res := custom.migrate_purge(v_org, v_widget, false);
  if exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rec) then
    raise exception 'REC-23: a record deleted 400 days ago survived the purge — %', v_res::text;
  end if;

  -- AND THE ONE THING A PURGE NEVER TAKES: an id that still resolves to a record.
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_p2;
  perform custom.migrate_purge(v_org, v_person, false);
  if not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_p2) then
    raise exception 'REC-21 / REC-23: the merge loser was purged, so its id stopped resolving forever';
  end if;
  raise notice 'PART 9 — REC-23: a delete inside retention survived the purge and was restored; the same record past retention was destroyed (% row(s)); and a merged-away id was NOT purged, so REC-21''s "forever" outlives retention.',
               v_res ->> 'rows_purged';

  raise notice '════ C-18 GREEN — ten verbs, REC-12, REC-13, REC-18, REC-20…REC-24, REC-N-18, FLD-4, and T5, T7, T9 and T12. Rolling back. ════';
end;
$t$;

rollback;
