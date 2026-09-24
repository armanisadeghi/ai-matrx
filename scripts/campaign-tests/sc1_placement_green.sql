-- LANE SC-1 PLACEMENT — WHO KEEPS EACH TABLE, AND WHETHER THE CONTEXT PICKER OFFERS IT
-- (SCOPES-CONTEXT-TRANSITION.md §2.3 P1/P2, §4 brief SC-1).
--
-- THE USE CASE. Harborline Asset Recovery is an IT-asset-disposition company: it collects old
-- laptops and drives from its clients, wipes or shreds them, and certifies the destruction. Its
-- context system has the shape of the owner's Titanium organization — Clients, Departments and
-- Team Members — and lane SC-2 will copy each scope type into the record store as its own Table,
-- the way the scopes mover plans it (kept by the app for the context system, offered as context).
-- Beside them sit the company's own spreadsheets: the Pickup schedule, whose "Pickup status"
-- choice column is born with a choices Table of its own. The office manager, Renata Oduya, is
-- admin@admin.com; the dispatcher, Colm Achterberg, is test@test.com. Every name is synthesized;
-- nothing of the owner's organization is read or written.
--
-- WHAT MAKES IT FAIL:
--   P1  a door that makes a table for a feature and does not say so; kept_for on a table that is
--       not kept, or not one lower-case word; a non-boolean flag accepted; a pick-list or a person's
--       spreadsheet offered as context; a scope-type Table not offered.
--   P2  the facts door answering a kept table as the organization's, a keeper sentence
--       that does not name the column (or names a table the reader cannot open), no link to
--       where it is used, the table pickers' one list (G9) without the facts, a stranger answered.
--   F   a signed-in write into the copy of a scope type (the records tool, matrx-local's sync, the
--       grid) that goes through while custom/context_copy_following is on, or is refused without
--       the sentence naming the scope page; the follow's own write, a scope's own G11 table, or the
--       validation organization refused.
--   C   any live Table in the store the older facts say is kept that still does not carry the
--       store's flag kept_by_the_app (the classification backfill not run).
-- RED before sc1p_each_table_says_who_keeps_it.sql (custom.table_placement does not exist), RED again
-- before sc1p_the_facts_door_says_who_keeps_each_table.sql (the view has no kept_for), RED
-- before sc1p_every_table_a_feature_made_says_so.sql (C), and RED before sc1p_a_context_copy_is_written_only_by_its_follow.sql (F1). GREEN after all four.

\set ON_ERROR_STOP on
\timing off
\set suite 'sc1_placement_green.sql'
\set requires 'function:context.write_context_value|relation:workbench.udt_dataset_templates|function:custom.table_list_everywhere|function:custom.scope_table_provision'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com — Renata
  c_colm    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com — Colm
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_colm_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_pickups uuid; v_status uuid; v_opts uuid;
  v_clients uuid; v_depts uuid; v_team uuid; v_type uuid; v_scope uuid; v_item uuid; v_tpl uuid; v_scope_tbl uuid;
  v_f record; v_list jsonb; v_e jsonb; v_n integer; v_doc jsonb; v_msg text;
  v_scope_spec jsonb; v_client_rec uuid; v_log_rec uuid;
