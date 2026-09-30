-- LANE DATA-V2-BASICS-2 — AN AGENT'S DIRECT WRITE CARRIES THE PERSON IT ACTS FOR.
--
-- THE USE CASE: an organization whose knob custom/agent_schema_changes says never_ask — the agent adds
-- a choice column ("Visit Status": Scheduled, Completed) and a board to a clinic's visit table itself,
-- no approval card. The server does it exactly as it does every agent write: signed in AS the person
-- (acting_as → request.jwt.claims.sub) with the connection declared as an agent (app.actor_tier = ai).
-- MEASURED: custom.field_declare and custom.pipeline_declare refused — "This write says an agent wrote
-- it, and does not say who the agent is acting for" — because the records those doors write for the
-- column (its choices, the board's rules) carry no `_on_behalf_of`, and the envelope took the agent
-- from the connection but never the person. The approved path works only because the approver writes
-- as themselves.
--   A. custom.field_declare of a choice column, as an agent acting for admin@admin.com, lands;
--   B. its choices' envelopes say actor agent, on behalf of that person;
--   C. custom.pipeline_declare on the same column lands;
--   D. a document that itself says "_actor": "agent" and names nobody is still refused.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_an_agent_acts_for_its_person.sql
-- ITS RED: before the campaign file it fails at A (the refusal above).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_an_agent_acts_for_its_person.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2g1"}', true);

do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_home uuid; c_tbl uuid; v_f uuid; v_opts uuid; refused text;
begin
  -- the table exists already (a person made it)
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Agent Visits Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Clinic visits (agent)', 'slug', 'clinic_visits_agent_databasics2', 'type', 'entity',
    'label_singular', 'Visit', 'label_plural', 'Visits', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, '{"key":"patient","label":"Patient","type":"text"}');
  -- from here the AGENT writes, for this person
  perform set_config('app.actor_tier', 'ai', true);
  v_f := custom.field_declare(c_ws, c_tbl, '{"key":"visit_status","label":"Visit Status","parity_type":"select","options":["Scheduled","Completed"]}');
  perform custom.pipeline_declare(c_ws, c_tbl, '{"stage_field":{"key":"visit_status"}}'::jsonb);
  -- D: a document that says agent and names nobody
  begin
    perform custom.record_write(c_ws, c_tbl, '{"patient":"Grace Kim","_actor":"agent"}');
    refused := null;
  exception when sqlstate '22004' then refused := sqlerrm;
  end;
  if refused is null then raise exception 'D: a document saying agent and naming nobody was written'; end if;
  perform set_config('dv2b2.g', jsonb_build_object('f', v_f, 'tbl', c_tbl)::text, true);
end
$t$;

reset role;

do $a$
declare s jsonb := current_setting('dv2b2.g')::jsonb; v_opts uuid; n integer; m integer;
begin
  select (data -> 'config' ->> 'options_table_id')::uuid into v_opts from custom.record where id = (s ->> 'f')::uuid;
  select count(*), count(*) filter (where x.data -> '_values' -> 'title' ->> 'on_behalf_of' = '87a6e699-3622-4869-8843-d0867456c0dd'
                                       or x.data -> '_values' -> 'name' ->> 'on_behalf_of' = '87a6e699-3622-4869-8843-d0867456c0dd')
    into n, m
    from custom.record x where x.table_id = v_opts and x.deleted_at is null;
  if n <> 2 then raise exception 'B: Visit Status has % choices', n; end if;
  if m <> n then raise exception 'B: only % of % choices name the person they were added for', m, n; end if;
  raise notice 'GREEN: A–D';
end
$a$;

rollback;
