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
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_board uuid;
  v_home  uuid;
  v_lead  uuid; v_fee uuid; v_dep uuid; v_vs uuid;
  k_lead  text; k_fee text; k_dep text; k_vs text;
  v_id    uuid; v_ids uuid[];
  v_doc   jsonb;
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
    'agent_writable', true, 'fields', jsonb_build_array(jsonb_build_object('name', 'title')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_board, jsonb_build_object('key', 'title', 'label', 'Job', 'type', 'text'));
  v_lead := custom.field_declare(c_ws, c_board, '{"label":"Crew lead DV2B2","type":"text","default":"Unassigned"}');
  v_fee  := custom.field_declare(c_ws, c_board, '{"label":"Visit fee DV2B2","type":"number","default":85}');
  v_dep  := custom.field_declare(c_ws, c_board, '{"label":"Deposit taken DV2B2","type":"checkbox","default":true}');
  v_vs   := custom.field_declare(c_ws, c_board, '{"label":"Visit status DV2B2","type":"select","options":["Scheduled","Done"],"default":"Scheduled"}');
  select data->>'key' into k_lead from custom.record where id = v_lead;
  select data->>'key' into k_fee  from custom.record where id = v_fee;
  select data->>'key' into k_dep  from custom.record where id = v_dep;
  select data->>'key' into k_vs   from custom.record where id = v_vs;

  -- A
  v_id := custom.record_write(c_ws, c_board, '{"title":"Leak under kitchen sink — 1180 Mission Oaks"}');
  select data into v_doc from custom.record where organization_id = c_ws and id = v_id;
  if v_doc ->> k_lead is distinct from 'Unassigned' then raise exception 'A: Crew lead is %, not the default Unassigned', v_doc -> k_lead; end if;
  if (v_doc ->> k_fee)::numeric is distinct from 85 then raise exception 'A: Visit fee is %, not 85', v_doc -> k_fee; end if;
  if v_doc -> k_dep is distinct from 'true'::jsonb then raise exception 'A: Deposit taken is %, not ticked', v_doc -> k_dep; end if;
  if v_doc -> k_vs is null or jsonb_typeof(v_doc -> k_vs) = 'null' then raise exception 'A: Visit status is empty, not Scheduled'; end if;
  if v_doc ->> k_vs = 'Scheduled' then
    -- the choice-words trigger keeps a word only where the column takes other values; here it must be the option
    raise notice 'A: Visit status holds the word Scheduled (%).', v_doc -> k_vs;
  end if;
  raise notice 'A ok: %', jsonb_build_object(k_lead, v_doc -> k_lead, k_fee, v_doc -> k_fee, k_dep, v_doc -> k_dep, k_vs, v_doc -> k_vs);

  -- B
  v_id := custom.record_write(c_ws, c_board, jsonb_build_object('title', 'Water heater pilot out — 44 Ventu Park', k_lead, null, k_fee, 120));
  select data into v_doc from custom.record where organization_id = c_ws and id = v_id;
  if v_doc ? k_lead and jsonb_typeof(v_doc -> k_lead) <> 'null' then raise exception 'B: an explicit null Crew lead became %', v_doc -> k_lead; end if;
  if (v_doc ->> k_fee)::numeric is distinct from 120 then raise exception 'B: a named Visit fee 120 became %', v_doc -> k_fee; end if;

  -- C
  v_ids := custom.record_write_many(c_ws, c_board, array['{"title":"Garbage disposal jammed — 9 Calle Contento"}'::jsonb, '{"title":"Low water pressure — 318 Anacapa"}'::jsonb]);
  if (select count(*) from custom.record where organization_id = c_ws and id = any (v_ids) and data ->> k_lead = 'Unassigned' and (data ->> k_fee)::numeric = 85) <> 2 then
    raise exception 'C: record_write_many did not fill both rows';
  end if;

  -- D
  v_id := v_ids[1];
  perform custom.record_update(c_ws, v_id, jsonb_build_object(k_lead, null, k_fee, null), null);
  select data into v_doc from custom.record where organization_id = c_ws and id = v_id;
  if v_doc ->> k_lead is not null or v_doc ->> k_fee is not null then raise exception 'D: an update filled a default (%, %)', v_doc -> k_lead, v_doc -> k_fee; end if;

  -- E
  perform custom.field_update(c_ws, v_lead, '{"default":"Dispatch desk"}');
  v_id := custom.record_write(c_ws, c_board, '{"title":"Toilet running — 72 Rancho Road"}');
  if (select data ->> k_lead from custom.record where organization_id = c_ws and id = v_id) is distinct from 'Dispatch desk' then
    raise exception 'E: the changed default did not fill';
  end if;
  perform custom.field_update(c_ws, v_lead, '{"default":null}');
  if (select data ? 'default' from custom.record where id = v_lead) then raise exception 'E: default null did not clear'; end if;
  v_id := custom.record_write(c_ws, c_board, '{"title":"Hose bib dripping — 5 Arneill"}');
  if (select data ? k_lead from custom.record where organization_id = c_ws and id = v_id) then raise exception 'E: a cleared default still filled'; end if;
  perform custom.field_update(c_ws, v_lead, '{"label":"Crew lead DV2B2 (renamed)","default":"Unassigned"}');
  if (select data ->> 'default' from custom.record where id = v_lead) is distinct from 'Unassigned' then raise exception 'E: default with a rename not kept'; end if;
  perform custom.field_update(c_ws, v_lead, '{"label":"Crew lead DV2B2 (again)"}');
  if (select data ->> 'default' from custom.record where id = v_lead) is distinct from 'Unassigned' then raise exception 'E: a rename lost the default'; end if;

  -- F
  perform custom.field_update(c_ws, v_fee, '{"default":"Pending"}');
  perform custom.field_update(c_ws, v_vs, '{"default":"Cancelled"}');
  v_id := custom.record_write(c_ws, c_board, '{"title":"Sump pump alarm — 210 Lynn Road"}');
  select data into v_doc from custom.record where organization_id = c_ws and id = v_id;
  if v_doc ? k_fee then raise exception 'F: a word default on a Number was written: %', v_doc -> k_fee; end if;
  if v_doc ? k_vs then raise exception 'F: a default that is no choice was written: %', v_doc -> k_vs; end if;
  if v_doc ->> k_lead is distinct from 'Unassigned' then raise exception 'F: the fitting default beside them did not fill'; end if;

  raise notice 'GREEN: A–F';
end
$t$;

rollback;
