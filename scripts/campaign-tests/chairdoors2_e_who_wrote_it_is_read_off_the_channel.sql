-- LANE CHAIR-DOORS-2, ITEM E — WHO WROTE IT COMES FROM THE CHANNEL, NEVER FROM THE CALLER'S WORD.
-- Guard for migrations/campaign/chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql
-- (asked by v6 lane 11 Need 9, register WF-028).
--
-- A person is only somebody typing in their own signed-in browser: a PostgREST request (PostgREST is the
-- only thing that sets `request.headers`) whose verified claims say `authenticated`, carrying no agent
-- header. Everything else is not a person unless the server's own connection declares `app.actor_tier`.
--   A. UPDATE as the member cannot set a `*_by_tier` creation stamp: crm.party.created_by_tier/_system and
--      workflow.definition_version.created_by_tier stay what the INSERT stamped.
--   B. The agent's channels without the header are never `user`:
--      B1 the server acting AS her (role authenticated + her claims, no request.headers, nothing declared)
--      B2 the server pool with app.user_id and nothing declared
--      B3 an agent client's honest `x-matrx-actor-tier: agent` header seen INSIDE a SECURITY DEFINER door
--         (current_user is the owner there) — before this file it was dropped and the write became `user`
--      B4 the human-only change-policy door refuses that agent instead of letting it through as a person
--      B5 an UPDATE of crm.party from B1's channel is not stamped `user`
--   C. Her own plain browser session is still `user`: directly, inside a definer door, and on the row stamp.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as me,      -- test@test.com
       '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid as cedar,   -- Cedar Ridge Physical Therapy
       '82a25af4-27cb-4e94-a2de-155eae7c8992'::uuid as party,   -- Marisol Vega, a Cedar Ridge contact
       '39e1aac3-3c06-4ae8-af91-08af5ea75023'::uuid as wdv      -- a Cedar Ridge workflow version
\gset
select created_by_tier as party_ct, coalesce(created_by_system, '') as party_cs from crm.party where id = :'party' \gset
select created_by_tier as wdv_ct from workflow.definition_version where id = :'wdv' \gset
select set_config('t.' || k, v, true) from (values ('me', :'me'), ('cedar', :'cedar'), ('party', :'party'), ('wdv', :'wdv'),
  ('party_ct', coalesce(:'party_ct', '')), ('party_cs', :'party_cs'), ('wdv_ct', coalesce(:'wdv_ct', ''))) x(k, v) \g /dev/null
do $$ begin
  if current_setting('t.party_ct') = '' or current_setting('t.wdv_ct') = '' then
    raise exception 'fixture: Marisol Vega or the Cedar Ridge workflow version is missing on this target';
  end if;
end $$;

-- ── C + A: her own browser (PostgREST sets request.headers; claims say authenticated) ────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated', 'session_id', 'b6f1c2d4-chairdoors2-e')::text, true) \g /dev/null
select set_config('request.headers', '{"origin":"http://localhost:3001","user-agent":"Mozilla/5.0"}', true) \g /dev/null
select set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true), set_config('app.actor_agent', '', true) \g /dev/null

