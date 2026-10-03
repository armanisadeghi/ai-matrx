-- LANE 5 VISION-REACH, WAVE 4 (b) — AN APPROVED AGENT CHANGE IS THE AGENT'S, AND HISTORY NAMES WHO SAID YES.
-- Guard for migrations/campaign/visionreach_w4_b_an_approved_agent_change_is_the_agents.sql
--
-- The break it names: custom.work_approval_decide applying an agent's request as the approving person's
-- own edit — the values stamped `user`, History saying the person typed it, nobody named as approver.
--
-- Cedar Ridge Physical Therapy, its Treatment Rooms table. test@test.com is given editor on it (rolled
-- back); her agent asks; admin@admin.com (owner) approves. Two people, so "for whom" and "approved by"
-- cannot be the same answer by accident, and a person's own request is the control that must NOT change.
--   B1  agent record_add approved: every value of the new room says actor agent, on behalf of test
--   B2  record_history of that room: kind agent, on_behalf_of test, approved_by admin
--   B3  agent record_patch approved: the patched value says agent / test; record_history names admin as approver
--   B4  agent field_add approved: the column's history says kind agent, approved_by admin
--   B5  CONTROL — test's OWN request (origin person) approved by admin: the value says user, History kind user,
--       no approved_by (a person's request is never marked)
--   B6  the approval row itself is not marked (its newest version is the decider's, no approved_by)
--   B7  the column's timeline (custom.field_history) names agent, for test, approved by admin on the approved patch
-- THE VERDICT IS THE EXIT CODE. Everything is rolled back.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_w4_approved_agent_change_is_credited.sql
\set ON_ERROR_STOP on
\set suite 'visionreach_w4_approved_agent_change_is_credited.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '180s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
create temp table ids (k text primary key, val text) on commit drop;
grant all on res, ids to authenticated, service_role;

select set_config('t.admin', '87a6e699-3622-4869-8843-d0867456c0dd', true),   -- admin@admin.com (owner, approves)
       set_config('t.test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true),   -- test@test.com (her agent asks)
       set_config('t.cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),   -- Cedar Ridge Physical Therapy
       set_config('t.rooms', '89919d7d-cbbc-4600-8ea7-3f63db964631', true)    -- Treatment Rooms
\g /dev/null
insert into ids values ('row1', (select id::text from custom.record where organization_id = current_setting('t.cedar')::uuid
                                   and table_id = current_setting('t.rooms')::uuid and deleted_at is null order by created_at limit 1));

-- admin shares Treatment Rooms with test at editor (her own browser)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true),
       set_config('app.actor_tier', '', true), set_config('app.conversation_id', '', true) \g /dev/null
select custom.share_grant(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid, 'person',
                          current_setting('t.test')::uuid, 'editor'::public.permission_level) \g /dev/null

-- ── test's AGENT asks three times (the server seat, agent declared, acting as test) ─────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '', true),
       set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'records', true) \g /dev/null
insert into ids select 'ask_add', custom.work_approval_request(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
  '{"kind":"record_add","rows":[{"title":"Vestibular Rehab Room","patient_capacity":2,"pool_lift":false}]}'::jsonb,
  'Add the vestibular room', null, 'agent', null) ->> 'approval_id';
insert into ids select 'ask_patch', custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
  '{"kind":"record_patch","patch":{"patient_capacity":7}}'::jsonb, 'Capacity is 7 after the remodel', null, 'agent', null) ->> 'approval_id';
insert into ids select 'ask_field', custom.work_approval_request(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
  '{"kind":"field_add","field":{"key":"cleaning_window","label":"Cleaning window","type":"text"}}'::jsonb,
  'Track when each room is cleaned', null, 'agent', null) ->> 'approval_id';

-- ── test HERSELF asks once (her own browser, no agent) — the control ──────────────────────────────────
select set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true) \g /dev/null
insert into ids select 'ask_own', custom.work_approval_request(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
  '{"kind":"record_add","rows":[{"title":"Pediatric Gym","patient_capacity":3,"pool_lift":false}]}'::jsonb,
  'Add the pediatric gym', null, 'person', null) ->> 'approval_id';

