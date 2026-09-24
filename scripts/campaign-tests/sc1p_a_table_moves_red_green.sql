-- LANE SC-1' — A TABLE SAYS WHICH ORGANIZATION IT LIVES IN, AND ITS OWNER CAN MOVE IT.
--
-- THE OWNER (2026-09-23 ~22:40 PT): "I am not seeing how I can see what org this data is in. Is
-- there an easy way to see that or do we need to add something that makes it easy to see and set
-- the org for something?"
--
-- THE USE CASE. Cascade Electronics Recovery runs two yards as two organizations. The Tacoma Yard
-- keeps "Scale tickets" — every inbound load weighed at the scale house (the hauler, the material,
-- the net weight). The Portland Depot is taking over weighing, so the operations lead,
-- admin@admin.com (owner of both yards), moves the table to Portland. The Tacoma scale clerk,
-- test@test.com, is a member of Tacoma only: she sees where the table lives but may not move it.
-- Every name, weight and ticket below is synthesized. Everything is rolled back.
--
-- WHAT MAKES IT FAIL (RED before sc1p_a_table_says_where_it_lives_and_its_owner_can_move_it.sql
-- and its grant, GREEN after):
--   M1  custom.table_home names the table's organization BY NAME, from the table
--   M2  the clerk (member, not maker, not manager) reads may_move = false with the sentence, and
--       custom.table_move refuses her with it (42501) — nothing moved
--   M3  a destination the caller is not a member of is refused
--   M4  a destination holding a table by the same name is offered with the sentence, and refused
--   M5  a table the app keeps (kept_by_the_app) is held with the sentence and refused
--   M6  the owner's move lands: the table, its Fields, its Records (live and in the trash), its
--       comment move; custom.where_id_opens names Portland; the rows read back through
--       custom.read_records in Portland; one history version says 'table_move'; the earlier
--       history of a row answers in Portland
--   M7  after the move the clerk (Tacoma only) no longer reaches it — not given

\set ON_ERROR_STOP on
\timing off
\set suite 'sc1p_a_table_moves_red_green.sql'
\set requires ''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table mv (k text primary key, v uuid) on commit drop;
grant select on mv to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_clerk   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid := gen_random_uuid();
  v_pdx uuid := gen_random_uuid();
  v_far uuid := gen_random_uuid();
  v_t uuid; v_dup uuid; v_kept uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_home_tac uuid; v_home_pdx uuid; v_home_far uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/sc1p-move', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_tac, 'Cascade Electronics Recovery - Tacoma Yard ' || substr(v_tac::text, 1, 6), 'cer-tacoma-' || substr(v_tac::text, 1, 8), 'CET', c_admin),
    (v_pdx, 'Cascade Electronics Recovery - Portland Depot ' || substr(v_pdx::text, 1, 6), 'cer-portland-' || substr(v_pdx::text, 1, 8), 'CEP', c_admin),
    (v_far, 'Harbor Freight Brokers ' || substr(v_far::text, 1, 6), 'harbor-freight-' || substr(v_far::text, 1, 8), 'HFB', c_clerk);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_tac, 'organization', v_tac, c_admin, 'owner',  'active'),
    (v_tac, 'organization', v_tac, c_clerk, 'member', 'active'),
    (v_pdx, 'organization', v_pdx, c_admin, 'owner',  'active'),
    (v_far, 'organization', v_far, c_clerk, 'owner',  'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_tac, v_tac, 'true'::jsonb, 'sc1p move suite'),
    ('custom', 'system_enabled', 'organization', v_pdx, v_pdx, 'true'::jsonb, 'sc1p move suite'),
    ('custom', 'system_enabled', 'organization', v_far, v_far, 'true'::jsonb, 'sc1p move suite');

  -- Each yard's own record in the store (the Organization kernel) is where its tables live.
  insert into custom.record (organization_id, table_id, data) values
    (v_tac, custom.organization_kernel_id(), jsonb_build_object('name', 'Cascade Electronics Recovery - Tacoma Yard'))
    returning id into v_home_tac;
  insert into custom.record (organization_id, table_id, data) values
    (v_pdx, custom.organization_kernel_id(), jsonb_build_object('name', 'Cascade Electronics Recovery - Portland Depot'))
    returning id into v_home_pdx;
  insert into custom.record (organization_id, table_id, data) values
    (v_far, custom.organization_kernel_id(), jsonb_build_object('name', 'Harbor Freight Brokers'))
    returning id into v_home_far;

  v_t := custom.table_declare(v_tac, jsonb_build_object(
    'name', 'Scale tickets', 'slug', 'scale_tickets', 'type', 'entity',
    'label_singular', 'Scale ticket', 'label_plural', 'Scale tickets', 'title_field', 'ticket',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'ticket', 'direction', 'asc')), 'parent_id', v_home_tac::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'ticket'))));
  perform custom.field_declare(v_tac, v_t, jsonb_build_object('key', 'ticket', 'label', 'Ticket', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_tac, v_t, jsonb_build_object('key', 'hauler', 'label', 'Hauler', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_tac, v_t, jsonb_build_object('key', 'net_lbs', 'label', 'Net weight (lb)', 'type', 'number', 'sort', 30));
  v_r1 := custom.record_write(v_tac, v_t, jsonb_build_object('ticket', 'T-40812', 'hauler', 'Puget Sound Salvage', 'net_lbs', 18420));
  v_r2 := custom.record_write(v_tac, v_t, jsonb_build_object('ticket', 'T-40813', 'hauler', 'Rainier Scrap & Metal', 'net_lbs', 7260));
  v_r3 := custom.record_write(v_tac, v_t, jsonb_build_object('ticket', 'T-40814', 'hauler', 'Tideflats E-Waste', 'net_lbs', 2310));
  perform custom.record_delete(v_tac, v_r3);   -- a voided ticket, in the trash: it moves too
  insert into custom.io_comment (record_id, table_id, body, organization_id, created_by)
  values (v_r1, v_t, 'Load had two CRT monitors mixed in; flagged for hand sort.', v_tac, c_admin);

  -- Portland already keeps its own "Inbound manifests", and a same-named "Scale tickets" in the
  -- far organization the clerk owns (a destination admin is not a member of).
  v_dup := custom.table_declare(v_far, jsonb_build_object(
    'name', 'Scale tickets', 'slug', 'scale_tickets', 'type', 'entity',
    'label_singular', 'Scale ticket', 'label_plural', 'Scale tickets', 'title_field', 'ticket',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'ticket', 'direction', 'asc')), 'parent_id', v_home_far::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'ticket'))));

  -- A table the app keeps for Tacoma (a choice list), which must not move by itself.
  v_kept := custom.table_declare(v_tac, jsonb_build_object(
    'name', 'Material choices', 'slug', 'material_choices', 'type', 'entity',
    'label_singular', 'Material', 'label_plural', 'Materials', 'title_field', 'label',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'label', 'direction', 'asc')), 'parent_id', v_home_tac::text, 'kept_by_the_app', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'label'))));

  insert into mv values ('home_pdx', v_home_pdx), ('tac', v_tac), ('pdx', v_pdx), ('far', v_far), ('t', v_t), ('dup', v_dup),
                        ('kept', v_kept), ('r1', v_r1), ('r2', v_r2), ('r3', v_r3);
