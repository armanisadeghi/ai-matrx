-- LANE GRID-PRIMITIVES, G9 · G10 · G11 — THE CUTOVER'S MISSING STORE PRIMITIVES (CUTOVER-PLAN.md
-- rows F1, A3, F11/D5).
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic is half moved. Marisol Vega
-- (test@test.com) still has her older "Boarding kennel log" dataset and the clinic's Appointments
-- are in the record store (G9: one picker lists both). The clinic keeps its vaccine-reminder list
-- in a Google Sheet tab that refreshes into a table (G10). Its "Exam room" context scopes each get
-- an "Equipment defects" table from the clinic's template (G11). All names are synthesized.
--
-- WHAT MAKES IT FAIL:
--   G9  a picker that lists only one store, or lists a Table this person may not open.
--   G10 a refresh that makes a second table, loses a column the person added, duplicates a row,
--       or destroys a row the sheet dropped instead of archiving it.
--   G11 a scope that gets a second table on a second call, a table without the template's
--       columns, or a context value that does not name the record-store table; an UNMOVED clinic
--       whose new scope stops getting its older table, or a MOVED clinic whose new scope still
--       mints an older dataset instead of a store Table.
-- RED before the three gridprim_* files (door absent), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g9_g11_green.sql'
\set requires 'function:context.write_context_value|relation:workbench.udt_dataset_templates'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_home uuid; v_older uuid; v_list jsonb; v_res jsonb; v_res2 jsonb;
  v_tbl uuid; v_n integer; v_type uuid; v_scope uuid; v_item uuid; v_tpl uuid; v_t1 uuid; v_t2 uuid; v_val text;
  v_spec jsonb; v_keep uuid; v_scope5 uuid; v_ds5 uuid; v_khome uuid; v_t3 uuid;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_home from gp where k = 'home';

  -- fixture: Marisol's older dataset; the exam-room scope, its item and the defects template.
  perform set_config('request.jwt.claims', c_dana_j, true);
  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility)
  values ('Boarding kennel log ' || substr(v_org::text, 1, 8), 'Who is boarding, which run, feeding notes', c_dana, v_org, c_dana, 'personal')
  returning id into v_older;
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into context.scope_types (organization_id, label_singular, label_plural, slug)
  values (v_org, 'Exam room', 'Exam rooms', 'exam-room-' || substr(v_org::text, 1, 8)) returning id into v_type;
  insert into context.scopes (organization_id, scope_type_id, name, slug)
  values (v_org, v_type, 'Exam room 2', 'exam-room-2-' || substr(v_org::text, 1, 8)) returning id into v_scope;
  insert into workbench.udt_dataset_templates (organization_id, name, description, created_by)
  values (v_org, 'Equipment defects', 'What is broken in a room and who is fixing it', c_admin) returning id into v_tpl;
  insert into workbench.udt_dataset_template_fields (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules) values
    (v_tpl, 'equipment', 'Equipment', 'string', 0, true, '{"description":"The machine or fixture, as the staff call it."}'),
    (v_tpl, 'reported_on', 'Reported on', 'date', 1, false, '{}'),
    (v_tpl, 'out_of_service', 'Out of service', 'boolean', 2, false, '{}'),
    (v_tpl, 'repair_cost', 'Repair cost', 'number', 3, false, '{}');
  insert into context.context_items (key, display_name, scope_type_id, slug, value_type, allowed_reference_types, max_items, reference_source)
  values ('equipment_defects', 'Equipment defects', v_type, 'equipment-defects-' || substr(v_org::text, 1, 8),
          'reference', array['table'], 1,
          jsonb_build_object('container_type', 'dataset_template', 'template_id', v_tpl))
  returning id into v_item;

  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ G9 ═══════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_list := custom.table_list_everywhere(v_org);
  if not (v_list ->> 'success')::boolean
     or not exists (select 1 from jsonb_array_elements(v_list -> 'tables') t where (t ->> 'id')::uuid = v_older and t ->> 'store' = 'older')
     or not exists (select 1 from jsonb_array_elements(v_list -> 'tables') t where (t ->> 'id')::uuid = v_appts and t ->> 'store' = 'records'
                      and (t ->> 'row_count')::integer = 10) then
    raise exception 'G9a: Marisol''s picker does not list her kennel log (older) AND Appointments (records, 10 rows): %', v_list;
  end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.table_list_everywhere(v_org);
    raise exception 'G9b: a stranger listed the clinic''s tables';
  exception when insufficient_privilege then null;
  end;
  raise notice 'G9 PASS — one list: Boarding kennel log (older) and Appointments (records, 10 rows); a stranger is refused.';

  -- ══ G10 ══════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_spec := jsonb_build_object(
    'source', jsonb_build_object('provider', 'google_sheets', 'external_id', '1qV8crvet-reminders-tab', 'tab_id', '0', 'synced_at', '2026-09-23T08:00:00Z'),
    'table_name', 'Vaccine reminders',
    'columns', jsonb_build_array('Patient', 'Vaccine', 'Due'),
    'rows', jsonb_build_array(
      jsonb_build_object('ref', 'row-2', 'values', jsonb_build_object('Patient', 'Biscuit (Hollis)', 'Vaccine', 'Rabies 3-yr', 'Due', '2026-10-04')),
      jsonb_build_object('ref', 'row-3', 'values', jsonb_build_object('Patient', 'Juniper (Okafor)', 'Vaccine', 'FVRCP', 'Due', '2026-10-11')),
      jsonb_build_object('ref', 'row-4', 'values', jsonb_build_object('Patient', 'Rocco (Abernathy)', 'Vaccine', 'Bordetella', 'Due', '2026-09-30'))));
  v_res := custom.table_sync(v_org, v_home, v_spec);
  v_tbl := (v_res ->> 'table_id')::uuid;
  if not (v_res ->> 'created')::boolean or (v_res ->> 'rows_inserted')::integer <> 3 then
    raise exception 'G10a: the first refresh did not make one table with three rows: %', v_res;
  end if;
  -- The person adds a column of her own in Matrx.
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'called_owner', 'label', 'Called owner', 'type', 'checkbox'));
  perform set_config('role', 'postgres', true);
  v_keep := (select r.id from custom.record r where r.organization_id = v_org and r.table_id = v_tbl and r.metadata ->> 'source_id' = 'row-2');
  v_older := (select r.id from custom.record r where r.organization_id = v_org and r.table_id = v_tbl and r.metadata ->> 'source_id' = 'row-3');
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_keep, jsonb_build_object('called_owner', true));
  -- The sheet changes: Juniper's due date moves, Rocco's row is gone, Olive is new.
  v_spec := jsonb_set(v_spec, '{rows}', jsonb_build_array(
      jsonb_build_object('ref', 'row-2', 'values', jsonb_build_object('Patient', 'Biscuit (Hollis)', 'Vaccine', 'Rabies 3-yr', 'Due', '2026-10-04')),
      jsonb_build_object('ref', 'row-3', 'values', jsonb_build_object('Patient', 'Juniper (Okafor)', 'Vaccine', 'FVRCP', 'Due', '2026-10-18')),
      jsonb_build_object('ref', 'row-5', 'values', jsonb_build_object('Patient', 'Olive (Nakamura)', 'Vaccine', 'FeLV', 'Due', '2026-10-02'))));
  v_res2 := custom.table_sync(v_org, v_home, v_spec);
  if (v_res2 ->> 'table_id')::uuid is distinct from v_tbl or (v_res2 ->> 'created')::boolean
     or (v_res2 ->> 'rows_inserted')::integer <> 1 or (v_res2 ->> 'rows_updated')::integer <> 2
     or (v_res2 ->> 'rows_archived')::integer <> 1 then
    raise exception 'G10b: the second refresh was not the same table, 1 new / 2 updated / 1 archived: %', v_res2;
  end if;
  if custom.read_record(v_org, v_keep, false) ->> 'called_owner' is distinct from 'true'
     or custom.read_record(v_org, v_older, false) ->> 'due' is distinct from '2026-10-18' then
    raise exception 'G10c: the refresh lost Marisol''s own column or missed Juniper''s new due date';
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tbl
     and r.metadata ->> 'source_id' = 'row-4' and r.deleted_at is not null;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then raise exception 'G10d: Rocco''s dropped row was not archived (found % archived)', v_n; end if;
  raise notice 'G10 PASS — one "Vaccine reminders" table: 3 rows, then +Olive, Juniper moved to 10-18, Rocco archived (not destroyed); "Called owner" survives the refresh.';

  -- ══ G11 ══════════════════════════════════════════════════════════════════════════════════
  v_t1 := custom.scope_table_provision(v_org, v_item, v_scope, v_home);
  v_t2 := custom.scope_table_provision(v_org, v_item, v_scope, v_home);
  if v_t1 is distinct from v_t2 then raise exception 'G11a: a second call made a second table'; end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_t1::text
     and f.data ->> 'key' in ('equipment', 'reported_on', 'out_of_service', 'repair_cost');
  select cv.value_text into v_val from context.context_item_values cv
   where cv.context_item_id = v_item and cv.scope_id = v_scope and cv.is_current limit 1;
  perform set_config('role', 'authenticated', true);
  if v_n <> 4 then raise exception 'G11b: the table has % of the template''s 4 columns', v_n; end if;
  if coalesce(v_val, '') not like '%' || v_t1::text || '%' or coalesce(v_val, '') not like '%"store": "records"%' then
    raise exception 'G11c: the context value does not name the record-store table % : %', v_t1, replace(v_val, chr(10), ' ');
  end if;
  -- G11e: the trigger. Unmoved, "Exam room 2" got its OLDER table when the item was added (as
  -- before); once the clinic has moved, a new "Exam room 3" gets a store Table and no older one.
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from context.scope_dataset_instances i where i.context_item_id = v_item and i.scope_id = v_scope;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then raise exception 'G11e: the unmoved clinic''s Exam room 2 did not get its older table from the trigger (% instances)', v_n; end if;
  -- Exam room 5 is opened BEFORE the move, so it gets an older table (a pre-move instance).
  perform set_config('role', 'postgres', true);
  insert into context.scopes (organization_id, scope_type_id, name, slug)
  values (v_org, v_type, 'Exam room 5', 'exam-room-5-' || substr(v_org::text, 1, 8)) returning id into v_scope5;
  select i.dataset_id into v_ds5 from context.scope_dataset_instances i where i.context_item_id = v_item and i.scope_id = v_scope5;
  perform set_config('role', 'authenticated', true);
  if v_ds5 is null then raise exception 'G11-setup: the unmoved Exam room 5 got no older table'; end if;
  -- THE MOVE IS THE MOVER'S ACT, SO IT IS TAKEN AS THE MOVER (amended by lane SUITE-HEALTH-2,
  -- 2026-09-25). `data_tables.older_tables_moved` is no longer written through
  -- platform.knob_override_set — since
  -- migrations/campaign/flipseams_every_switch_from_old_to_new_is_one_owner_press.sql that door
  -- answers {"ok": false, "reason": "wrong_door"} and only platform.cutover_seam_press (an owner,
  -- in a browser, with the seam's readiness met) may set it. This call ignored that answer, so the
  -- clinic silently never moved. The fixture now records the finished move as the role that owns
  -- the store, beside the Home and the carried table the mover also writes below.
  perform set_config('role', 'postgres', true);
  delete from platform.knob_override where feature = 'data_tables' and key = 'older_tables_moved'
     and scope_kind = 'organization' and scope_id = v_org;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('data_tables', 'older_tables_moved', 'organization', v_org, v_org, 'true'::jsonb,
          'Cedar Ridge moved into the record store');
  -- The mover gives a moved organization ONE Home: a record of the organization kernel.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, custom.organization_kernel_id(), jsonb_build_object('name', 'Cedar Ridge Veterinary Clinic'))
  returning id into v_khome;
  -- The mover carries Exam room 5's older table into the store under the SAME id, and
  -- archives the older one saying where it went (W7's own function).
  insert into custom.record (id, organization_id, table_id, data_class, data)
  select v_ds5, v_org, custom.table_kernel_id(), 'table',
         (t.data - 'scope_binding') || jsonb_build_object('name', 'Exam room 5 — Equipment defects', 'slug', 'moved_' || left(md5(v_ds5::text), 12))
    from custom.record t where t.organization_id = v_org and t.id = v_t1;
  perform workbench.udt_dataset_archive(v_ds5, v_ds5, 'Cedar Ridge moved into the record store');
  insert into context.scopes (organization_id, scope_type_id, name, slug)
  values (v_org, v_type, 'Exam room 3', 'exam-room-3-' || substr(v_org::text, 1, 8)) returning id into v_scope;
  select count(*) into v_n from context.scope_dataset_instances i where i.context_item_id = v_item and i.scope_id = v_scope;
  select t.id into v_t2 from custom.record t where t.organization_id = v_org and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null and t.data -> 'scope_binding' ->> 'scope_id' = v_scope::text;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 or v_t2 is null then
    raise exception 'G11e: the moved clinic''s Exam room 3 got % older tables and store Table %', v_n, v_t2;
  end if;
  -- G11f: no Home named — the organization's own Home (the trigger's, the mover's) is used.
  perform set_config('role', 'postgres', true);
  if (select t.data ->> 'parent_id' from custom.record t where t.organization_id = v_org and t.id = v_t2) is distinct from v_khome::text then
    raise exception 'G11f: Exam room 3''s table does not live in the organization''s Home %', v_khome;
  end if;
  perform set_config('role', 'authenticated', true);
  v_t3 := custom.scope_table_provision(v_org, v_item, v_scope);
  if v_t3 is distinct from v_t2 then raise exception 'G11f: called without a Home, Exam room 3 answered % not its table %', v_t3, v_t2; end if;
  -- G11g: Exam room 5's pre-move instance answers with its moved Table — never a second one.
  v_t3 := custom.scope_table_provision(v_org, v_item, v_scope5);
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record t where t.organization_id = v_org and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null and t.data -> 'scope_binding' ->> 'scope_id' = v_scope5::text;
  perform set_config('role', 'authenticated', true);
  if v_t3 is distinct from v_ds5 or v_n <> 1 then
    raise exception 'G11g: Exam room 5 answered % (its moved table is %), % tables bound to it', v_t3, v_ds5, v_n;
  end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.scope_table_provision(v_org, v_item, v_scope, v_home);
    raise exception 'G11d: a stranger provisioned a table in the clinic';
  exception when insufficient_privilege then null;
  end;
  raise notice 'G11 PASS — "Exam room 2 — Equipment defects": one table, four template columns, the context value names it in the record store; unmoved, a new scope still gets its older table; moved, "Exam room 3" gets a store Table in the organization''s Home (named or not) and no older one; Exam room 5''s pre-move table is answered with its moved Table, never a second; a stranger is refused.';
  raise notice 'GRIDPRIM G9-G11 GREEN — every part passed.';
end $t$;
rollback;
