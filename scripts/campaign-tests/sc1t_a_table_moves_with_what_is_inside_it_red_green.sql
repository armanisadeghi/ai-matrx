-- LANE SC-1-TAILS — A TABLE MOVES WITH THE TABLES INSIDE IT, KEEPS ITS LINKS WHERE THE WALL IS
-- OPEN, AND EVERY LIVE READER HEARS OF THE MOVE AT ONCE.
--
-- THE USE CASE. Cascade Electronics Recovery runs two yards as two organizations. The Tacoma Yard
-- keeps "Scale tickets" (every inbound load weighed at the scale house). A ticket that fails
-- inspection gets its own "Hand-sort log" table living INSIDE that ticket's row, and the log keeps
-- a "Sort bins" table inside one of ITS rows. Tacoma also keeps "Haulers" (the trucking companies),
-- which stays: Portland takes over weighing, not the hauler contracts. The operations lead,
-- admin@admin.com (owner of both yards), moves Scale tickets to the Portland Depot. Every name,
-- weight and ticket below is synthesized. Everything is rolled back.
--
-- WHAT MAKES IT FAIL (RED before sc1t_a_table_moves_with_the_tables_inside_it.sql, GREEN after):
--   C1  a table with tables inside its rows (two deep) is NOT held: table_home says so, and names
--       how many ride along (carries.tables_inside = 2)
--   C2  the move lands all three tables in Portland — each keeps its own container (the log is
--       still inside ticket T-40812, the bins still inside the log's row) — with their Fields and
--       rows, and one history version per table says 'table_move'
--   C3  the move is a change event: Portland's outbox holds `created` for the moved rows and
--       Tacoma's holds `deleted`, with the actor saying table_move
--   L1  a relation VALUE from a ticket to a hauler that stays is held while the wall is shut —
--       the Table does not allow links to other organizations — with the sentence
--   L2  the Table allows it but the organizations have not turned links on: Portland is offered
--       with the sentence naming which organization has not, and the move is refused
--   L3  with the wall open the move lands and the link holds its value: the edge is filed under
--       Portland (the organization of the row it starts at) and still names the hauler in Tacoma
--   K1  a COLUMN whose own target stays is still refused with the sentence, wall open or not
--   K2  records of a table that stays, living inside a moving row, are still refused

\set ON_ERROR_STOP on
\timing off
\set suite 'sc1t_a_table_moves_with_what_is_inside_it_red_green.sql'
\set requires 'function:custom.table_move'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

create temp table mv (k text primary key, v uuid) on commit drop;
grant select on mv to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid := gen_random_uuid();
  v_pdx uuid := gen_random_uuid();
  v_home_tac uuid; v_home_pdx uuid;
  v_t uuid; v_log uuid; v_bins uuid; v_haul uuid; v_r1 uuid; v_r2 uuid; v_l1 uuid; v_b1 uuid; v_h1 uuid;
  v_fld uuid;
  v_spec jsonb := jsonb_build_object(
    'type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650);
begin
  perform set_config('app.actor_system', 'campaign-test/sc1t-move', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_tac, 'Cascade Electronics Recovery - Tacoma Yard ' || substr(v_tac::text, 1, 6), 'cer-tacoma-' || substr(v_tac::text, 1, 8), 'CET', c_admin),
    (v_pdx, 'Cascade Electronics Recovery - Portland Depot ' || substr(v_pdx::text, 1, 6), 'cer-portland-' || substr(v_pdx::text, 1, 8), 'CEP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_tac, 'organization', v_tac, c_admin, 'owner', 'active'),
    (v_pdx, 'organization', v_pdx, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_tac, v_tac, 'true'::jsonb, 'sc1t move suite'),
    ('custom', 'system_enabled', 'organization', v_pdx, v_pdx, 'true'::jsonb, 'sc1t move suite');

  insert into custom.record (organization_id, table_id, data) values
    (v_tac, custom.organization_kernel_id(), jsonb_build_object('name', 'Cascade Electronics Recovery - Tacoma Yard'))
    returning id into v_home_tac;
  insert into custom.record (organization_id, table_id, data) values
    (v_pdx, custom.organization_kernel_id(), jsonb_build_object('name', 'Cascade Electronics Recovery - Portland Depot'))
    returning id into v_home_pdx;

  -- Haulers: stays in Tacoma.
  v_haul := custom.table_declare(v_tac, v_spec || jsonb_build_object(
    'name', 'Haulers', 'slug', 'haulers', 'label_singular', 'Hauler', 'label_plural', 'Haulers',
    'title_field', 'company', 'parent_id', v_home_tac::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'company', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'company'))));
  v_h1 := custom.record_write(v_tac, v_haul, jsonb_build_object('company', 'Puget Sound Salvage'));

  -- Scale tickets: moves.
  v_t := custom.table_declare(v_tac, v_spec || jsonb_build_object(
    'name', 'Scale tickets', 'slug', 'scale_tickets', 'label_singular', 'Scale ticket', 'label_plural', 'Scale tickets',
    'title_field', 'ticket', 'parent_id', v_home_tac::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'ticket', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'ticket'), jsonb_build_object('name', 'hauler', 'kind', 'relation'))));
  perform custom.field_declare(v_tac, v_t, jsonb_build_object('key', 'net_lbs', 'label', 'Net weight (lb)', 'type', 'number', 'sort', 30));
  -- The hauler column: the store's one shape for a column whose values may name rows of another
  -- table (target_mode any — REL-8 — with its declared target its own table, which is what the
  -- wall lets a column name; see guardswitch_green.sql part 2).
  update custom.record f
     set data = f.data || jsonb_build_object(
       'type', 'relation', 'multi', false, 'label', 'Hauler',
       'config', jsonb_build_object('target_mode', 'any'),
       'relation_target', v_t::text, 'relation_max', 1, 'on_target_delete', 'set_null')
   where f.organization_id = v_tac and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_t::text
     and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = 'hauler'
  returning f.id into v_fld;
  if v_fld is null then raise exception 'fixture: no hauler Field row'; end if;

  v_r1 := custom.record_write(v_tac, v_t, jsonb_build_object('ticket', 'T-40812', 'net_lbs', 18420));
  v_r2 := custom.record_write(v_tac, v_t, jsonb_build_object('ticket', 'T-40813', 'net_lbs', 7260));

  -- Hand-sort log for T-40812, living inside that ticket's row.
  v_log := custom.table_declare(v_tac, v_spec || jsonb_build_object(
    'name', 'Hand-sort log T-40812', 'slug', 'hand_sort_log_t40812', 'label_singular', 'Sort entry', 'label_plural', 'Sort entries',
    'title_field', 'item', 'parent_id', v_r1::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'item'))));
  v_l1 := custom.record_write(v_tac, v_log, jsonb_build_object('item', 'Two CRT monitors pulled for leaded-glass stream'));

  -- Sort bins, inside the log's first row: two deep.
  v_bins := custom.table_declare(v_tac, v_spec || jsonb_build_object(
    'name', 'Sort bins T-40812', 'slug', 'sort_bins_t40812', 'label_singular', 'Bin', 'label_plural', 'Bins',
    'title_field', 'bin', 'parent_id', v_l1::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'bin', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'bin'))));
  v_b1 := custom.record_write(v_tac, v_bins, jsonb_build_object('bin', 'Gaylord 7 - leaded glass'));

  insert into mv values ('tac', v_tac), ('pdx', v_pdx), ('home_pdx', v_home_pdx), ('t', v_t), ('log', v_log),
                        ('bins', v_bins), ('haul', v_haul), ('r1', v_r1), ('r2', v_r2), ('l1', v_l1),
                        ('b1', v_b1), ('h1', v_h1), ('fld', v_fld);