end
$fixture$;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_clerk_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_tac uuid; v_pdx uuid; v_far uuid; v_t uuid; v_kept uuid; v_r1 uuid; v_r3 uuid;
  v_home jsonb; v_moved jsonb; v_msg text; v_state text; v_n bigint; v_d jsonb;
begin
  select v into v_tac from mv where k = 'tac';  select v into v_pdx from mv where k = 'pdx';
  select v into v_far from mv where k = 'far';  select v into v_t   from mv where k = 't';
  select v into v_kept from mv where k = 'kept'; select v into v_r1 from mv where k = 'r1';
  select v into v_r3 from mv where k = 'r3';

  -- ══ the clerk's seat ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_clerk_j, true);

  v_home := custom.table_home(v_t);
  if v_home is null or v_home #>> '{organization,id}' <> v_tac::text
     or v_home #>> '{organization,name}' not like 'Cascade Electronics Recovery - Tacoma Yard%' then
    raise exception 'M1: the clerk does not read the table''s organization by name from the table: %', v_home;
  end if;
  if (v_home ->> 'may_move')::boolean or coalesce(v_home ->> 'why_not', '') not like 'Only the person who made Scale tickets or an owner or admin of %' then
    raise exception 'M2: the clerk (member, not maker) may move it, or is not told who can: %', v_home;
  end if;
  begin
    perform custom.table_move(v_t, v_far, null);
    raise exception 'M2: the clerk moved a table she did not make and does not manage';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'Only the person who made%' then raise exception 'M2: wrong sentence: %', v_msg; end if;
  end;

  -- ══ the owner's seat ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  if not (v_home ->> 'may_move')::boolean or jsonb_array_length(v_home -> 'held_by') <> 0 then
    raise exception 'M6-pre: the owner may not move a table nothing holds: %', v_home;
  end if;
  select d into v_d from jsonb_array_elements(v_home -> 'destinations') d where d ->> 'id' = v_pdx::text;
  if v_d is null or not (v_d ->> 'ok')::boolean then
    raise exception 'M6-pre: Portland is not offered as a destination: %', v_home -> 'destinations';
  end if;
  if (v_home #>> '{carries,records}')::int <> 2 or (v_home #>> '{carries,in_trash}')::int <> 1
     or (v_home #>> '{carries,fields}')::int < 3 then
    raise exception 'M6-pre: the consequence counts are wrong: %', v_home -> 'carries';
  end if;

  -- M3: a destination the owner is not a member of.
  begin
    perform custom.table_move(v_t, v_far, null);
    raise exception 'M3: the owner moved a table into an organization she does not belong to';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'You are not a member of that organization%' then raise exception 'M3: wrong sentence: %', v_msg; end if;
  end;

  -- M5: the app keeps the choice list.
  v_home := custom.table_home(v_kept);
  if coalesce(v_home -> 'held_by' ->> 0, '') not like 'The app keeps Material choices for %' then
    raise exception 'M5: a kept table is not held with the sentence: %', v_home -> 'held_by';
  end if;
  begin
    perform custom.table_move(v_kept, v_pdx, null);
    raise exception 'M5: a table the app keeps moved by itself';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- M6: the move.
  v_home := custom.table_home(v_t);
  v_moved := custom.table_move(v_t, v_pdx, (v_home #>> '{table,version}')::int);
  if not (v_moved ->> 'moved')::boolean or v_moved #>> '{to,id}' <> v_pdx::text then
    raise exception 'M6: the move did not say it landed: %', v_moved;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record where organization_id = v_tac
     and (id = v_t or table_id = v_t or data ->> 'entity_definition_id' = v_t::text);
  if v_n <> 0 then raise exception 'M6: % rows of the table stayed in Tacoma', v_n; end if;
  select count(*) into v_n from custom.record where organization_id = v_pdx and table_id = v_t;
  if v_n <> 3 then raise exception 'M6: Portland holds % of the 3 rows (2 live + 1 in the trash)', v_n; end if;
  select count(*) into v_n from custom.record where organization_id = v_pdx
     and table_id = custom.field_kernel_id() and data ->> 'entity_definition_id' = v_t::text;
  if v_n < 3 then raise exception 'M6: Portland holds % Fields of the table', v_n; end if;
  if (select data ->> 'parent_id' from custom.record where organization_id = v_pdx and id = v_t)
       is distinct from (select v::text from mv where k = 'home_pdx') then
    raise exception 'M6: the table was not re-homed under Portland''s own record';
  end if;
  if not exists (select 1 from custom.io_comment where organization_id = v_pdx and record_id = v_r1) then
    raise exception 'M6: the comment on T-40812 stayed behind';
  end if;
  if not exists (select 1 from history.row_versions where entity_type = 'custom.record' and row_id = v_t
                   and organization_id = v_pdx and operation_name = 'table_move') then
    raise exception 'M6: no history version says the table moved';
  end if;
  if exists (select 1 from history.row_versions where entity_type = 'custom.record' and row_id = v_r1
               and organization_id = v_tac) then
    raise exception 'M6: T-40812''s earlier history stayed in Tacoma, so it no longer answers where the row lives';
  end if;
  perform set_config('role', 'authenticated', true);
  if (custom.where_id_opens(v_t) ->> 'organization_id') <> v_pdx::text then
    raise exception 'M6: custom.where_id_opens still names the old organization';
  end if;
  select count(*) into v_n from custom.read_records(v_pdx, v_t, false, 50, 0);
  if v_n <> 2 then raise exception 'M6: the owner reads % live rows in Portland, expected 2', v_n; end if;

  -- M4: moving it back is offered; a same-named table where it goes is named.
  v_home := custom.table_home(v_t);
  if v_home #>> '{organization,id}' <> v_pdx::text then raise exception 'M6: table_home still names Tacoma'; end if;

  -- M7: the clerk (Tacoma only) is no longer given it.
  perform set_config('request.jwt.claims', c_clerk_j, true);
  if custom.table_home(v_t) is not null then
    raise exception 'M7: the Tacoma clerk still reaches the table after it moved to Portland';
  end if;

  -- M4: the clerk owns the far organization, which holds "Scale tickets"; admin makes one in
  -- Tacoma and the clerk is not its maker — so M4 is asked from the owner's seat on a second table.
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'sc1p move suite: M1 M2 M3 M5 M6 M7 GREEN';
end
$t$;

-- M4 in its own block: admin joins the far organization (the fixture's role), then asks.
do $m4$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_far uuid; v_t uuid; v_home jsonb; v_d jsonb;
begin
  select v into v_far from mv where k = 'far'; select v into v_t from mv where k = 't';
  perform set_config('role', 'postgres', true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_far, 'organization', v_far, c_admin, 'member', 'active');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  select d into v_d from jsonb_array_elements(v_home -> 'destinations') d where d ->> 'id' = v_far::text;
  if v_d is null or (v_d ->> 'ok')::boolean or coalesce(v_d ->> 'why', '') not like '% already has a table called Scale tickets%' then
    raise exception 'M4: a same-named table at the destination is not named: %', v_d;
  end if;
  begin
    perform custom.table_move(v_t, v_far, null);
    raise exception 'M4: the move went into an organization that already has a table by that name';
  exception when object_not_in_prerequisite_state then null;
  end;
  raise notice 'sc1p move suite: M4 GREEN — all seven GREEN';
end
$m4$;

rollback;
