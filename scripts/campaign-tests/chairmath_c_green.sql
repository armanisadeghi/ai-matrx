-- CHAIR-MATH (c) — AN OUTPUT KEEPS WHAT THE AGENT SAID ABOUT IT.
--
-- WHAT THIS PROVES. The chain door (custom.record_write_graph_superseding) lands the caller's
-- DESCRIPTIVE provenance keys — output_conversation, output_conversation_id, output_agent,
-- output_turn, output_leftover — on the parent and on a contained child, accepts an in-place edit
-- that carries output_leftover, and STILL overrules the caller on every STATE key (output_state,
-- output_chain, output_generation, …) and still refuses an edit that carries one.
--
-- RED before migrations/campaign/chairmath_c_an_output_keeps_what_the_agent_said_about_it.sql:
--   the provenance keys are stripped from the landed row and the edit is refused.
-- GREEN after it: they land; the edit lands; the state keys are the door's as before.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Lakeside Family Foot Care's visit
-- summarizer agent writes a visit summary as an output; the front desk needs to see which
-- conversation and which agent turn produced it.
--
-- Runs where custom.table_ensure exists (the clone; it waits for Arman's window on production).
-- Everything is rolled back: nothing persists on any database.
-- Run: node <scratch>/cpsql.mjs -f scripts/campaign-tests/chairmath_c_green.sql   (clone)
\set ON_ERROR_STOP on
\set suite 'chairmath_c_green.sql'
\set requires 'exec:custom.table_ensure|exec:custom.record_write_graph_superseding'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '180s';
set local lock_timeout = '10s';

create temp table cm_fx (k text primary key, v text) on commit drop;
create temp table cm_res (check_name text, ok boolean, detail text) on commit drop;
grant all on cm_fx, cm_res to authenticated, service_role;

-- ── the organization and its output table (made by the app, as custom.table_ensure makes it) ────
do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org   uuid;
  v_table uuid;
  v_notes uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Lakeside Family Foot Care', 'lakeside-foot-care-' || substr(md5(random()::text),1,8), 'LFF', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_tier', 'system', true);
  perform set_config('app.actor_system', 'kinds_glue_output_tables', true);
  -- The contained records' table (plan-of-care notes), with its own platform Fields.
  v_notes := (custom.table_ensure(v_org, jsonb_build_object(
    'name', 'Plan of care outputs', 'slug', 'agent_output_cm_plan_of_care',
    'type', 'entity', 'weight', 'light', 'display', 'list', 'ordered', false, 'row_order', 'manual', 'title_field', 'title',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'label_plural', 'Plan of care outputs', 'label_singular', 'Plan of care output', 'agent_writable', true, 'retention_days', 365,
    'kept_by_the_app', true, 'kept_for', 'agent_output', 'kind', 'plan_of_care',
    'fields', jsonb_build_array(
      jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text'),
      jsonb_build_object('key', 'output_state', 'label', 'Output state', 'type', 'select', 'options', jsonb_build_array('draft', 'superseded'), 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_chain', 'label', 'Chain', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_generation', 'label', 'Generation', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_reason', 'label', 'Reason', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_agent', 'label', 'Agent', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_turn', 'label', 'Turn', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output'))
    ))) ->> 'table_id')::uuid;
  v_table := (custom.table_ensure(v_org, jsonb_build_object(
    'name', 'Visit summary outputs', 'slug', 'agent_output_cm_visit_summary',
    'type', 'entity', 'weight', 'light', 'display', 'list', 'ordered', false, 'row_order', 'manual', 'title_field', 'title',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'label_plural', 'Visit summary outputs', 'label_singular', 'Visit summary output', 'agent_writable', true, 'retention_days', 365,
    'kept_by_the_app', true, 'kept_for', 'agent_output', 'kind', 'visit_summary',
    'fields', jsonb_build_array(
      jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text'),
      jsonb_build_object('key', 'summary', 'label', 'Summary', 'type', 'long_text'),
      jsonb_build_object('key', 'notes', 'label', 'Plan of care', 'type', 'relation', 'relation_target', v_notes, 'multi', true),
      jsonb_build_object('key', 'output_state', 'label', 'Output state', 'type', 'select', 'options', jsonb_build_array('draft', 'superseded'), 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_kept', 'label', 'Kept', 'type', 'checkbox', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_out_of_date', 'label', 'Out of date', 'type', 'checkbox', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_chain', 'label', 'Chain', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_generation', 'label', 'Generation', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_replaced_by', 'label', 'Replaced by', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_reason', 'label', 'Reason', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      -- the descriptive provenance the lander writes (aidream kind_records/land.py)
      jsonb_build_object('key', 'output_conversation', 'label', 'Conversation', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_conversation_id', 'label', 'Conversation id', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_agent', 'label', 'Agent', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_turn', 'label', 'Turn', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output')),
      jsonb_build_object('key', 'output_leftover', 'label', 'Leftover', 'type', 'long_text', 'config', jsonb_build_object('kept_by', 'agent_output'))
    ))) ->> 'table_id')::uuid;
  perform set_config('app.actor_tier', '', true);
  perform set_config('app.actor_system', '', true);
  insert into cm_fx values ('org', v_org::text), ('table', v_table::text), ('notes', v_notes::text), ('admin', c_admin::text);