begin
  -- ── the fixture, as the store's owner, through the doors a person and the mover use ────────
  perform set_config('app.actor_system', 'campaign-test/sc1', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harborline Asset Recovery ' || substr(v_org::text, 1, 8),
          'harborline-asset-recovery-' || substr(v_org::text, 1, 8), 'HAR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_colm,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'sc1 fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'sc1 fixture: the dispatcher edits the pickup schedule');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- The company's own spreadsheet, with a choice column (its choices Table is born with it).
  v_pickups := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Pickup schedule', 'slug', 'pickup_schedule', 'type', 'entity',
    'label_singular', 'Pickup', 'label_plural', 'Pickups',
    'title_field', 'site', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'site', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'site'))));
  perform custom.field_declare(v_org, v_pickups, jsonb_build_object('key', 'site', 'label', 'Client site', 'type', 'text', 'sort', 10));
  v_status := custom.field_declare(v_org, v_pickups, jsonb_build_object(
    'key', 'pickup_status', 'label', 'Pickup status', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Requested', 'Scheduled', 'Collected', 'Wiped', 'Certificate sent')));
  select (data -> 'config' ->> 'options_table_id')::uuid into v_opts from custom.record
   where organization_id = v_org and id = v_status;

  -- The three scope types, as lane SC-2's mover will land them: one Table each, kept by the
  -- context system and offered in the context picker.
  for v_f in select * from (values
      ('Client', 'Clients', 'clients'), ('Department', 'Departments', 'departments'),
      ('Team Member', 'Team Members', 'team_members')) x(singular, plural, slug) loop
    v_scope_spec := jsonb_build_object(
      'name', v_f.singular, 'slug', v_f.slug, 'type', 'entity',
      'label_singular', v_f.singular, 'label_plural', v_f.plural,
      'title_field', 'name', 'display', 'page', 'weight', 'light',
      'ordered', false, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
      'parent_id', v_home::text,
      'kept_by_the_app', true, 'kept_for', 'context', 'offered_as_context', true,
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')));
    if v_f.slug = 'clients' then v_clients := custom.table_declare(v_org, v_scope_spec);
    elsif v_f.slug = 'departments' then v_depts := custom.table_declare(v_org, v_scope_spec);
    else v_team := custom.table_declare(v_org, v_scope_spec); end if;
  end loop;

  -- A department's own table from the company's template (G11): the Shred room's destruction log.
  insert into context.scope_types (organization_id, label_singular, label_plural, slug)
  values (v_org, 'Department', 'Departments', 'department-' || substr(v_org::text, 1, 8)) returning id into v_type;
  insert into context.scopes (organization_id, scope_type_id, name, slug)
  values (v_org, v_type, 'Shred room', 'shred-room-' || substr(v_org::text, 1, 8)) returning id into v_scope;
  insert into workbench.udt_dataset_templates (organization_id, name, description, created_by)
  values (v_org, 'Destruction log', 'Every drive destroyed, by serial number, with its certificate', c_admin) returning id into v_tpl;
  insert into workbench.udt_dataset_template_fields (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules) values
    (v_tpl, 'serial_number', 'Serial number', 'string', 0, true, '{"description":"As printed on the drive label."}'),
    (v_tpl, 'destroyed_on', 'Destroyed on', 'date', 1, false, '{}'),
    (v_tpl, 'method', 'Method', 'string', 2, false, '{}');
  insert into context.context_items (key, display_name, scope_type_id, slug, value_type, allowed_reference_types, max_items, reference_source)
  values ('destruction_log', 'Destruction log', v_type, 'destruction-log-' || substr(v_org::text, 1, 8),
          'reference', array['table'], 1,
          jsonb_build_object('container_type', 'dataset_template', 'template_id', v_tpl))
  returning id into v_item;
  -- One client already copied, as the follow writes it (the store owner's connection).
  v_client_rec := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Data Destruction, Inc'));
  v_scope_tbl := custom.scope_table_provision(p_organization_id => v_org, p_item_id => v_item, p_scope_id => v_scope, p_home_id => v_home);

  -- ══ P1 · the doors say who keeps what they make, on the way in ═══════════════════════════════
  select data into v_doc from custom.record where organization_id = v_org and id = v_opts;
  if v_doc ->> 'kept_by_the_app' is distinct from 'true' or v_doc ? 'offered_as_context' then
    raise exception 'P1a: the "Pickup status" choices Table is not flagged kept by the app (or claims a context offer): %',
      v_doc - 'fields' - 'default_sort';
  end if;
  -- G11's own `scope_binding` is the placement: kept, for the context system, bound to that scope.
  select data into v_doc from custom.record where organization_id = v_org and id = v_scope_tbl;
  if v_doc -> 'scope_binding' ->> 'scope_id' is distinct from v_scope::text
     or custom.table_placement(v_org, v_scope_tbl, v_doc, false)
        is distinct from '{"kept_by_the_app": true, "kept_for": "context", "offered_as_context": false}'::jsonb then
    raise exception 'P1b: the Shred room''s destruction log is not placed as kept for the context system, bound to Shred room: %',
      custom.table_placement(v_org, v_scope_tbl, v_doc, false);
  end if;
  select count(*) into v_n from custom.table
   where organization_id = v_org and id in (v_pickups, v_clients, v_opts, v_scope_tbl)
     and ((id = v_pickups and not kept_by_the_app and kept_for is null and not offered_as_context)
       or (id = v_clients and kept_by_the_app and kept_for = 'context' and offered_as_context)
       or (id = v_opts and kept_by_the_app and kept_for = 'choices' and not offered_as_context)
       or (id = v_scope_tbl and kept_by_the_app and kept_for = 'context' and not offered_as_context));
  if v_n <> 4 then raise exception 'P1c: custom.table does not carry kept_by_the_app / kept_for / offered_as_context truthfully (% of 4): %', v_n, (select jsonb_agg(jsonb_build_array(name, kept_by_the_app, kept_for, offered_as_context)) from custom.table where organization_id = v_org and id in (v_pickups, v_clients, v_opts, v_scope_tbl)); end if;

  -- The guard: kept_for on a table nobody keeps, kept_for not a word, a non-boolean flag or offer.
  foreach v_msg in array array[
      '{"kept_for":"context"}', '{"kept_by_the_app":true,"kept_for":"Scopes!"}',
      '{"kept_by_the_app":"yes"}', '{"offered_as_context":"yes"}'] loop
    begin
      perform custom.table_declare(v_org, jsonb_build_object(
        'name', 'Certificates of destruction', 'slug', 'certificates', 'type', 'entity',
        'label_singular', 'Certificate', 'label_plural', 'Certificates',
        'title_field', 'number', 'display', 'list', 'weight', 'light',
        'ordered', false, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
        'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
        'fields', jsonb_build_array(jsonb_build_object('name', 'number'))) || v_msg::jsonb);
      raise exception 'P1d: custom._table_shape_guard accepted %', v_msg;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'P1 PASS — the choices Table is flagged and derives kept_for=choices; the destruction log is kept for context through its own scope_binding; the view carries the three columns; four wrong shapes refused.';

  -- ══ P2 · the facts door, from both seats, and a stranger ═════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;
  foreach v_msg in array array[c_admin_j, c_colm_j] loop
    perform set_config('request.jwt.claims', v_msg, true);
    if not exists (select 1 from custom.table_facts(v_org) f where f.table_id = v_pickups
                     and not f.kept_by_the_app and f.kept_for is null and not f.offered_as_context
                     and f.keeper_says is null and f.used_in_id is null) then
      raise exception 'P2a (%): the Pickup schedule is not answered as the organization''s own, with no keeper sentence', v_msg;
    end if;
    select count(*) into v_n from custom.table_facts(v_org) f
     where f.table_id in (v_clients, v_depts, v_team) and f.kept_by_the_app and f.kept_for = 'context'
       and f.offered_as_context and f.keeper_group = 'The context system'
       and f.keeper_says like 'Kept by the context system: each % in it is a context you can pick for an agent, and opens on its own page.'
       and f.used_in_kind = 'table' and f.used_in_id = f.table_id;
    if v_n <> 3 then raise exception 'P2b (%): Clients, Departments and Team Members are not all under "The context system" with their sentence (% of 3)', v_msg, v_n; end if;
    if not exists (select 1 from custom.table_facts(v_org) f where f.table_id = v_opts
                     and f.kept_by_the_app and f.kept_for = 'choices' and not f.offered_as_context
                     and f.keeper_group = 'The choices behind your columns'
                     and f.keeper_says = 'Kept by the Pickup status column of Pickup schedule: it holds that column''s choices and opens from there.'
                     and f.used_in_kind = 'table' and f.used_in_id = v_pickups and f.used_in_table_id = v_pickups) then
      raise exception 'P2c (%): the choices Table does not say it is kept by the Pickup status column of Pickup schedule, with the link: %', v_msg,
        (select row_to_json(f) from custom.table_facts(v_org) f where f.table_id = v_opts);
    end if;
    if not exists (select 1 from custom.table_facts(v_org) f where f.table_id = v_scope_tbl
                     and f.keeper_says = 'Kept by the context system: it belongs to Shred room and opens from there.'
                     and f.used_in_kind = 'scope' and f.used_in_id = v_scope and f.used_in_table_id is null) then
      raise exception 'P2d (%): the destruction log does not say it belongs to Shred room, with the scope as where it is used', v_msg;
    end if;
    -- G9: the one list behind every table picker carries the same facts.
    v_list := custom.table_list_everywhere(v_org);
    select e into v_e from jsonb_array_elements(v_list -> 'tables') e where (e ->> 'id')::uuid = v_opts;
    if (v_e ->> 'kept_by_the_app')::boolean is distinct from true or v_e ->> 'kept_for' is distinct from 'choices'
       or (v_e ->> 'offered_as_context')::boolean is distinct from false then
      raise exception 'P2e (%): the table pickers'' list does not carry the choices Table''s placement: %', v_msg, v_e;
    end if;
    select count(*) into v_n from jsonb_array_elements(v_list -> 'tables') e
     where (e ->> 'id')::uuid in (v_pickups, v_clients, v_depts, v_team)
       and ((e ->> 'id')::uuid = v_pickups) = not (e ->> 'kept_by_the_app')::boolean
       and ((e ->> 'id')::uuid = v_pickups) = not (e ->> 'offered_as_context')::boolean;
    if v_n <> 4 then raise exception 'P2f (%): the picker list does not say the Pickup schedule is the organization''s and the three scope tables are kept and offered as context (% of 4)', v_msg, v_n; end if;
  end loop;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.table_facts(v_org);
    raise exception 'P2g: a stranger read Harborline''s table facts';
  exception when insufficient_privilege then null;
  end;
  raise notice 'P2 PASS — both seats: Pickup schedule is the organization''s; Clients, Departments, Team Members under "The context system"; the choices Table names the Pickup status column of Pickup schedule and links to it; the destruction log links to Shred room; G9 carries the facts; a stranger is refused.';

  -- ══ F · the write fence on the copy (P13) ═══════════════════════════════════════════════════
  -- Renata, signed in, writes the copied client the way the records agent tool and matrx-local's
  -- sync do (custom.record_write / custom.record_update): refused, with the sentence.
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.record_update(v_org, v_client_rec, jsonb_build_object('name', 'Data Destruction Incorporated'));
    raise exception 'F1: a signed-in write to the copied client Data Destruction, Inc went through';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'This is the new system''s copy of Client; it follows the current screens until the switch. Edit it on /scopes/s/%' then
      raise exception 'F1: refused, but not with the sentence: %', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Northgate Credit Union'));
    raise exception 'F2: a signed-in new record in the copied Clients table went through';
  exception when insufficient_privilege then null;
  end;
  -- A scope's own table (G11) is the store's to write: the Shred room logs a destroyed drive.
  v_log_rec := custom.record_write(v_org, v_scope_tbl, jsonb_build_object('serial_number', 'WD-WX12A83K7N2P', 'method', 'Shred'));
  -- The follow (the store owner's connection) writes the copy.
  perform set_config('role', 'postgres', true);
  perform custom.record_update(v_org, v_client_rec, jsonb_build_object('name', 'Data Destruction, Inc.'));
  -- The validation organization: the store is its writer, so it turns the fence off for itself.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'context_copy_following', 'organization', v_org, v_org, 'false'::jsonb, 'sc1 fixture: the validation organization writes its own store');
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_client_rec, jsonb_build_object('name', 'Data Destruction, Inc (validation)'));
  raise notice 'F PASS — a signed-in write and a new record in the copy are refused with the sentence naming /scopes/s/<id>; the Shred room''s own table takes its row; the follow writes the copy; the validation organization writes it once the fence is off for it.';

  -- ══ C · the classification backfill reached every table the store already keeps ════════════
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record r
   where r.table_id = custom.table_kernel_id() and r.data_class = 'table' and r.deleted_at is null
     and r.data ->> 'kept_by_the_app' is distinct from 'true'
     and custom.table_kept_for_derived(r.data, false,
           coalesce(custom.table_is_options_table(r.organization_id, r.id), false)) is not null;
  if v_n <> 0 then
    raise exception 'C: % live Tables the older facts say are kept still do not carry kept_by_the_app', v_n;
  end if;
  raise notice 'C PASS — every live Table the store keeps for a feature or for itself carries its flag.';
end
$t$;

rollback;
\echo 'sc1_placement_green.sql: ALL PASS (rolled back)'