do $$
declare n int; r record; m text;
begin
  insert into res values ('C browser: declared tier is user', platform.declared_actor_tier() is not distinct from 'user', coalesce(platform.declared_actor_tier(), 'NULL'));
  insert into res values ('C browser: effective tier is user', platform.actor_tier() = 'user', platform.actor_tier());

  update crm.party set created_by_tier = 'agent', created_by_system = 'forged-by-the-browser', headline = headline
   where id = current_setting('t.party')::uuid;
  get diagnostics n = row_count;
  select created_by_tier, created_by_system, updated_by_tier into r from crm.party where id = current_setting('t.party')::uuid;
  insert into res values ('A fixture: she can edit Marisol Vega', n = 1, n::text);
  insert into res values ('A party: UPDATE cannot set created_by_tier', r.created_by_tier is not distinct from current_setting('t.party_ct'), coalesce(r.created_by_tier, 'NULL'));
  insert into res values ('A party: UPDATE cannot set created_by_system', coalesce(r.created_by_system, '') = current_setting('t.party_cs'), coalesce(r.created_by_system, 'NULL'));
  insert into res values ('C party: her edit is stamped user', r.updated_by_tier = 'user', coalesce(r.updated_by_tier, 'NULL'));

  update workflow.definition_version set created_by_tier = 'agent', created_by_system = 'forged-by-the-browser'
   where id = current_setting('t.wdv')::uuid;
  get diagnostics n = row_count;
  select created_by_tier into r from workflow.definition_version where id = current_setting('t.wdv')::uuid;
  insert into res values ('A fixture: she can edit the workflow version', n = 1, n::text);
  insert into res values ('A workflow version: UPDATE cannot set created_by_tier', r.created_by_tier is not distinct from current_setting('t.wdv_ct'), coalesce(r.created_by_tier, 'NULL'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('A/C browser block ran', false, m);
end $$;

-- C inside a SECURITY DEFINER door: current_user is the owner, the request is still hers.
reset role;
do $$ begin
  insert into res values ('C browser inside a definer door: user', platform.actor_tier() = 'user' and platform.declared_actor_tier() is not distinct from 'user',
    current_user || ' ' || coalesce(platform.declared_actor_tier(), 'NULL') || ' ' || platform.actor_tier());
end $$;

-- ── B3 + B4: an agent client (matrx-extend) declares itself; a definer door must still see it ───────────
select set_config('request.headers', '{"origin":"chrome-extension://matrx","x-matrx-actor-tier":"agent","x-matrx-actor-system":"matrx-extend:agent"}', true) \g /dev/null
do $$
declare v jsonb;
begin
  insert into res values ('B3 agent header inside a definer door: agent', platform.actor_tier() = 'agent' and platform.declared_actor_system() = 'matrx-extend:agent',
    current_user || ' ' || coalesce(platform.declared_actor_tier(), 'NULL') || ' ' || platform.actor_tier() || ' ' || coalesce(platform.declared_actor_system(), 'NULL'));
end $$;
set local role authenticated;
do $$
declare v jsonb; m text;
begin
  v := platform.set_org_change_policy(current_setting('t.cedar')::uuid, 'chairdoors2_e_no_such_change', 'auto');
  insert into res values ('B4 human-only door refuses the agent', coalesce(v ->> 'error', '') like '%human-only%', v::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('B4 human-only door refuses the agent', false, m);
end $$;

-- ── B1 + B5: the server acting AS her (matrx_orm.rls_session): role + claims, no request.headers ────────
select set_config('request.headers', '', true) \g /dev/null
do $$
declare m text; r record;
begin
  insert into res values ('B1 server-as-her, undeclared: not user', platform.actor_tier() is distinct from 'user' and platform.declared_actor_tier() is distinct from 'user',
    coalesce(platform.declared_actor_tier(), 'NULL') || ' ' || coalesce(platform.actor_tier(), 'NULL'));
  begin
    update crm.party set headline = headline where id = current_setting('t.party')::uuid;
    select updated_by_tier, updated_by_system into r from crm.party where id = current_setting('t.party')::uuid;
    insert into res values ('B5 server-as-her edit is not stamped user', r.updated_by_tier is distinct from 'user', coalesce(r.updated_by_tier, 'NULL'));
    -- It still lands (background doors keep working) and says honestly that nobody declared it.
    insert into res values ('B5 it lands as system/undeclared', r.updated_by_tier = 'system' and r.updated_by_system = 'undeclared',
      coalesce(r.updated_by_tier, 'NULL') || '/' || coalesce(r.updated_by_system, 'NULL'));
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('B5 server-as-her edit lands', false, m);
  end;
end $$;
reset role;
do $$ begin
  insert into res values ('B5 the undeclared door is reported',
    exists (select 1 from ops.system_error where error_type = 'undeclared_actor_on_tier_stamped_table'
             and route = 'crm.party' and occurred_at >= now()),
    'ops.system_error');
exception when others then
  insert into res values ('B5 the undeclared door is reported', false, sqlerrm);
end $$;
set local role authenticated;

-- ── B2: the server pool naming a person but declaring nothing ─────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '', true), set_config('app.user_id', :'me', true) \g /dev/null
do $$ begin
  insert into res values ('B2 server pool + app.user_id, undeclared: not user', platform.actor_tier() is distinct from 'user',
    current_user || ' ' || coalesce(platform.actor_tier(), 'NULL'));
end $$;
-- ...and a server that DOES declare a person is still believed (the aidream request boundary).
select set_config('app.actor_tier', 'user', true), set_config('app.actor_system', :'me', true) \g /dev/null
do $$ begin
  insert into res values ('C server that declares user is user', platform.actor_tier() = 'user', platform.actor_tier());
end $$;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