end;
$t$;

-- ── the agent seat: admin's turn's agent, on the server channel ──────────────────────────────────
create function pg_temp.agent_seat() returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', (select v from cm_fx where k='admin'), 'role', 'authenticated')::text, true),
         set_config('request.headers', '', true),
         set_config('app.actor_tier', 'agent', true),
         set_config('app.actor_system', 'chat_kind_emission', true);
$f$;
grant execute on function pg_temp.agent_seat() to authenticated;
create function pg_temp.land(p_lock text, p_parent jsonb, p_children jsonb, p_chain jsonb) returns jsonb language sql as $f$
  select custom.record_write_graph_superseding((select v::uuid from cm_fx where k='org'), (select v::uuid from cm_fx where k='table'),
           p_lock, null, p_parent, '[]'::jsonb, coalesce(p_children, '[]'::jsonb), p_chain, null);
$f$;
grant execute on function pg_temp.land(text, jsonb, jsonb, jsonb) to authenticated;
create function pg_temp.row_of(p_id text) returns jsonb language sql as $f$
  select r.data - '_values' from custom.record r where r.organization_id = (select v::uuid from cm_fx where k='org') and r.id = nullif(p_id, '')::uuid;
$f$;

-- ── 1. A FIRST LANDING CARRIES ITS PROVENANCE; THE STATE KEYS ARE THE DOOR'S ─────────────────────
set local role authenticated;
select pg_temp.agent_seat() \g /dev/null
do $t$
declare r jsonb; d jsonb; c jsonb; m text;
begin
  r := pg_temp.land('cm-conv-1|visit_summary',
         jsonb_build_object('title', 'Delgado, Rosa — follow-up summary',
                            'summary', 'Diabetic foot check: sensation reduced at the first metatarsal head; nails debrided; return in 8 weeks.',
                            'output_conversation', 'Rosa Delgado — follow-up visit',
                            'output_conversation_id', '0f3d7a2e-5c1b-4e8a-9b6d-2a1c4e7f8b90',
                            'output_agent', 'Visit summarizer',
                            'output_turn', 3,
                            'output_leftover', '{"unplaced": ["next appointment"]}',
                            -- the caller's say on a STATE key, which the door must overrule:
                            'output_state', 'superseded', 'output_generation', 99),
         jsonb_build_array(jsonb_build_object('role', 'notes', 'table_id', (select v from cm_fx where k='notes'),
                                              'data', jsonb_build_object('title', 'Delgado, Rosa — plan of care: return in 8 weeks',
                                                                         'output_agent', 'Visit summarizer', 'output_turn', 3))),
         '{"mode": "first"}'::jsonb);
  insert into cm_fx values ('parent', r ->> 'parent_id'), ('child', r -> 'child_ids' ->> 0);
  reset role;
  d := pg_temp.row_of(r ->> 'parent_id');
  c := pg_temp.row_of(r -> 'child_ids' ->> 0);
  insert into cm_res values
    ('1a parent: output_conversation lands',     d ->> 'output_conversation' = 'Rosa Delgado — follow-up visit', coalesce(d ->> 'output_conversation', '(absent)')),
    ('1b parent: output_conversation_id lands',  d ->> 'output_conversation_id' = '0f3d7a2e-5c1b-4e8a-9b6d-2a1c4e7f8b90', coalesce(d ->> 'output_conversation_id', '(absent)')),
    ('1c parent: output_agent lands',            d ->> 'output_agent' = 'Visit summarizer', coalesce(d ->> 'output_agent', '(absent)')),
    ('1d parent: output_turn lands',             d ->> 'output_turn' = '3', coalesce(d ->> 'output_turn', '(absent)')),
    ('1e parent: output_leftover lands',         d ->> 'output_leftover' = '{"unplaced": ["next appointment"]}', coalesce(d ->> 'output_leftover', '(absent)')),
    ('1f parent: output_state is the door''s (draft, not the caller''s superseded)', d ->> 'output_state' = 'draft', coalesce(d ->> 'output_state', '(absent)')),
    ('1g parent: output_generation is the door''s (1, not the caller''s 99)',       d ->> 'output_generation' = '1', coalesce(d ->> 'output_generation', '(absent)')),
    ('1h child: output_agent lands on the contained record', c ->> 'output_agent' = 'Visit summarizer', coalesce(c ->> 'output_agent', '(absent)')),
    ('1i child: output_state is the door''s',    c ->> 'output_state' = 'draft', coalesce(c ->> 'output_state', '(absent)'));