end
$fixture$;

-- ══ C1 · the tables inside its rows ride along ══════════════════════════════════════════════
do $c1$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_t uuid; v_pdx uuid; v_home jsonb; v_d jsonb;
begin
  select v into v_t from mv where k = 't'; select v into v_pdx from mv where k = 'pdx';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  if exists (select 1 from jsonb_array_elements_text(v_home -> 'held_by') h where h like '%lives inside one of its rows%') then
    raise exception 'C1 RED: a table with tables inside its rows is held — "%"', v_home -> 'held_by';
  end if;
  if jsonb_array_length(v_home -> 'held_by') <> 0 then
    raise exception 'C1: something else holds Scale tickets: %', v_home -> 'held_by';
  end if;
  if coalesce((v_home #>> '{carries,tables_inside}')::int, -1) <> 2 then
    raise exception 'C1: the confirm does not say two tables ride along: %', v_home -> 'carries';
  end if;
  select d into v_d from jsonb_array_elements(v_home -> 'destinations') d where d ->> 'id' = v_pdx::text;
  if v_d is null or not (v_d ->> 'ok')::boolean then
    raise exception 'C1: Portland is not offered: %', v_d;
  end if;
  raise notice 'sc1t: C1 GREEN — nothing holds it; 2 tables ride along';
end
$c1$;

-- ══ K2 · rows of a table that STAYS, inside a moving row, still hold it (asked before the move) ══
do $k2$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid; v_t uuid; v_haul uuid; v_r2 uuid; v_h2 uuid; v_home jsonb;
begin
  select v into v_tac from mv where k = 'tac'; select v into v_t from mv where k = 't';
  select v into v_haul from mv where k = 'haul'; select v into v_r2 from mv where k = 'r2';
  perform set_config('role', 'postgres', true);
  -- a hauler record filed inside ticket T-40813 (a driver's own contact card, say)
  insert into custom.record (organization_id, table_id, data)
  values (v_tac, v_haul, jsonb_build_object('company', 'Rainier Scrap & Metal', 'parent_id', v_r2::text))
  returning id into v_h2;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  if not exists (select 1 from jsonb_array_elements_text(v_home -> 'held_by') h where h like 'Records of other tables live inside its rows%') then
    raise exception 'K2: a hauler living inside a moving ticket does not hold the move: %', v_home -> 'held_by';
  end if;
  perform set_config('role', 'postgres', true);
  update custom.record set data = data - 'parent_id' where organization_id = v_tac and id = v_h2;
  raise notice 'sc1t: K2 GREEN — rows of a table that stays still hold it';
end
$k2$;

-- ══ K1 · a column whose own target stays is refused, wall open or not ═══════════════════════
do $k1$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid; v_t uuid; v_haul uuid; v_fld uuid; v_home jsonb;
begin
  select v into v_tac from mv where k = 'tac'; select v into v_t from mv where k = 't';
  select v into v_haul from mv where k = 'haul'; select v into v_fld from mv where k = 'fld';
  perform set_config('role', 'postgres', true);
  update custom.record set data = jsonb_set(data, '{relation_target}', to_jsonb(v_haul::text))
   where organization_id = v_tac and id = v_fld;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  if not exists (select 1 from jsonb_array_elements_text(v_home -> 'held_by') h
                  where h like '%Hauler column links to Haulers, which stays in %') then
    raise exception 'K1: a column whose own target stays is not held with the sentence: %', v_home -> 'held_by';
  end if;
  perform set_config('role', 'postgres', true);
  update custom.record set data = jsonb_set(data, '{relation_target}', to_jsonb(v_t::text))
   where organization_id = v_tac and id = v_fld;
  raise notice 'sc1t: K1 GREEN — a column never points across the wall';
end
$k1$;

-- ══ L1 / L2 · a link to a row that stays, with the wall shut ═════════════════════════════════
do $l12$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid; v_pdx uuid; v_t uuid; v_r1 uuid; v_h1 uuid; v_home jsonb; v_d jsonb; v_msg text;
begin
  select v into v_tac from mv where k = 'tac'; select v into v_pdx from mv where k = 'pdx';
  select v into v_t from mv where k = 't'; select v into v_r1 from mv where k = 'r1';
  select v into v_h1 from mv where k = 'h1';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- T-40812 was hauled by Puget Sound Salvage (through the person's door).
  perform platform.relation_set(v_tac, v_r1, 'hauler', jsonb_build_array(v_h1::text));

  v_home := custom.table_home(v_t);
  if not exists (select 1 from jsonb_array_elements_text(v_home -> 'held_by') h
                  where h like 'Some of its rows are linked to rows that stay in %Scale tickets does not allow links to other organizations%') then
    raise exception 'L1: a link to a row that stays is not held while the table does not allow it: %', v_home -> 'held_by';
  end if;
  if (v_home #>> '{carries,links_across}')::int <> 1 then
    raise exception 'L1: the confirm does not count the one link that will reach back: %', v_home -> 'carries';
  end if;
  begin
    perform custom.table_move(v_t, v_pdx, null);
    raise exception 'L1: the move went through with the table not allowing links to other organizations';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- L2: the table allows it (its settings, through the door); the organizations have not.
  perform custom.record_update(v_tac, v_t, jsonb_build_object('cross_organization_relations', true));
  v_home := custom.table_home(v_t);
  if jsonb_array_length(v_home -> 'held_by') <> 0 then
    raise exception 'L2: still held once the table allows links: %', v_home -> 'held_by';
  end if;
  select d into v_d from jsonb_array_elements(v_home -> 'destinations') d where d ->> 'id' = v_pdx::text;
  if v_d is null or (v_d ->> 'ok')::boolean
     or coalesce(v_d ->> 'why', '') not like 'Some of its rows are linked to rows that stay in %neither % nor % does%' then
    raise exception 'L2: Portland is offered without naming the shut wall: %', v_d;
  end if;
  begin
    perform custom.table_move(v_t, v_pdx, null);
    raise exception 'L2: the move went through with neither organization allowing links';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'Some of its rows are linked%' then raise exception 'L2: wrong sentence: %', v_msg; end if;
  end;
  raise notice 'sc1t: L1 L2 GREEN — a link across a shut wall holds the move, with the sentence';
end
$l12$;

-- The link above was one transaction for the person (platform.relation_set); the move is another.
-- The deferred halves guard judges what is pending NOW, as that commit would, and is deferred again.
set constraints all immediate;
set constraints all deferred;

-- ══ C2 / C3 / L3 · the wall opens, and the move lands ═══════════════════════════════════════
do $move$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_tac uuid; v_pdx uuid; v_t uuid; v_log uuid; v_bins uuid; v_r1 uuid; v_l1 uuid; v_b1 uuid; v_h1 uuid; v_fld uuid;
  v_home jsonb; v_moved jsonb; v_n bigint;
begin
  select v into v_tac from mv where k = 'tac'; select v into v_pdx from mv where k = 'pdx';
  select v into v_t from mv where k = 't'; select v into v_log from mv where k = 'log';
  select v into v_bins from mv where k = 'bins'; select v into v_r1 from mv where k = 'r1';
  select v into v_l1 from mv where k = 'l1'; select v into v_b1 from mv where k = 'b1';
  select v into v_h1 from mv where k = 'h1'; select v into v_fld from mv where k = 'fld';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform platform.knob_override_set('custom', 'cross_organization_links', 'organization', v_tac, v_tac, 'true'::jsonb, 'sc1t L3');
  perform platform.knob_override_set('custom', 'cross_organization_links', 'organization', v_pdx, v_pdx, 'true'::jsonb, 'sc1t L3');

  v_home := custom.table_home(v_t);
  v_moved := custom.table_move(v_t, v_pdx, (v_home #>> '{table,version}')::int);
  if not (v_moved ->> 'moved')::boolean then raise exception 'C2: the move did not say it landed: %', v_moved; end if;

  perform set_config('role', 'postgres', true);
  -- C2: all three tables, their rows and Fields, in Portland; nothing left in Tacoma.
  select count(*) into v_n from custom.record where organization_id = v_pdx and id in (v_t, v_log, v_bins);
  if v_n <> 3 then raise exception 'C2: Portland holds % of the 3 tables', v_n; end if;
  select count(*) into v_n from custom.record where organization_id = v_tac
     and (id in (v_t, v_log, v_bins) or table_id in (v_t, v_log, v_bins)
          or data ->> 'entity_definition_id' in (v_t::text, v_log::text, v_bins::text));
  if v_n <> 0 then raise exception 'C2: % rows of the three tables stayed in Tacoma', v_n; end if;
  if (select data ->> 'parent_id' from custom.record where organization_id = v_pdx and id = v_log) <> v_r1::text
     or (select data ->> 'parent_id' from custom.record where organization_id = v_pdx and id = v_bins) <> v_l1::text then
    raise exception 'C2: a table inside a row lost its container on the way';
  end if;
  if not exists (select 1 from custom.record where organization_id = v_pdx and id = v_b1 and table_id = v_bins) then
    raise exception 'C2: the bin row did not come';
  end if;
  select count(*) into v_n from history.row_versions
   where entity_type = 'custom.record' and organization_id = v_pdx and operation_name = 'table_move'
     and row_id in (v_t, v_log, v_bins);
  if v_n <> 3 then raise exception 'C2: % history versions say table_move, expected one per table (3)', v_n; end if;

  -- C3: the change events.
  if not exists (select 1 from custom.io_outbox where organization_id = v_pdx and record_id = v_r1
                   and operation = 'created' and actor ->> 'declared' = 'table_move') then
    raise exception 'C3 RED: Portland''s outbox has no created event for the moved ticket';
  end if;
  if not exists (select 1 from custom.io_outbox where organization_id = v_tac and record_id = v_r1
                   and operation = 'deleted' and actor ->> 'declared' = 'table_move') then
    raise exception 'C3 RED: Tacoma''s outbox has no deleted event for the ticket that left';
  end if;
  if not exists (select 1 from custom.io_outbox where organization_id = v_pdx and record_id = v_b1 and operation = 'created') then
    raise exception 'C3: the bin row inside the log inside the ticket raised no event';
  end if;

  -- L3: the link holds its value across the wall, filed under the row it starts at.
  if not exists (select 1 from platform.associations a
                  where a.source_id = v_r1 and a.target_id = v_h1 and a.deleted_at is null
                    and a.relation_field_id = v_fld and a.organization_id = v_pdx) then
    raise exception 'L3: the hauler link is not filed under Portland with its value';
  end if;
  if (select organization_id from custom.record where id = v_h1) <> v_tac then
    raise exception 'L3: the hauler moved, and it should have stayed';
  end if;
  if (select data -> 'hauler' from custom.record where organization_id = v_pdx and id = v_r1)::text not like '%' || v_h1::text || '%' then
    raise exception 'L3: the ticket''s value no longer names the hauler: %',
      (select data -> 'hauler' from custom.record where organization_id = v_pdx and id = v_r1);
  end if;
  raise notice 'sc1t: C2 C3 L3 GREEN — three tables moved in order, events written, the link holds (carried %)', v_moved -> 'carried';
end
$move$;

-- the deferred halves guard (the value and its edge are one fact) is judged here.
set constraints all immediate;

rollback;
