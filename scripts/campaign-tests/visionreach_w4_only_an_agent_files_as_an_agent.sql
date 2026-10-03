-- LANE 5 VISION-REACH, WAVE 4 (d) — ONLY AN AGENT FILES AS AN AGENT, AND ONLY A PERSON DECIDES.
-- Guard for migrations/campaign/visionreach_w4_d_only_an_agent_files_as_an_agent.sql
--
-- The break it names: custom.work_approval_request taking `origin = 'agent'` on the caller's word. That word
-- is what waives the second person for the person an agent works for, so a person who claims it approves
-- her own change. Its mirror: an agent-declared connection deciding an approval in its person's name.
--
-- Cedar Ridge Physical Therapy, Treatment Rooms; test@test.com is given ADMIN on the table (rolled back) so
-- she is one of its approvers; admin@admin.com (owner).
--   D1  test, in her own browser (PostgREST, no agent header), files a record_add as origin 'agent' -> refused 42501
--   D2  ...so she cannot then approve it herself: nothing pending from her "agent" exists to approve
--   D3  an agent-declared connection (server seat, acting as admin) deciding test's own pending request -> refused 42501
--   D4  CONTROL: test's agent (server seat, app.actor_tier = agent) files origin 'agent' -> pending, and test,
--       in her own browser, approves it (the waiver an agent's request is for)
--   D5  CONTROL: test's own request (origin person) is still refused to her ("somebody else approves it") and
--       admin, in his browser, approves it
-- THE VERDICT IS THE EXIT CODE. Everything is rolled back.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_w4_only_an_agent_files_as_an_agent.sql
\set ON_ERROR_STOP on
\set suite 'visionreach_w4_only_an_agent_files_as_an_agent.sql'
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

select set_config('t.admin', '87a6e699-3622-4869-8843-d0867456c0dd', true),
       set_config('t.test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true),
       set_config('t.cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),
       set_config('t.rooms', '89919d7d-cbbc-4600-8ea7-3f63db964631', true)
\g /dev/null

create or replace function pg_temp.as_browser(p_who text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true),
         set_config('request.headers', '{"origin":"http://localhost:3001"}', true),
         set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true);
$f$;
create or replace function pg_temp.as_agent_of(p_who text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true),
         set_config('request.headers', '', true),
         set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'records', true);
$f$;
create or replace function pg_temp.room(p_title text) returns jsonb language sql as $f$
  select jsonb_build_object('kind', 'record_add', 'rows', jsonb_build_array(
           jsonb_build_object('title', p_title, 'patient_capacity', 2, 'pool_lift', false)));
$f$;

set local role authenticated;
select pg_temp.as_browser(current_setting('t.admin')) \g /dev/null
select custom.share_grant(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid, 'person',
                          current_setting('t.test')::uuid, 'admin'::public.permission_level) \g /dev/null

do $$
declare v jsonb; m text; c text; o uuid := current_setting('t.cedar')::uuid; t uuid := current_setting('t.rooms')::uuid;
begin
  -- D1 / D2: a person claiming to be an agent
  perform pg_temp.as_browser(current_setting('t.test'));
  begin
    v := custom.work_approval_request(o, t, pg_temp.room('Hand Therapy Room'), 'Add the hand therapy room', null, 'agent', null);
    insert into res values ('D1 a person filing as an agent is refused', false, 'FILED: ' || v::text);
    begin
      v := custom.work_approval_decide(o, (v ->> 'approval_id')::uuid, true, null);
      insert into res values ('D2 ...and so cannot approve her own change', false, 'SHE APPROVED IT: ' || coalesce(v ->> 'message', ''));
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('D2 ...and so cannot approve her own change', true, m);
    end;
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('D1 a person filing as an agent is refused', c = '42501', c || ' ' || m);
    insert into res values ('D2 ...and so cannot approve her own change', true, 'nothing was filed to approve');
  end;

  -- D5 (part 1): her own request, as a person
  v := custom.work_approval_request(o, t, pg_temp.room('Balance Lab'), 'Add the balance lab', null, 'person', null);
  insert into ids values ('own', v ->> 'approval_id');
  begin
    v := custom.work_approval_decide(o, (select val from ids where k = 'own')::uuid, true, null);
    insert into res values ('D5a her own request still needs somebody else', false, 'SHE APPROVED IT: ' || coalesce(v ->> 'message', ''));
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('D5a her own request still needs somebody else', c = '42501' and m like '%somebody else%', c || ' ' || m);
  end;

  -- D3: an agent deciding
  perform pg_temp.as_agent_of(current_setting('t.admin'));
  begin
    v := custom.work_approval_decide(o, (select val from ids where k = 'own')::uuid, true, null);
    insert into res values ('D3 an agent-declared connection cannot decide', false, 'THE AGENT APPROVED IT: ' || coalesce(v ->> 'message', ''));
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('D3 an agent-declared connection cannot decide', c = '42501', c || ' ' || m);
  end;

  -- D5 (part 2): admin, in his browser, approves her request
  perform pg_temp.as_browser(current_setting('t.admin'));
  begin
    v := custom.work_approval_decide(o, (select val from ids where k = 'own')::uuid, true, null);
    insert into res values ('D5b admin approves her request', v ->> 'state' = 'approved', v ->> 'message');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('D5b admin approves her request', false, m);
  end;

  -- D4: her agent files, she approves
  perform pg_temp.as_agent_of(current_setting('t.test'));
  begin
    v := custom.work_approval_request(o, t, pg_temp.room('Aquatic Therapy Pool 2'), 'Add the second pool', null, 'agent', null);
    insert into ids values ('agent', v ->> 'approval_id');
    insert into res values ('D4a her agent files as an agent', v ->> 'state' = 'pending' and v ->> 'origin' = 'agent', v::text);
    perform pg_temp.as_browser(current_setting('t.test'));
    v := custom.work_approval_decide(o, (select val from ids where k = 'agent')::uuid, true, null);
    insert into res values ('D4b she approves her agent''s request', v ->> 'state' = 'approved', v ->> 'message');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('D4 her agent files, she approves', false, m);
  end;
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 200) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'visionreach_w4_only_an_agent_files_as_an_agent.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