exception when others then
  get stacked diagnostics m = message_text;
  reset role;
  insert into cm_res values ('1 first landing raised', false, m);
end;
$t$;

-- ── 2. AN EDIT THAT CARRIES output_leftover IS ACCEPTED; ONE THAT CARRIES output_state IS NOT ──
set local role authenticated;
select pg_temp.agent_seat() \g /dev/null
do $t$
declare r jsonb; d jsonb; m text;
begin
  begin
    r := pg_temp.land('cm-conv-1|visit_summary',
           jsonb_build_object('_record_id', (select v from cm_fx where k='parent'),
                              'summary', 'Diabetic foot check: sensation reduced at the first metatarsal head; nails debrided; return in 6 weeks.',
                              'output_leftover', '{"unplaced": []}'),
           '[]'::jsonb, '{"mode": "edit"}'::jsonb);
    reset role;
    d := pg_temp.row_of((select v from cm_fx where k='parent'));
    insert into cm_res values
      ('2a edit carrying output_leftover is accepted and lands', d ->> 'output_leftover' = '{"unplaced": []}', coalesce(d ->> 'output_leftover', '(absent)')),
      ('2b edit changed the summary',                           d ->> 'summary' like '%6 weeks.', coalesce(right(d ->> 'summary', 20), '(absent)'));
  exception when others then
    get stacked diagnostics m = message_text;
    reset role;
    insert into cm_res values ('2a edit carrying output_leftover is accepted and lands', false, m);
  end;
  set local role authenticated;
  perform pg_temp.agent_seat();
  begin
    r := pg_temp.land('cm-conv-1|visit_summary',
           jsonb_build_object('_record_id', (select v from cm_fx where k='parent'), 'summary', 'x', 'output_state', 'superseded'),
           '[]'::jsonb, '{"mode": "edit"}'::jsonb);
    reset role;
    insert into cm_res values ('2c edit carrying output_state is still refused', false, 'accepted');
  exception when others then
    get stacked diagnostics m = message_text;
    reset role;
    insert into cm_res values ('2c edit carrying output_state is still refused', m like 'A revision changes an output''s values%', m);
  end;
end;
$t$;
reset role;

select check_name, case when ok then 'ok' else 'FAIL' end as result, left(detail, 100) as detail from cm_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cm_res where not ok);
begin
  if v_bad > 0 then
    raise exception 'chairmath_c_green: % check(s) FAILED (RED) — the chain door strips descriptive provenance', v_bad;
  end if;
  raise notice 'chairmath_c_green: all % checks passed (GREEN)', (select count(*) from cm_res);
end;
$t$;

rollback;
