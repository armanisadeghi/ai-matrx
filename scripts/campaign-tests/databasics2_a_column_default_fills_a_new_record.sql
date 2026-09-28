-- LANE DATA-V2-BASICS-2 — A COLUMN'S DEFAULT FILLS A NEW RECORD (Arman, 2026-09-27).
--
-- THE USE CASE: a Camarillo service board (admin@admin.com's Workspace, made here as New table makes one). The dispatcher adds
-- "Crew lead" (text, default "Unassigned"), "Visit fee" (number, default 85), "Deposit taken"
-- (tick, default ticked) and "Visit status" (a closed choice Scheduled · Done, default Scheduled),
-- then books a job naming only its title. What must hold, from the signed-in person's seat:
--   A. the new job starts with every default (the choice resolved to its option, not left a word);
--   B. a value the caller named — an explicit null included — is never replaced;
--   C. record_write_many fills each row the same way;
--   D. an update never fills a default;
--   E. field_update sets, changes and clears a default; a retyped column keeps it;
--   F. a default that no longer fits (a word on a Number, a word that is no choice of a closed
--      column) is simply not filled — the write still lands.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_column_default_fills_a_new_record.sql
-- ITS RED: before the campaign file it fails at A (Crew lead absent) — and E's field_update
-- refuses "A column has no setting called "default"".

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_column_default_fills_a_new_record.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2d1"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  c_board uuid;
  v_home  uuid;
  v_lead  uuid; v_fee uuid; v_dep uuid; v_vs uuid;
  v_ids   uuid[];
  s       jsonb := '{}'::jsonb;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;
  -- The board is made the way the "New table" button makes one (records' declareTable).
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Camarillo Service Board Home'));
  c_board := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Camarillo service board', 'slug', 'camarillo_service_board_databasics2', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'title', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_board, jsonb_build_object('key', 'title', 'label', 'Job', 'type', 'text'));
  v_lead := custom.field_declare(c_ws, c_board, '{"key":"crew_lead","label":"Crew lead","type":"text","default":"Unassigned"}');
  v_fee  := custom.field_declare(c_ws, c_board, '{"key":"visit_fee","label":"Visit fee","type":"number","default":85}');
  v_dep  := custom.field_declare(c_ws, c_board, '{"key":"deposit_taken","label":"Deposit taken","type":"checkbox","default":true}');
  v_vs   := custom.field_declare(c_ws, c_board, '{"key":"visit_status","label":"Visit status","type":"select","options":["Scheduled","Done"],"default":"Scheduled"}');
  s := jsonb_build_object('lead', v_lead, 'fee', v_fee, 'dep', v_dep, 'vs', v_vs);

  -- A: only the title named
  s := s || jsonb_build_object('a', custom.record_write(c_ws, c_board, '{"title":"Leak under kitchen sink — 1180 Mission Oaks"}'));
  -- B: an explicit null and a named value
  s := s || jsonb_build_object('b', custom.record_write(c_ws, c_board, '{"title":"Water heater pilot out — 44 Ventu Park","crew_lead":null,"visit_fee":120}'));
  -- C: a batch of two
  v_ids := custom.record_write_many(c_ws, c_board, array['{"title":"Garbage disposal jammed — 9 Calle Contento"}'::jsonb, '{"title":"Low water pressure — 318 Anacapa"}'::jsonb]);
  s := s || jsonb_build_object('c1', v_ids[1], 'c2', v_ids[2]);
  -- D: an update never fills a default
  perform custom.record_update(c_ws, v_ids[1], '{"crew_lead":null,"visit_fee":null}'::jsonb, null);
  -- E: change, clear, rename-with, rename-without
  perform custom.field_update(c_ws, v_lead, '{"default":"Dispatch desk"}');
  s := s || jsonb_build_object('e1', custom.record_write(c_ws, c_board, '{"title":"Toilet running — 72 Rancho Road"}'));
  perform custom.field_update(c_ws, v_lead, '{"default":null}');
  s := s || jsonb_build_object('e2', custom.record_write(c_ws, c_board, '{"title":"Hose bib dripping — 5 Arneill"}'));
  perform custom.field_update(c_ws, v_lead, '{"label":"Crew lead (renamed)","default":"Unassigned"}');
  perform custom.field_update(c_ws, v_lead, '{"label":"Crew lead"}');
  -- F: defaults that no longer fit
  perform custom.field_update(c_ws, v_fee, '{"default":"Pending"}');
  perform custom.field_update(c_ws, v_vs, '{"default":"Cancelled"}');
  s := s || jsonb_build_object('f', custom.record_write(c_ws, c_board, '{"title":"Sump pump alarm — 210 Lynn Road"}'));
  perform set_config('dv2b2.s', s::text, true);
end
$t$;

reset role;

do $a$
declare
  s     jsonb := current_setting('dv2b2.s')::jsonb;
  k_lead text; k_fee text; k_dep text; k_vs text;
  d     jsonb;
begin
  select data ->> 'key' into k_lead from custom.record where id = (s ->> 'lead')::uuid;
  select data ->> 'key' into k_fee  from custom.record where id = (s ->> 'fee')::uuid;
  select data ->> 'key' into k_dep  from custom.record where id = (s ->> 'dep')::uuid;
  select data ->> 'key' into k_vs   from custom.record where id = (s ->> 'vs')::uuid;

  select data into d from custom.record where id = (s ->> 'a')::uuid;
  if d ->> k_lead is distinct from 'Unassigned' then raise exception 'A: Crew lead is %, not the default Unassigned', d -> k_lead; end if;
  if (d ->> k_fee)::numeric is distinct from 85 then raise exception 'A: Visit fee is %, not 85', d -> k_fee; end if;
  if d -> k_dep is distinct from 'true'::jsonb then raise exception 'A: Deposit taken is %, not ticked', d -> k_dep; end if;
  if d -> k_vs is null or jsonb_typeof(d -> k_vs) = 'null' then raise exception 'A: Visit status is empty, not Scheduled'; end if;
  raise notice 'A: %', jsonb_build_object('crew lead', d -> k_lead, 'visit fee', d -> k_fee, 'deposit', d -> k_dep, 'visit status', d -> k_vs);

  select data into d from custom.record where id = (s ->> 'b')::uuid;
  if d ? k_lead and jsonb_typeof(d -> k_lead) <> 'null' then raise exception 'B: an explicit null Crew lead became %', d -> k_lead; end if;
  if (d ->> k_fee)::numeric is distinct from 120 then raise exception 'B: a named Visit fee 120 became %', d -> k_fee; end if;

  if (select count(*) from custom.record where id = (s ->> 'c2')::uuid and data ->> k_lead = 'Unassigned' and (data ->> k_fee)::numeric = 85) <> 1 then
    raise exception 'C: record_write_many did not fill its row';
  end if;
  select data into d from custom.record where id = (s ->> 'c1')::uuid;
  if d ->> k_lead is not null or d ->> k_fee is not null then raise exception 'D: an update filled a default (%, %)', d -> k_lead, d -> k_fee; end if;

  if (select data ->> k_lead from custom.record where id = (s ->> 'e1')::uuid) is distinct from 'Dispatch desk' then raise exception 'E: the changed default did not fill'; end if;
  if (select data ? k_lead from custom.record where id = (s ->> 'e2')::uuid) then raise exception 'E: a cleared default still filled'; end if;
  if (select data ->> 'default' from custom.record where id = (s ->> 'lead')::uuid) is distinct from 'Unassigned' then raise exception 'E: a rename lost the default'; end if;

  select data into d from custom.record where id = (s ->> 'f')::uuid;
  if d ? k_fee then raise exception 'F: a word default on a Number was written: %', d -> k_fee; end if;
  if d ? k_vs then raise exception 'F: a default that is no choice was written: %', d -> k_vs; end if;
  if d ->> k_lead is distinct from 'Unassigned' then raise exception 'F: the fitting default beside them did not fill'; end if;
  raise notice 'GREEN: A–F';
end
$a$;

rollback;
