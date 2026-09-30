-- DRILL-ADOPT — the auto-grain settings, a sign-in session read as who and when, and the runs behind a
-- workflow-runs number (migrations/campaign/drilladopt_the_auto_grain_lines_are_settings.sql,
-- drilladopt_a_sign_in_session_reads_as_who_and_when.sql, drilladopt_drill_declares_workflow_runs.sql).
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drilladopt_green.sql
--   psql … -v plant=nosession   puts back the names door without its session part → S1 goes RED
--   psql … -v plant=norecords   drops workflow_runs' records from its declaration → R1–R3 go RED
--
-- K. SETTINGS — drill.auto_grain.{hour,day,week}_max_days exist with the design system's lines (2 / 90 / 366).
-- S. SESSIONS — a real sign-in session (the latest request carrying one) reads "<email> · signed in <when> UTC",
--    recomputed here from the request's own JWT claims; an unknown session says so; a non-admin is refused.
-- R. RUNS — workflow_runs declares records with the run id; as admin@admin.com in the platform lane the
--    records' total = the ask's run count for the same window; in the mine lane test@test.com reads only
--    her own runs.

\set ON_ERROR_STOP 1
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table dar (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dar(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dar to authenticated;
grant usage on sequence dar_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;
select set_config('da.plant', :'plant', true) as plant;

do $$
declare b text; w text;
begin
  if current_setting('da.plant') = 'nosession' then
    b := pg_get_functiondef('platform.ai_usage_names(uuid,jsonb)'::regprocedure);
    w := replace(b, $x$from unnest(v_session) i(id)$x$, $x$from unnest('{}'::text[]) i(id)$x$);
    if w = b then raise exception 'plant nosession did not apply'; end if;
    execute w;
  elsif current_setting('da.plant') = 'norecords' then
    b := pg_get_functiondef('platform.drill_def__workflow_runs()'::regprocedure);
    w := regexp_replace(b, '"records":\{[^}]*\{[^}]*\}\},', '');
    if w = b then raise exception 'plant norecords did not apply'; end if;
    execute w;
  end if;
end $$;

-- K. the three settings
do $$
declare v jsonb;
begin
  select jsonb_object_agg(key, value) into v from platform.feature_knob where feature = 'drill.auto_grain' and archived_at is null;
  perform pg_temp.chk('K1 the auto-grain lines are settings with the design system''s values',
    v = '{"hour_max_days": 2, "day_max_days": 90, "week_max_days": 366}'::jsonb, coalesce(v::text, 'none'));
end $$;

-- S. sessions
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_sys   constant uuid := '00000000-0000-0000-0000-000000000001';
  v_sid text; v_want text; v_got jsonb; v_state text; v_org uuid;
begin
  select id into v_org from iam.organizations where id = c_sys;
  if v_org is null then select organization_id into v_org from iam.organization_member where user_id = c_admin limit 1; end if;
  -- a real session: the latest request whose claims carry one and an amr time
  select ur.metadata -> 'jwt_claims' ->> 'session_id',
         coalesce(nullif(ur.metadata -> 'jwt_claims' ->> 'email', ''), u.email) || ' · signed in '
           || to_char(to_timestamp((ur.metadata -> 'jwt_claims' -> 'amr' -> 0 ->> 'timestamp')::bigint) at time zone 'UTC', 'Mon FMDD, FMHH12:MI AM') || ' UTC'
    into v_sid, v_want
    from chat.user_request ur left join auth.users u on u.id = ur.created_by
   where ur.metadata -> 'jwt_claims' ->> 'session_id' is not null
     and (ur.metadata -> 'jwt_claims' -> 'amr' -> 0 ->> 'timestamp') ~ '^[0-9]+$'
   order by ur.created_at desc limit 1;
  -- the label is the session's FIRST request's claims (the door's rule): recompute with that one
  select coalesce(nullif(ur.metadata -> 'jwt_claims' ->> 'email', ''), u.email) || ' · signed in '
           || to_char(to_timestamp((ur.metadata -> 'jwt_claims' -> 'amr' -> 0 ->> 'timestamp')::bigint) at time zone 'UTC', 'Mon FMDD, FMHH12:MI AM') || ' UTC'
    into v_want
    from chat.user_request ur left join auth.users u on u.id = ur.created_by
   where ur.metadata -> 'jwt_claims' ->> 'session_id' = v_sid
   order by ur.created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  v_got := platform.ai_usage_names(v_org, jsonb_build_object('session', jsonb_build_array(v_sid, '11111111-2222-4333-8444-555555555555')));
  execute 'reset role';
  perform pg_temp.chk('S1 a sign-in session reads "<email> · signed in <when> UTC" (its first request''s claims)',
    v_sid is not null and v_got -> 'session' ->> v_sid = v_want, format('%s → %s (want %s)', left(coalesce(v_sid, 'no session'), 8), v_got -> 'session' ->> v_sid, v_want));
  perform pg_temp.chk('S2 a session with no request says so, never its id',
    v_got -> 'session' ->> '11111111-2222-4333-8444-555555555555' = 'A sign-in session with no request on record', v_got -> 'session' ->> '11111111-2222-4333-8444-555555555555');
  perform pg_temp.chk('S4 the other parts are untouched (organization, person, agent keys present)',
    v_got ? 'organization' and v_got ? 'person' and v_got ? 'agent' and v_got ? 'counted_through', (select string_agg(k, ',') from jsonb_object_keys(v_got) k));

  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  begin
    perform platform.ai_usage_names(v_org, jsonb_build_object('session', jsonb_build_array(v_sid)));
    v_state := 'answered';
  exception when insufficient_privilege then v_state := '42501';
            when others then v_state := sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.chk('S3 a person who is not a platform admin is refused (42501)', v_state = '42501', v_state);
exception when others then
  execute 'reset role';
  perform pg_temp.chk('S sessions', false, sqlerrm);
end $$;

-- R. the runs behind a workflow-runs number
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org   constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- calendar only
  c_src   constant jsonb := '{"kind":"entity","token":"workflow_runs"}';
  v_desc jsonb; v_ask bigint; v_rows jsonb; v_want bigint; v_bad int; v_mine_org uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  select to_jsonb(d) into v_desc from platform.drill_describe(c_org, c_src) d;
  select (a.measures ->> 'runs')::bigint into v_ask from platform.drill_ask(c_org, c_src,
           '{"show":["runs"],"lane":"platform","window":{"key":"at","preset":"30d"}}') a where a.kind = 'total';
  v_rows := platform.drill_rows(c_org, c_src, '{"lane":"platform","window":{"key":"at","preset":"30d"},"limit":1000}');
  execute 'reset role';
  perform pg_temp.chk('R1 workflow_runs declares its records with the run id',
    coalesce((v_desc #> '{drill_describe,records,columns}') ? 'run_id', (v_desc #> '{records,columns}') ? 'run_id', false), left(coalesce((v_desc -> 'records')::text, (v_desc #> '{drill_describe,records}')::text, 'no records'), 200));
  perform pg_temp.chk('R2 admin, platform lane: the records'' total = the runs counted (30 days)',
    v_ask > 0 and (v_rows ->> 'total')::bigint = v_ask, format('%s records vs %s runs', v_rows ->> 'total', v_ask));
  select count(*) filter (where r ->> 'run_id' is null) into v_bad from jsonb_array_elements(v_rows -> 'rows') r;
  perform pg_temp.chk('R3 every record carries its run id (its door)', v_bad = 0 and jsonb_array_length(v_rows -> 'rows') > 0, format('%s without an id of %s', v_bad, jsonb_array_length(v_rows -> 'rows')));

  -- R4 mine lane: test@test.com's records are her own runs, all of them
  select organization_id into v_mine_org from iam.organization_member where user_id = c_test order by organization_id limit 1;
  select count(*) into v_want from workflow._run_facts where person_id = c_test;
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  v_rows := platform.drill_rows(v_mine_org, c_src, '{"lane":"mine","window":{"key":"at","from":"2000-01-01T00:00:00Z","to":"2100-01-01T00:00:00Z"},"limit":1000,"columns":["run_id","person_id"]}');
  execute 'reset role';
  select count(*) filter (where r ->> 'person_id' is distinct from c_test::text) into v_bad from jsonb_array_elements(v_rows -> 'rows') r;
  perform pg_temp.chk('R4 test@test.com, mine lane: only her runs, every one of them',
    v_bad = 0 and (v_rows ->> 'total')::bigint = v_want, format('%s records (%s not hers) vs %s runs', v_rows ->> 'total', v_bad, v_want));
exception when others then
  execute 'reset role';
  perform pg_temp.chk('R runs', false, sqlerrm);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.dar order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.dar;
rollback;
