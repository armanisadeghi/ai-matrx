-- LANE CHAIR-DOORS-2 — THE WORKFLOW LEDGERS REFUSE A SIGNED-IN PERSON'S WRITES, AND STILL READ.
-- Guard for migrations/campaign/chairdoors2_a_a_signed_in_person_never_writes_the_workflow_ledgers.sql.
--
-- Runs as `authenticated` with test@test.com's claims (set local role — the grants are what is proven).
-- For each of workflow.run, trigger_fire, trigger_event, job: INSERT, UPDATE and DELETE are refused
-- 42501 "permission denied for table …" (the privilege, not an RLS miss — an RLS miss is also 42501
-- but says "row-level security"); SELECT still answers; and her own runs are still listed.
-- An UPDATE of her own run's metadata is the concrete forgery WF-028 names.
-- `anon` is refused alike. One transaction, rolled back; nothing is left behind.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_a_workflow_ledgers_refuse_client_writes.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_a_workflow_ledgers_refuse_client_writes.sql'
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
grant all on res to authenticated, anon, service_role;

select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as me \gset
select count(*) as want_runs from workflow.run where created_by = :'me' and deleted_at is null \gset
select (select id from workflow.run where created_by = :'me' and deleted_at is null order by created_at desc limit 1) as my_run \gset
select set_config('t.me', :'me', true), set_config('t.want_runs', :'want_runs', true),
       set_config('t.my_run', coalesce(:'my_run', ''), true) \g /dev/null

-- ── the member's seat ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated')::text, true) \g /dev/null

do $$
declare t text; op text; m text; n bigint;
begin
  insert into res values ('fixture: she has a run', current_setting('t.my_run') <> '', current_setting('t.want_runs'));
  -- her own runs still list
  select count(*) into n from workflow.run where created_by = current_setting('t.me')::uuid and deleted_at is null;
  insert into res values ('run: her own runs still list', n = current_setting('t.want_runs')::bigint and n > 0,
                          format('%s of %s', n, current_setting('t.want_runs')));
  -- the forgery WF-028 names: her own run's metadata
  begin
    update workflow.run set metadata = coalesce(metadata, '{}'::jsonb) || '{"trigger": "store"}'::jsonb
     where id = nullif(current_setting('t.my_run'), '')::uuid;
    insert into res values ('run: metadata update of her own run refused', false, 'updated');
  exception when insufficient_privilege then
    get stacked diagnostics m = message_text;
    insert into res values ('run: metadata update of her own run refused', m like 'permission denied for table run%', m);
  end;
  foreach t in array array['run', 'trigger_fire', 'trigger_event', 'job'] loop
    begin
      execute format('select count(*) from workflow.%I', t) into n;
      insert into res values (t || ': select answers', true, n::text);
    exception when others then
      insert into res values (t || ': select answers', false, sqlerrm);
    end;
    foreach op in array array['insert', 'update', 'delete'] loop
      begin
        execute case op
          when 'insert' then format('insert into workflow.%1$I select * from workflow.%1$I where false', t)
          when 'update' then format('update workflow.%I set updated_at = updated_at where false', t)
          else format('delete from workflow.%I where false', t) end;
        insert into res values (format('%s: %s refused', t, op), false, 'allowed');
      exception when insufficient_privilege then
        get stacked diagnostics m = message_text;
        insert into res values (format('%s: %s refused', t, op), m like 'permission denied for table%', m);
      end;
    end loop;
  end loop;
end $$;

-- ── nobody signed in ─────────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) \g /dev/null
do $$
declare t text; m text;
begin
  foreach t in array array['run', 'trigger_fire', 'trigger_event', 'job'] loop
    begin
      execute format('update workflow.%I set updated_at = updated_at where false', t);
      insert into res values (t || ': anon update refused', false, 'allowed');
    exception when insufficient_privilege then
      get stacked diagnostics m = message_text;
      insert into res values (t || ': anon update refused', m like 'permission denied for table%', m);
    end;
  end loop;
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors2_a_workflow_ledgers_refuse_client_writes.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
