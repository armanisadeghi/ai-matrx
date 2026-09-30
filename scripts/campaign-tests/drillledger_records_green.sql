-- DRILL-LEDGER-RECORDS — the records behind a usage number, the rollup's one rules source, its
-- freshness, and the contract additions (ratio, having, Saved views, findings, as_of).
-- (migrations/campaign/drillledger_the_records_behind_a_usage_number_are_the_ledger.sql and its
-- siblings; PROGRESS-DRILL-FINISH decisions 2, 3, 14, 15/26, 16/28, 25.)
--
--   psql "<clone dsn>" -v def="$(ai_usage.json)" [-v plant=nolane] -f scripts/campaign-tests/drillledger_records_green.sql
--
-- `def`, when given, is the ai_usage declaration compiled from its *.drill.ts (planted INSIDE this
-- rolled-back transaction, so the suite runs before the sync file is applied); else the live body.
-- `plant=nolane` removes the organization and mine lanes' column predicate from the compiler inside
-- the transaction -> the seat guards (S*) go RED. Nothing is kept: the whole run is rolled back.
--
-- THE CLONE ONLY (never production): the seats are simulated with request.jwt.claims and
-- `set local role authenticated`, exactly as PostgREST sets them.

\set ON_ERROR_STOP 1
\if :{?def}
\else
\set def ''
\endif
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '900s';
set local client_min_messages = warning;
create temp table dlr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dlr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dlr to authenticated;
grant usage on sequence dlr_n_seq to authenticated;
select set_config('dl.def', :'def', true) is not null as def_set, set_config('dl.plant', :'plant', true) as plant;