-- ── admin approves all four (her own browser) ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true) \g /dev/null
insert into ids select 'added', (custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_add')::uuid, true, null) -> 'record_ids' ->> 0);
select custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_patch')::uuid, true, null) \g /dev/null
insert into ids select 'field', (custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_field')::uuid, true, null) ->> 'field_id');
insert into ids select 'own', (custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_own')::uuid, true, null) -> 'record_ids' ->> 0);

-- ── read it back, through the History door, as admin ────────────────────────────────────────────────────
do $$
declare
  c uuid := current_setting('t.cedar')::uuid;
  a text := current_setting('t.admin'); t text := current_setting('t.test');
  v_doc jsonb; h jsonb; m text;
begin
  -- B1: the values written for the agent's request
  reset role;
  select r.data -> '_values' into v_doc from custom.record r where r.id = (select val from ids where k = 'added')::uuid;
  set local role authenticated;
  insert into res values ('B1 approved agent record_add: values say agent, for test',
    v_doc is not null and not exists (select 1 from jsonb_each(v_doc) e
                                       where e.value ->> 'actor' is distinct from 'agent' or e.value ->> 'on_behalf_of' is distinct from t),
    coalesce(v_doc::text, 'NULL'));
  -- B2: History of that room
  select r.actor into h from custom.record_history(c, (select val from ids where k = 'added')::uuid) r order by r.version desc limit 1;
  insert into res values ('B2 History of the added room: agent, for test, approved by admin',
    h ->> 'kind' = 'agent' and h #>> '{on_behalf_of,user_id}' = t and h #>> '{approved_by,user_id}' = a, coalesce(h::text, 'NULL'));
  -- B3: the patched room
  reset role;
  select r.data -> '_values' -> 'patient_capacity' into v_doc from custom.record r where r.id = (select val from ids where k = 'row1')::uuid;
  set local role authenticated;
  select r.actor into h from custom.record_history(c, (select val from ids where k = 'row1')::uuid) r order by r.version desc limit 1;
  insert into res values ('B3 approved agent record_patch: value + History credit the agent, approver admin',
    v_doc ->> 'actor' = 'agent' and v_doc ->> 'on_behalf_of' = t
      and h ->> 'kind' = 'agent' and h #>> '{approved_by,user_id}' = a,
    coalesce(v_doc::text, 'NULL') || ' / ' || coalesce(h::text, 'NULL'));
  -- B4: the column
  select r.actor into h from custom.record_history(c, (select val from ids where k = 'field')::uuid) r order by r.version desc limit 1;
  insert into res values ('B4 approved agent field_add: History says agent, approved by admin',
    h ->> 'kind' = 'agent' and h #>> '{approved_by,user_id}' = a, coalesce(h::text, 'NULL'));
  -- B7: the column's own timeline ("Who changed this?" on Patient capacity) — custom.field_history, re-based
  -- 2026-10-03 on the live body that lists through custom.listed_predicate_sql — names the agent, the person
  -- it worked for (test, not the approver) and the approver on the approved change (the version whose value became 7).
  select jsonb_build_object('actor', f.actor, 'after', f.after) into h
    from custom.field_history(c, current_setting('t.rooms')::uuid, 'patient_capacity', 20, 0, (select val from ids where k = 'row1')::uuid) f
   order by f.version desc limit 1;
  insert into res values ('B7 the column''s timeline names the approver of the approved change',
    h #>> '{after}' = '7' and h #>> '{actor,kind}' = 'agent' and h #>> '{actor,on_behalf_of,user_id}' = t
      and h #>> '{actor,approved_by,user_id}' = a,
    coalesce(h::text, 'NULL'));
  -- B5: the control
  reset role;
  select r.data -> '_values' into v_doc from custom.record r where r.id = (select val from ids where k = 'own')::uuid;
  set local role authenticated;
  select r.actor into h from custom.record_history(c, (select val from ids where k = 'own')::uuid) r order by r.version desc limit 1;
  insert into res values ('B5 control: a person''s own request stays the person''s, no approver mark',
    v_doc is not null and not exists (select 1 from jsonb_each(v_doc) e where e.value ->> 'actor' is distinct from 'user')
      and h ->> 'kind' = 'user' and not (h ? 'approved_by'),
    coalesce(v_doc::text, 'NULL') || ' / ' || coalesce(h::text, 'NULL'));
  -- B6: the approval row's own newest version is the decider's
  select r.actor into h from custom.record_history(c, (select val from ids where k = 'ask_add')::uuid) r order by r.version desc limit 1;
  insert into res values ('B6 the approval row itself is not marked', not coalesce(h ? 'approved_by', false), coalesce(h::text, 'NULL'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('B read-back ran', false, m);
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 200) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'visionreach_w4_approved_agent_change_is_credited.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