do $$
declare v text := current_setting('dl.def'); b text; w text;
begin
  if coalesce(v, '') <> '' then
    execute 'create or replace function platform.drill_def__ai_usage() returns jsonb language sql immutable '
         || 'set search_path to ''pg_catalog'' as ' || quote_literal('select ' || quote_literal(v) || '::jsonb');
  end if;
  if current_setting('dl.plant') = 'nolane' then
    b := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(b, $x$v_preds := v_preds || format('%I.%I = ($1->>%L)::uuid', v_col ->> 'alias', v_col ->> 'column',$x$,
                    $x$v_preds := v_preds || format('(%I.%I = ($1->>%L)::uuid or true)', v_col ->> 'alias', v_col ->> 'column',$x$);
    if w = b then raise exception 'plant nolane did not apply'; end if;
    execute w;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- P. ONE RULES SOURCE: the rollup rebuilt FROM THE VIEW equals the rollup rebuilt by the OLD body
--    (its own CTE over the ledger, verbatim from drillusage_one_rollup_rebuild_at_a_time.sql), for
--    the last 35 days, group for group, to the cent.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dlw on commit drop as
  select date_trunc('hour', now(), 'UTC') - interval '35 days' as w0, date_trunc('hour', now(), 'UTC') + interval '1 hour' as w1;
create temp table dl_old on commit drop as
  with g as (
    select
      e.id, e.created_at, coalesce(e.cost, 0) as cost,
      e.organization_id, e.link_kind, e.link_id, e.type, e.request_id, e.context, e.meters,
      case when (e.context ->> 'user_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'user_id')::uuid end as ctx_user_id,
      case when (e.context ->> 'agent_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'agent_id')::uuid end as ctx_agent_id,
      (e.request_id is null or not exists (
         select 1 from runtime.global_execution e2
          where e2.request_id = e.request_id
            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id)))) as is_request_head
    from runtime.global_execution e, dlw
    where e.created_at >= dlw.w0 and e.created_at < dlw.w1
  ),
  f as (
    select
      date_trunc('hour', g.created_at, 'UTC') as bucket,
      g.organization_id,
      coalesce(ur.created_by, g.ctx_user_id) as person_id,
      coalesce(ur.agent_id, g.ctx_agent_id) as agent_id,
      m.provider,
      m.model,
      coalesce(nullif(ur.source_app, ''), 'aidream') as app,
      coalesce(nullif(ur.source_feature, ''), nullif(g.context ->> 'agent_run_label', ''), g.link_kind, g.type) as feature,
      coalesce(ur.origin_class, case g.link_kind when 'sch_run' then 'scheduled' when 'internal_agent_run' then 'child_agent' else 'system' end) as origin,
      case when coalesce(ur.origin_class, '') in ('human', 'api') then 'manual' else 'automated' end as trigger,
      coalesce(g.link_kind, g.type) as source,
      g.cost,
      case when ur.id is not null and g.is_request_head then 1 else 0 end as request_head,
      case when ur.id is null then coalesce((g.meters ->> 'input_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_input_tokens, 0) else 0 end as tokens_in,
      case when ur.id is null then coalesce((g.meters ->> 'cached_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_cached_tokens, 0) else 0 end as tokens_cached,
      case when ur.id is null then coalesce((g.meters ->> 'output_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_output_tokens, 0) else 0 end as tokens_out,
      case when g.is_request_head then coalesce(m.unpriced_calls, 0) else 0 end as unpriced_calls
    from g
    left join chat.user_request ur on ur.id = g.request_id
    left join lateral (
      select x.model, x.provider, x.unpriced_calls
        from (
          select coalesce(md.name, r.ai_model_id::text, 'unknown') as model,
                 coalesce(r.provider, 'unknown') as provider,
                 sum(r.cost) as model_cost,
                 sum(count(*) filter (where r.cost is null)) over () as unpriced_calls
            from chat.request r
            left join ai.model_definition md on md.id = r.ai_model_id
           where r.user_request_id = ur.id and r.deleted_at is null
           group by 1, 2
        ) x
       order by x.model_cost desc nulls last
       limit 1
    ) m on ur.id is not null
  )
  select bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
         sum(cost) as cost, count(*)::bigint as calls, count(*) filter (where cost > 0)::bigint as paid_calls, sum(request_head)::bigint as requests,
         sum(tokens_in)::bigint as tokens_in, sum(tokens_cached)::bigint as tokens_cached, sum(tokens_out)::bigint as tokens_out,
         sum(unpriced_calls)::bigint as unpriced_calls
    from f
   group by bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source;

select runtime.ai_usage_hourly_refresh((select w0 from dlw), now());
create temp table dl_new on commit drop as
  select bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
         cost::numeric as cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls
    from runtime._ai_usage_hourly h, dlw where h.bucket >= dlw.w0 and h.bucket < dlw.w1;
select pg_temp.chk('P1 35 days: the rollup rebuilt from the view = the rollup rebuilt by the old body, group for group',
  not exists (select * from dl_old except all select * from dl_new) and not exists (select * from dl_new except all select * from dl_old),
  format('%s groups old, %s new; %s old-only, %s new-only; cost %s vs %s',
    (select count(*) from dl_old), (select count(*) from dl_new),
    (select count(*) from (select * from dl_old except all select * from dl_new) x), (select count(*) from (select * from dl_new except all select * from dl_old) x),
    (select sum(cost) from dl_old), (select sum(cost) from dl_new)));
select pg_temp.chk('P2 the view is one row per ledger execution (35 days)',
  (select count(*) from runtime._ai_usage_calls c, dlw where c.created_at >= dlw.w0 and c.created_at < dlw.w1)
  = (select count(*) from runtime.global_execution e, dlw where e.created_at >= dlw.w0 and e.created_at < dlw.w1)
  and (select count(distinct execution_id) from runtime._ai_usage_calls c, dlw where c.created_at >= dlw.w0 and c.created_at < dlw.w1)
  = (select count(*) from runtime.global_execution e, dlw where e.created_at >= dlw.w0 and e.created_at < dlw.w1));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- W. FRESHNESS: written only by a rebuild that reaches now; the counted hours stay unbroken.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_before timestamptz; v_after timestamptz; v_from timestamptz;
begin
  select covered_to into v_before from runtime._ai_usage_hourly_watermark;
  perform runtime.ai_usage_hourly_refresh(now() - interval '5 days', now() - interval '4 days');
  select covered_to into v_after from runtime._ai_usage_hourly_watermark;
  perform pg_temp.chk('W1 a rebuild of past hours (not reaching now) leaves the watermark where it was',
    v_before is not null and v_after = v_before, format('%s -> %s', v_before, v_after));
  -- pretend the rollup last counted three days ago and lost the hours since: a 48-hour rebuild
  -- reaches back to where it counted through, so no hour is left uncounted
  update runtime._ai_usage_hourly_watermark set covered_from = now() - interval '30 days', covered_to = now() - interval '3 days';
  delete from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '3 days', 'UTC') and bucket < date_trunc('hour', now() - interval '48 hours', 'UTC');
  perform runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now());
  select covered_from, covered_to into v_from, v_after from runtime._ai_usage_hourly_watermark;
  perform pg_temp.chk('W2 a 48-hour rebuild after three quiet days reaches back to where the rollup counted through (the lost day is counted again), keeps where the run of counted hours starts, and moves the watermark to now',
    v_after > now() and v_from = now() - interval '30 days'
    and (select coalesce(sum(cost), 0) from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '3 days', 'UTC') and bucket < date_trunc('hour', now() - interval '48 hours', 'UTC'))
      = (select coalesce(sum(cost), 0) from runtime.global_execution where created_at >= date_trunc('hour', now() - interval '3 days', 'UTC') and created_at < date_trunc('hour', now() - interval '48 hours', 'UTC'))
    and exists (select 1 from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '3 days', 'UTC') and bucket < date_trunc('hour', now() - interval '48 hours', 'UTC')),
    format('covered %s .. %s', v_from, v_after));
  perform pg_temp.chk('W3 after it, every settled hour of the last 5 days equals the ledger',
    (select coalesce(sum(cost), 0) from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '5 days', 'UTC') and bucket < date_trunc('hour', now(), 'UTC'))
    = (select coalesce(sum(cost), 0) from runtime.global_execution where created_at >= date_trunc('hour', now() - interval '5 days', 'UTC') and created_at < date_trunc('hour', now(), 'UTC')));
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- S. THE SEAT GUARDS: from each lane's seat, the number = the SUM over the records' own filter
--    (drill_rows' window sums — a sum query, never paging), at an ALIGNED and a NON-ALIGNED window
--    touching the latest hour; and no record of an organization the seat does not hold.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dls (seat text, lane text, org uuid, win text, ask jsonb, rows jsonb) on commit drop;
create temp table dlt on commit drop as select date_trunc('hour', max(created_at), 'UTC') as last_hour from runtime.global_execution;
grant all on dls, dlt to authenticated;
create or replace function pg_temp.seat_pair(p_seat text, p_lane text, p_org uuid) returns void language plpgsql as $$
declare
  v_last timestamptz := (select last_hour from pg_temp.dlt);
  v_src  jsonb := '{"kind":"entity","token":"ai_usage"}';
  v_w    jsonb;
  v_ask  jsonb;
  v_rows jsonb;
  k      text;
begin
  foreach k in array array['aligned', 'unaligned'] loop
    v_w := case k when 'aligned' then jsonb_build_object('key', 'at', 'from', v_last - interval '3 days', 'to', v_last + interval '1 hour')
                  else jsonb_build_object('key', 'at', 'from', v_last - interval '5 days' + interval '17 minutes', 'to', v_last + interval '37 minutes') end;
    select to_jsonb(a) into v_ask from platform.drill_ask(p_org, v_src,
      jsonb_build_object('lane', p_lane, 'by', '[]'::jsonb, 'show', '["cost","calls","requests","tokens_in","tokens_out","tokens_cached","unpriced_calls"]'::jsonb, 'window', v_w)) a
     where a.kind = 'total';
    v_rows := platform.drill_rows(p_org, v_src, jsonb_build_object('lane', p_lane, 'window', v_w, 'limit', 50));
    insert into pg_temp.dls values (p_seat, p_lane, p_org, k, v_ask, v_rows);
  end loop;
end $$;
grant execute on function pg_temp.seat_pair(text, text, uuid) to authenticated;

do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_org uuid; v_org2 uuid; v_mine_org uuid; v_other uuid; v_state text;
  v_since timestamptz := (select last_hour from pg_temp.dlt) - interval '5 days';
begin
  -- the seats' organizations, chosen as the platform (before any seat is taken)
  select h.organization_id into v_org
    from runtime._ai_usage_hourly h
    join iam.organization_member m on m.organization_id = h.organization_id and m.user_id = c_admin and m.role in ('owner', 'admin')
   where h.bucket > v_since
   group by 1 having count(distinct h.person_id) > 1 order by sum(h.cost) desc limit 1;
  select m.organization_id into v_org2 from iam.organization_member m
   where m.user_id = c_test and m.role in ('owner', 'admin')
     and exists (select 1 from runtime._ai_usage_hourly h where h.organization_id = m.organization_id and h.bucket > v_since)
   order by m.organization_id limit 1;
  select h.organization_id into v_mine_org from runtime._ai_usage_hourly h
   where h.person_id = c_test and h.bucket > v_since
   group by 1 order by sum(h.calls) desc limit 1;
  select m.organization_id into v_other from iam.organization_member m
   where m.user_id = c_test and m.role not in ('owner', 'admin')
     and exists (select 1 from runtime._ai_usage_hourly h where h.organization_id = m.organization_id)
   order by m.organization_id limit 1;

  -- platform: admin@admin.com inside the admin apps
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  perform pg_temp.seat_pair('admin@admin.com', 'platform', c_aimatrx);
  execute 'reset role';

  -- organization: admin@admin.com OUTSIDE the admin apps (an ordinary owner there), in the organization
  -- she owns or administers with the most usage of more than one person
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  perform pg_temp.seat_pair('admin@admin.com (owner, outside the admin apps)', 'organization', v_org);
  execute 'reset role';

  -- organization: test@test.com as the owner of her own workspace
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if v_org2 is not null then
    perform pg_temp.seat_pair('test@test.com (owner)', 'organization', v_org2);
  end if;

  -- mine: test@test.com, in an organization where she has usage
  perform pg_temp.seat_pair('test@test.com', 'mine', coalesce(v_mine_org, v_org2));

  -- refusals from her seat: the platform lane; an organization she is only a member of
  begin
    perform platform.drill_rows(v_mine_org, '{"kind":"entity","token":"ai_usage"}', '{"lane":"platform","window":{"key":"at","preset":"7d"}}');
    v_state := 'answered';
  exception when insufficient_privilege then v_state := '42501';
  end;
  perform pg_temp.chk('S5 the platform lane''s records are refused to test@test.com (42501)', v_state = '42501', v_state);
  begin
    perform platform.drill_rows(v_other, '{"kind":"entity","token":"ai_usage"}', '{"lane":"organization","window":{"key":"at","preset":"30d"}}');
    v_state := 'answered';
  exception when insufficient_privilege then v_state := '42501';
  end;
  perform pg_temp.chk('S6 an organization''s records are refused to a member who is not its owner or admin (42501)', v_state = '42501', format('%s in %s', v_state, v_other));
  execute 'reset role';
end $$;

select pg_temp.chk(format('S1 %s × %s window: the number = the sum over its records'' filter (cost, calls, requests, tokens in/out/cached, unpriced) and the records'' count = its calls', seat, win),
  (ask -> 'measures' ->> 'cost')::numeric = (rows -> 'measures' ->> 'cost')::numeric
  and (ask -> 'measures' ->> 'calls')::numeric = (rows -> 'measures' ->> 'calls')::numeric
  and (ask -> 'measures' ->> 'calls')::numeric = (rows ->> 'total')::numeric
  and (ask -> 'measures' ->> 'requests')::numeric = (rows -> 'measures' ->> 'requests')::numeric
  and (ask -> 'measures' ->> 'tokens_in')::numeric = (rows -> 'measures' ->> 'tokens_in')::numeric
  and (ask -> 'measures' ->> 'tokens_out')::numeric = (rows -> 'measures' ->> 'tokens_out')::numeric
  and (ask -> 'measures' ->> 'tokens_cached')::numeric = (rows -> 'measures' ->> 'tokens_cached')::numeric
  and (ask -> 'measures' ->> 'unpriced_calls')::numeric = (rows -> 'measures' ->> 'unpriced_calls')::numeric
  and (rows ->> 'total')::numeric > 0,
  format('ask %s / %s calls; records %s / %s (%s rows)', ask -> 'measures' ->> 'cost', ask -> 'measures' ->> 'calls',
         rows -> 'measures' ->> 'cost', rows -> 'measures' ->> 'calls', rows ->> 'total'))
  from dls;
select pg_temp.chk(format('S2 %s × %s: the number and its records are the same moment (as_of = the watermark)', seat, win),
  (ask ->> 'as_of')::timestamptz = (select covered_to from runtime._ai_usage_hourly_watermark)
  and (rows ->> 'as_of')::timestamptz = (select covered_to from runtime._ai_usage_hourly_watermark))
  from dls;
select pg_temp.chk(format('S3 %s (%s lane): the number = exactly that lane''s rows of the rollup, and the records hold no row of another organization or person', seat, lane),
  (ask -> 'measures' ->> 'cost')::numeric = (
     select coalesce(sum(h.cost), 0) from runtime._ai_usage_hourly h
      where h.bucket >= (d.rows_from) and h.bucket < d.rows_to
        and (d.lane = 'platform' or (d.lane = 'organization' and h.organization_id = d.org)
             or (d.lane = 'mine' and h.person_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')))
  and not exists (select 1 from jsonb_array_elements(rows -> 'rows') r
                   where (lane = 'organization' and (r ->> 'organization_id')::uuid is distinct from org)
                      or (lane = 'mine' and (r ->> 'person_id')::uuid is distinct from '4060701e-706a-4c76-b3ca-0bbc69fa5a14')),
  format('ask %s; %s records on the page', ask -> 'measures' ->> 'cost', jsonb_array_length(rows -> 'rows')))
  from (select dls.*, (case win when 'aligned' then date_trunc('hour', (select max(created_at) from runtime.global_execution), 'UTC') - interval '3 days'
                                else date_trunc('hour', (select max(created_at) from runtime.global_execution), 'UTC') - interval '5 days' + interval '17 minutes' end) as rows_from,
               (case win when 'aligned' then date_trunc('hour', (select max(created_at) from runtime.global_execution), 'UTC') + interval '1 hour'
                         else date_trunc('hour', (select max(created_at) from runtime.global_execution), 'UTC') + interval '37 minutes' end) as rows_to
          from dls) d;
select pg_temp.chk('S4 every lane''s seat was asked at both windows (platform, organization ×2, mine)',
  (select count(distinct seat) from dls) >= 3 and (select count(*) from dls) >= 6 and (select bool_and(ask is not null and rows is not null) from dls),
  (select string_agg(distinct seat || '/' || lane, ', ') from dls));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- R. THE RECORDS DOOR's own rules.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_src jsonb := '{"kind":"entity","token":"ai_usage"}';
  v_state text; v_p1 jsonb; v_p2 jsonb; v_w jsonb;
  v_tool_call_has_no_model boolean := exists (select 1 from runtime._ai_usage_calls c where c.created_at > now() - interval '30 days'
                                                and c.source = 'external_api' and c.model is not null and c.call_model is null);
begin
  v_w := jsonb_build_object('key', 'at', 'from', (select last_hour from pg_temp.dlt) - interval '1 day', 'to', now());
  perform set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  begin
    perform platform.drill_rows(c_aimatrx, v_src, '{"lane":"platform"}');
    v_state := 'answered';
  exception when invalid_parameter_value then v_state := '22023: ' || sqlerrm;
  end;
  perform pg_temp.chk('R1 records without a window are refused in words (22023)', v_state like '22023%', v_state);
  begin
    perform platform.drill_rows(c_aimatrx, v_src, '{"lane":"platform","window":{"key":"at","preset":"7d"},"columns":["session_id"]}');
    v_state := 'answered';
  exception when invalid_parameter_value then v_state := '22023';
  end;
  perform pg_temp.chk('R2 a record shows only its declared columns (session_id is not one: 22023)', v_state = '22023', v_state);
  v_p1 := platform.drill_rows(c_aimatrx, v_src, jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 25, 'where', jsonb_build_object('source', 'conversation')));
  v_p2 := platform.drill_rows(c_aimatrx, v_src, jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 25, 'offset', 25, 'where', jsonb_build_object('source', 'conversation')));
  perform pg_temp.chk('R3 pages do not overlap, the second page carries no sums, every row holds exactly the declared columns (a null stays null)',
    not exists (select 1 from jsonb_array_elements(v_p1 -> 'rows') a join jsonb_array_elements(v_p2 -> 'rows') b on a ->> 'execution_id' = b ->> 'execution_id')
    and jsonb_array_length(v_p1 -> 'rows') = 25 and not (v_p2 ? 'measures') and v_p1 ? 'measures'
    and not exists (select 1 from jsonb_array_elements(v_p1 -> 'rows') r
                     where (select count(*) from jsonb_object_keys(r)) <> jsonb_array_length(v_p1 -> 'columns'))
    and not exists (select 1 from jsonb_array_elements(v_p1 -> 'rows') r where r ->> 'source' <> 'conversation'),
    format('%s + %s rows of %s', jsonb_array_length(v_p1 -> 'rows'), jsonb_array_length(v_p2 -> 'rows'), v_p1 ->> 'total'));
  perform pg_temp.chk('R4 a model call''s own model is set only on the execution that billed it; a tool call''s is empty',
    not exists (select 1 from jsonb_array_elements(v_p1 -> 'rows') r where r ->> 'call_model' is distinct from r ->> 'model')
    and v_tool_call_has_no_model);
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- C. THE CONTRACT: ratio, having (absolute, share, × median, a setting), Saved views, findings, the
--    validator, describe, as_of and the stale line, the settings and their resolver.
--    A probe definition over the same rollup is planted inside the transaction.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function platform.drill_def__ledger_suite_probe() returns jsonb language sql immutable set search_path to 'pg_catalog' as $f$
  select (platform.drill_def__ai_usage() - 'records' - 'stale_after_knob')
    || jsonb_build_object('key', 'ledger_suite_probe', 'label', 'Ledger suite probe')
    || jsonb_build_object('measures', (platform.drill_def__ai_usage() -> 'measures') || '[{"key":"cost_per_request","label":"Cost per request","op":"ratio","num":["cost"],"den":"requests","unit":"usd"},
                                                                                   {"key":"tokens_per_request","label":"Tokens per request","op":"ratio","num":["tokens_in","tokens_out"],"den":"requests","unit":"tokens"}]'::jsonb)
    || '{"views":[{"key":"by_model","label":"By model","question":{"by":["model"],"show":["cost","calls"],"sort":{"key":"cost","direction":"desc"},"window":{"key":"at","preset":"30d"}}}],
         "findings":[{"key":"hogs","label":"People who spent a large share","question":{"by":["person"],"show":["cost"],"having":[{"measure":"cost","op":">=","share_of_total":20,"knob":"drill.finding.ledger_suite_probe.hogs.hog_share_pct"}],"window":{"key":"at","preset":"30d"}},
                      "knobs":{"hog_share_pct":{"default":20,"label":"Share of the window''s cost","unit":"percent"}}}]}'::jsonb
$f$;
insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, label, description, set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values ('drill.finding.ledger_suite_probe.hogs', 'hog_share_pct', '20', '20', 'number', 'percent', 'Share of the window''s cost', 'suite probe', 'agent', 'suite probe', '{organization,user}', 'any', 'next_load', false, '{}');

select pg_temp.chk('C1 the live ai_usage and the probe (ratio, a Saved view, a finding) are sound',
  cardinality(platform.drill_definition_problems(platform.drill_def__ai_usage())) = 0
  and cardinality(platform.drill_definition_problems(platform.drill_def__ledger_suite_probe())) = 0,
  array_to_string(platform.drill_definition_problems(platform.drill_def__ai_usage()) || platform.drill_definition_problems(platform.drill_def__ledger_suite_probe()), ' | '));

create temp table dlbad (name text, def jsonb, needle text) on commit drop;
insert into dlbad
select 'ratio of a non-adding part', platform.drill_def__ledger_suite_probe() || jsonb_build_object('measures', (platform.drill_def__ledger_suite_probe() -> 'measures') || '[{"key":"bad_ratio","label":"x","op":"ratio","num":["people"],"den":"calls"}]'::jsonb), 'does not add up'
union all select 'records on an invoker definition', (platform.drill_def__ai_usage() - 'lane_rules' - 'stale_after_knob') || '{"mode":"invoker"}', 'definer definition only'
union all select 'records relation missing a column the definition reads', platform.drill_def__ai_usage() || '{"records":{"fact":"ai_usage_hourly_watermark","columns":["covered_to"]}}', 'has no column'
union all select 'a Saved view grouping by a dimension that is not one', platform.drill_def__ledger_suite_probe() || '{"views":[{"key":"v","label":"V","question":{"by":["planet"]}}]}', 'not a dimension'
union all select 'a finding reading a setting it does not declare', platform.drill_def__ledger_suite_probe() || '{"findings":[{"key":"f","label":"F","question":{"by":["person"],"show":["cost"],"having":[{"measure":"cost","op":">=","value":5,"knob":"drill.finding.ledger_suite_probe.f.other"}]},"knobs":{"line":{"default":5,"label":"L","unit":"usd"}}}]}', 'not one of its own'
union all select 'a finding whose threshold writes a number that is not the setting''s default', platform.drill_def__ledger_suite_probe() || '{"findings":[{"key":"f","label":"F","question":{"by":["person"],"show":["cost"],"having":[{"measure":"cost","op":">=","value":7,"knob":"drill.finding.ledger_suite_probe.f.line"}]},"knobs":{"line":{"default":5,"label":"L","unit":"usd"}}}]}', 'default is'
union all select 'a threshold on a measure the question does not show', platform.drill_def__ledger_suite_probe() || '{"views":[{"key":"v","label":"V","question":{"by":["person"],"show":["calls"],"having":[{"measure":"cost","op":">=","value":1}]}}]}', 'must also be shown'
union all select 'a share of the total of a ratio', platform.drill_def__ledger_suite_probe() || '{"views":[{"key":"v","label":"V","question":{"by":["person"],"show":["cost_per_request"],"having":[{"measure":"cost_per_request","op":">=","share_of_total":10}]}}]}', 'adds up across groups'
union all select 'a stale line on a fact that keeps no watermark', (platform.drill_def__ledger_suite_probe()) || '{"fact":"ai_usage_hourly_watermark","stale_after_knob":"drill.usage.stale_after_minutes"}', 'nothing to measure'
union all select 'a definer override of an ordinary table', '{"key":"agent","label":"Agents","fact":"agent","mode":"definer","lanes":["platform"],"lane_rules":{"platform":{"rule":"super_admin"}},"dimensions":[],"measures":[{"key":"count","label":"n","op":"count"}]}', 'keeps that table''s own row security';
select pg_temp.chk(format('C2 the validator names: %s', name),
  exists (select 1 from unnest(platform.drill_definition_problems(def)) p where p like '%' || needle || '%'),
  array_to_string(platform.drill_definition_problems(def), ' | '))
  from dlbad;
select pg_temp.chk('C3 a definer definition over a System fact of its own token (the records view, for lane DRILL-CALLS) is sound',
  cardinality(platform.drill_definition_problems('{"key":"ai_usage_executions","label":"AI usage by execution","fact":"ai_usage_executions","mode":"definer","lanes":["platform","organization","mine"],
     "lane_rules":{"platform":{"rule":"super_admin"},"organization":{"column":"organization_id","rule":"admin"},"mine":{"column":"person_id"}},
     "dimensions":[{"key":"conversation","label":"Conversation","from":"conversation_id","kind":"relation","relation":{"token":"cx_conversation"}},{"key":"session","label":"Sign-in session","from":"session_id","kind":"text","cardinality":"high"},
                   {"key":"at","label":"When","from":"bucket","kind":"time","grains":["day","hour"]},{"key":"ten_minutes","label":"Ten minutes","from":"bucket_10m","kind":"time","grains":["hour"]},{"key":"nothing_back","label":"Got nothing back","from":"got_nothing_back","kind":"boolean"}],
     "measures":[{"key":"cost","label":"Cost","op":"sum","of":"cost","unit":"usd"},{"key":"calls","label":"Executions","op":"count"},{"key":"iterations","label":"Iterations","op":"sum","of":"iterations"}]}'::jsonb)) = 0);

do $$
declare
  c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_src jsonb := '{"kind":"entity","token":"ledger_suite_probe"}';
  v_w jsonb := jsonb_build_object('key', 'at', 'from', (select last_hour from pg_temp.dlt) - interval '30 days', 'to', now());
  v_rows jsonb; v_bad integer; v_total numeric; v_sum numeric; v_d jsonb; v_says text; v_n integer; v_oracle text[]; v_shown text[];
  v_spikes integer; v_wm timestamptz := (select covered_to from runtime._ai_usage_hourly_watermark);
begin
  -- the oracles, read as the platform before the seat is taken
  select array_agg(p order by p) into v_oracle from (
    select coalesce(h.person_id::text, '') as p, sum(h.cost) c from runtime._ai_usage_hourly h
     where h.bucket >= (v_w ->> 'from')::timestamptz and h.bucket < (v_w ->> 'to')::timestamptz group by h.person_id) s
   where c >= 0.20 * (select sum(cost) from runtime._ai_usage_hourly h where h.bucket >= (v_w ->> 'from')::timestamptz and h.bucket < (v_w ->> 'to')::timestamptz);
  select count(*) into v_spikes from (
    select date_trunc('hour', h.bucket) b, sum(h.cost) c from runtime._ai_usage_hourly h
     where h.bucket >= (v_w ->> 'from')::timestamptz and h.bucket < (v_w ->> 'to')::timestamptz group by 1) s
   where c > 3 * (select percentile_cont(0.5) within group (order by c2) from (
       select sum(h.cost) c2 from runtime._ai_usage_hourly h
        where h.bucket >= (v_w ->> 'from')::timestamptz and h.bucket < (v_w ->> 'to')::timestamptz group by date_trunc('hour', h.bucket) having sum(h.cost) > 0) m);

  perform set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';

  -- describe carries the built-in Saved views, the findings, the records and the stale line
  v_d := platform.drill_describe(c_aimatrx, '{"kind":"entity","token":"ai_usage"}');
  perform pg_temp.chk('C4 describe: ai_usage says its records (columns and labels) and its stale line; the probe its Saved views and findings; an invoker table says no stale line',
    v_d -> 'records' ->> 'fact' = 'ai_usage_executions' and jsonb_array_length(v_d -> 'records' -> 'columns') > 5
    and v_d -> 'records' -> 'labels' ->> 'model' = 'Request''s top model'
    and v_d ->> 'stale_after_knob' = 'drill.usage.stale_after_minutes'
    and jsonb_array_length(platform.drill_describe(c_aimatrx, v_src) -> 'views') = 1
    and jsonb_array_length(platform.drill_describe(c_aimatrx, v_src) -> 'findings') = 1
    and platform.drill_describe(c_aimatrx, '{"kind":"entity","token":"agent"}') ? 'stale_after_knob'
    and platform.drill_describe(c_aimatrx, '{"kind":"entity","token":"agent"}') ->> 'stale_after_knob' is null
    and not (v_d ? '_c'), v_d ->> 'stale_after_knob');

  -- ratio: every group, Other and the total are recomputed from their own parts
  select jsonb_agg(to_jsonb(a)) into v_rows from platform.drill_ask(c_aimatrx, v_src,
    jsonb_build_object('lane', 'platform', 'by', '["provider"]'::jsonb, 'show', '["cost","requests","tokens_in","tokens_out","cost_per_request","tokens_per_request"]'::jsonb, 'window', v_w, 'limit', 2)) a;
  select count(*) into v_bad from jsonb_array_elements(v_rows) x
   where (x -> 'measures' ->> 'cost_per_request')::numeric is distinct from
         case when (x -> 'measures' ->> 'requests')::numeric = 0 then null else (x -> 'measures' ->> 'cost')::numeric / (x -> 'measures' ->> 'requests')::numeric end
      or (x -> 'measures' ->> 'tokens_per_request')::numeric is distinct from
         case when (x -> 'measures' ->> 'requests')::numeric = 0 then null else ((x -> 'measures' ->> 'tokens_in')::numeric + (x -> 'measures' ->> 'tokens_out')::numeric) / (x -> 'measures' ->> 'requests')::numeric end;
  perform pg_temp.chk('C5 ratio measures: each group, Other and the total = the sum of its parts over its own rows (never an average of averages)',
    v_bad = 0 and exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'other') and jsonb_array_length(v_rows) >= 4,
    format('%s rows differ of %s', v_bad, jsonb_array_length(v_rows)));

  -- having, share of the total through the finding's setting (20%): the groups shown = the oracle's,
  -- and the shown groups + Other still add up to the whole window
  select jsonb_agg(to_jsonb(a)) into v_rows from platform.drill_ask(c_aimatrx, v_src,
    (platform.drill_describe(c_aimatrx, v_src) -> 'findings' -> 0 -> 'question') || jsonb_build_object('lane', 'platform', 'window', v_w)) a;
  select array_agg(coalesce(x ->> 'person', '') order by coalesce(x ->> 'person', '')) into v_shown from (select x -> 'groups' as x from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'group') s;
  select sum((x -> 'measures' ->> 'cost')::numeric) filter (where x ->> 'kind' in ('group', 'other')),
         max((x -> 'measures' ->> 'cost')::numeric) filter (where x ->> 'kind' = 'total'),
         max(x ->> 'says') filter (where x ->> 'kind' = 'total')
    into v_sum, v_total, v_says from jsonb_array_elements(v_rows) x;
  perform pg_temp.chk('C6 having share_of_total through its setting: the groups shown = the oracle''s (≥ 20% of the window), groups + Other = total, and the answer says how many met the rule',
    coalesce(v_shown, '{}') = coalesce(v_oracle, '{}') and v_sum = v_total and v_says like '%meet the rule%',
    format('shown %s oracle %s; %s', v_shown, v_oracle, v_says));

  -- the setting decides: an organization moving the line to 1% moves the answer
  execute 'reset role';
  update platform.feature_knob set value = '1' where feature = 'drill.finding.ledger_suite_probe.hogs' and key = 'hog_share_pct';
  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_aimatrx, v_src,
    (platform.drill_describe(c_aimatrx, v_src) -> 'findings' -> 0 -> 'question') || jsonb_build_object('lane', 'platform', 'window', v_w)) a where a.kind = 'group';
  perform pg_temp.chk('C7 the finding''s line is its setting: at 1% more people meet it than at 20%',
    v_n > coalesce(cardinality(v_shown), 0), format('%s at 1%% vs %s at 20%%', v_n, coalesce(cardinality(v_shown), 0)));

  -- having × the median (above zero) and an absolute value, applied before the limit
  select jsonb_agg(to_jsonb(a)) into v_rows from platform.drill_ask(c_aimatrx, v_src,
    jsonb_build_object('lane', 'platform', 'by', '["at:hour"]'::jsonb, 'show', '["cost"]'::jsonb, 'window', v_w, 'limit', 3,
                       'having', '[{"measure":"cost","op":">","times_median":3,"median_nonzero":true}]'::jsonb)) a;
  v_n := v_spikes;
  perform pg_temp.chk('C8 having × the median group above zero: distinct_groups = the oracle''s spiking hours, at most the limit shown, groups + Other = total',
    (select max((x ->> 'distinct_groups')::bigint) from jsonb_array_elements(v_rows) x) = v_n
    and (select count(*) from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'group') = least(v_n, 3)
    and (select sum((x -> 'measures' ->> 'cost')::numeric) filter (where x ->> 'kind' in ('group', 'other')) = max((x -> 'measures' ->> 'cost')::numeric) filter (where x ->> 'kind' = 'total') from jsonb_array_elements(v_rows) x),
    format('oracle %s spiking hours', v_n));
  select max(a.says) into v_says from platform.drill_ask(c_aimatrx, v_src,
    jsonb_build_object('lane', 'platform', 'by', '["person"]'::jsonb, 'show', '["cost"]'::jsonb, 'window', v_w,
                       'having', '[{"measure":"cost","op":">=","value":1000000000}]'::jsonb)) a where a.kind = 'total';
  perform pg_temp.chk('C9 a rule no group meets says so ("No group meets the rule")', v_says like 'No group meets the rule%', v_says);

  -- the built-in Saved view answers as written
  perform pg_temp.chk('C10 the built-in Saved view is asked as it is',
    exists (select 1 from platform.drill_ask(c_aimatrx, v_src, (platform.drill_describe(c_aimatrx, v_src) -> 'views' -> 0 -> 'question') || '{"lane":"platform"}') a where a.kind = 'group'));

  -- as_of: a definer summary says its moment; a table counted live says none
  perform pg_temp.chk('C11 as_of: the usage answer says the watermark; an invoker table''s answer says none',
    (select bool_and(a.as_of = v_wm) from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_usage"}', '{"lane":"platform","by":["provider"],"show":["cost"]}') a)
    and (select bool_and(a.as_of is null) from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"agent"}', '{"lane":"platform"}') a));
  execute 'reset role';
end $$;

-- the settings and their one resolver
do $$
declare v_state text;
begin
  perform pg_temp.chk('K1 the three drill settings resolve to their defaults (20 minutes, top 10, 80%)',
    platform.drill_knob('5dc930e9-bd65-44a1-8369-af773f6e1a5b', 'drill.usage.stale_after_minutes') = 20
    and platform.drill_knob('5dc930e9-bd65-44a1-8369-af773f6e1a5b', 'drill.chart.top_n') = 10
    and platform.drill_knob('5dc930e9-bd65-44a1-8369-af773f6e1a5b', 'drill.pareto.share_pct') = 80);
  begin perform platform.drill_knob(null, 'seo.gsc.daily_cap'); v_state := 'answered';
  exception when invalid_parameter_value then v_state := '22023'; end;
  perform pg_temp.chk('K2 the resolver reads only drill settings (another feature''s is refused, 22023)', v_state = '22023', v_state);
  begin perform platform.drill_knob(null, 'drill.finding.nobody.nothing.line'); v_state := 'answered';
  exception when others then v_state := sqlstate; end;
  perform pg_temp.chk('K3 a setting that is not registered RAISES (never a silent constant)', v_state <> 'answered', v_state);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- F. workflow._run_cost: one row per run, what its requests spent, from the same ledger.
-- ════════════════════════════════════════════════════════════════════════════════════════════
select pg_temp.chk('F1 workflow._run_cost is one row per run and its cost = the ledger''s cost of the run''s requests',
  (select count(*) from workflow._run_cost) = (select count(distinct run_id) from workflow._run_cost)
  and (select coalesce(sum(cost), 0) from workflow._run_cost)
      = (select coalesce(sum(e.cost), 0) from runtime.global_execution e join chat.user_request ur on ur.id = e.request_id where ur.workflow_run_id is not null)
  and (select count(*) from workflow._run_cost c left join workflow.run r on r.id = c.run_id where r.id is null) = 0,
  format('%s runs, $%s', (select count(*) from workflow._run_cost), (select sum(cost) from workflow._run_cost)))
  where to_regclass('workflow._run_cost') is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- L. A COST THAT LANDS AFTER THE COUNT (VERIFY-DRILL-LEDGER-RECORDS F1 / attack A7): the number and
--    its records are equal as of the count, and any difference is SAID — then a rebuild brings them
--    back equal.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dll (step text, page jsonb, ask numeric) on commit drop;
grant all on dll to authenticated;
create or replace function pg_temp.late_page(p_step text, p_org uuid, p_w jsonb) returns void language plpgsql as $$
begin
  insert into pg_temp.dll
  select p_step,
         platform.drill_rows(p_org, '{"kind":"entity","token":"ai_usage"}', jsonb_build_object('lane', 'mine', 'window', p_w, 'limit', 5)),
         (select (a.measures ->> 'cost')::numeric from platform.drill_ask(p_org, '{"kind":"entity","token":"ai_usage"}',
            jsonb_build_object('lane', 'mine', 'show', '["cost","calls"]'::jsonb, 'window', p_w)) a where a.kind = 'total');
end $$;
grant execute on function pg_temp.late_page(text, uuid, jsonb) to authenticated;
do $$
declare
  c_test constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_w jsonb := jsonb_build_object('key', 'at', 'from', (select last_hour from pg_temp.dlt) - interval '3 days', 'to', (select last_hour from pg_temp.dlt) + interval '1 hour');
  v_org uuid; v_exec uuid; v_before jsonb; v_after jsonb; v_healed jsonb;
begin
  select c.organization_id, c.execution_id into v_org, v_exec from runtime._ai_usage_calls c
   where c.person_id = c_test and c.created_at >= (v_w ->> 'from')::timestamptz and c.created_at < (v_w ->> 'to')::timestamptz
   order by c.created_at desc limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  perform pg_temp.late_page('before', v_org, v_w);
  execute 'reset role';
  update runtime.global_execution set cost = coalesce(cost, 0) + 1.2345 where id = v_exec;   -- the cost lands after the count
  execute 'set local role authenticated';
  perform pg_temp.late_page('late', v_org, v_w);
  execute 'reset role';
  perform runtime.ai_usage_hourly_refresh(now() - interval '5 days', now());                 -- the next rebuild
  execute 'set local role authenticated';
  perform pg_temp.late_page('recounted', v_org, v_w);
  execute 'reset role';
  select page into v_before from pg_temp.dll where step = 'before';
  select page into v_after from pg_temp.dll where step = 'late';
  select page into v_healed from pg_temp.dll where step = 'recounted';
  perform pg_temp.chk('L1 before a late cost the records page carries the number''s own sums (counted) = the records'' sums = the answer, and says nothing',
    (v_before -> 'counted' ->> 'cost')::numeric = (v_before -> 'measures' ->> 'cost')::numeric
    and (v_before -> 'counted' ->> 'cost')::numeric = (select ask from pg_temp.dll where step = 'before')
    and not (v_before ? 'settling') and not (v_before ? 'says'),
    format('counted %s records %s', v_before -> 'counted' ->> 'cost', v_before -> 'measures' ->> 'cost'));
  perform pg_temp.chk('L2 a cost that lands after the count: the number still = counted, the records = the ledger now, and the page SAYS the difference ("$1.23 more has landed since the count at HH:MI UTC")',
    (v_after -> 'counted' ->> 'cost')::numeric = (select ask from pg_temp.dll where step = 'late')
    and (v_after -> 'measures' ->> 'cost')::numeric - (v_after -> 'counted' ->> 'cost')::numeric = 1.2345
    and (v_after -> 'settling' -> 'cost' ->> 'difference')::numeric = 1.2345
    and v_after ->> 'says' ~ '^\$1\.23 more has landed since the count at [0-9]{2}:[0-9]{2} UTC\.',
    v_after ->> 'says');
  perform pg_temp.chk('L3 the next rebuild brings them back equal: nothing to say, counted = records = the answer, and the answer took the late cost',
    (v_healed -> 'counted' ->> 'cost')::numeric = (v_healed -> 'measures' ->> 'cost')::numeric
    and (v_healed -> 'counted' ->> 'cost')::numeric = (select ask from pg_temp.dll where step = 'recounted')
    and (select ask from pg_temp.dll where step = 'recounted') - (select ask from pg_temp.dll where step = 'before') = 1.2345
    and not (v_healed ? 'settling'),
    format('before %s after the recount %s', (select ask from pg_temp.dll where step = 'before'), (select ask from pg_temp.dll where step = 'recounted')));
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- G. No client reaches the two text helpers (VERIFY-DRILL-LEDGER-RECORDS F3).
-- ════════════════════════════════════════════════════════════════════════════════════════════
select pg_temp.chk('G1 platform._drill_ratio_sql and platform._drill_question_problems: no EXECUTE for public, anon or authenticated',
  not has_function_privilege('authenticated', 'platform._drill_ratio_sql(jsonb,text,text)', 'execute')
  and not has_function_privilege('anon', 'platform._drill_ratio_sql(jsonb,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'platform._drill_question_problems(jsonb,jsonb,text)', 'execute')
  and not has_function_privilege('anon', 'platform._drill_question_problems(jsonb,jsonb,text)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(detail, 300) as detail from pg_temp.dlr order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.dlr;
rollback;
