-- DRILL-STANDARD-DOOR — the green suite for migrations/campaign/drillstd_one_door_answers_every_table.sql
--
-- Run on the DEV CLONE (never production: section G creates and rolls back a planted function):
--   psql "<clone dsn>" -v plant=none -f scripts/campaign-tests/drillstd_green.sql
-- Plants prove each guard can go red (every plant is a string swap of a live body INSIDE this
-- rolled-back transaction — no file is ever mutated):
--   -v plant=nolane   the organization lane's narrowing removed        -> A goes RED
--   -v plant=nocap    groups past the cap no longer fold into Other     -> B goes RED
--   -v plant=noguard  the definer-lane rule check removed               -> G goes RED
--
-- Seats: test@test.com (non-admin, 4060701e-…) and admin@admin.com (87a6e699-…), each by
-- `set local role authenticated` + request.jwt.claims — the seat PostgREST gives them. The
-- oracle for every number is a plain SELECT run AS THE SAME SEAT (what she can open), never
-- as the superuser. One REPEATABLE READ snapshot, so a peer writing on the shared clone cannot
-- move a number between the door and its oracle. Everything is rolled back.

\set ON_ERROR_STOP 1
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '1200s';
set local lock_timeout = '120s';
set local client_min_messages = warning;
drop table if exists pg_temp.d1r;
create temp table d1r (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.d1r(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
select set_config('d1.plant', :'plant', true);

-- ── PLANTS ────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v text; w text;
  p text := current_setting('d1.plant');
begin
  if p = 'nolane' then
    v := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(v, $x$v_preds := v_preds || format('%I.%I = ($1->>''org'')::uuid', v_col ->> 'alias', v_col ->> 'column');$x$, 'null;');
  elsif p = 'nocap' then
    v := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(v, $x$case when br.rn <= ($1->>''cap'')::integer then br.gk end as gk, (br.rn > ($1->>''cap'')::integer) as is_other$x$, 'br.gk as gk, false as is_other');
  elsif p = 'noguard' then
    v := pg_get_functiondef('platform.drill_definition_problems(jsonb)'::regprocedure);
    w := replace(v, $x$if v_rule is null or jsonb_typeof(v_rule) <> 'object' then$x$, 'if false then');
  elsif p <> 'none' then
    raise exception 'unknown plant %', p;
  end if;
  if p <> 'none' then
    if w = v then raise exception 'plant % did not apply: the body it swaps has moved', p; end if;
    execute w;
    raise warning 'PLANT % applied', p;
  end if;
end $$;

-- ── A. LEAKAGE: her total = the rows she can open, in every organization she belongs to ────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  o uuid; src text; q jsonb; v_ask bigint; v_plain bigint; v_rows bigint; v_fail text[] := '{}'; v_n integer := 0;
  v_orgs uuid[];
  v_state text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select array_agg(x) into v_orgs from iam.my_orgs() x;
  foreach o in array v_orgs loop
    foreach src in array array['agent', 'agents_by_model'] loop
      foreach q in array array['{"by":[]}'::jsonb, '{"by":[],"where":{"agent_type":"user"}}'::jsonb,
                               '{"by":[],"window":{"key":"created_at","from":"2026-09-01","to":"2026-09-20"}}'::jsonb] loop
        v_n := v_n + 1;
        select (measures ->> 'count')::bigint into v_ask
          from platform.drill_ask(o, jsonb_build_object('kind', 'entity', 'token', src), q || '{"show":["count"]}') where kind = 'total';
        v_rows := (platform.drill_rows(o, jsonb_build_object('kind', 'entity', 'token', src), q - 'by' || '{"limit":1}') ->> 'total')::bigint;
        select count(*) into v_plain from agent.definition t
         where t.organization_id = o and t.deleted_at is null
           and (not (q -> 'where') ? 'agent_type' or t.agent_type = 'user')
           and (not q ? 'window' or (t.created_at >= '2026-09-01'::timestamptz and t.created_at < '2026-09-20'::timestamptz));
        if v_ask is distinct from v_plain or v_rows is distinct from v_plain then
          v_fail := v_fail || format('%s/%s/%s ask=%s rows=%s plain=%s', o, src, q, v_ask, v_rows, v_plain);
        end if;
      end loop;
    end loop;
  end loop;
  -- her own lane: every agent she made, anywhere
  select (measures ->> 'count')::bigint into v_ask
    from platform.drill_ask('8cb71c8b-5b49-4563-a5fe-d77ff600f8ee', '{"kind":"entity","token":"agent"}', '{"by":[],"lane":"mine"}') where kind = 'total';
  select count(*) into v_plain from agent.definition where created_by = c_me and deleted_at is null;
  -- an organization she is not in, whose public rows she CAN read: refused by name
  begin
    perform platform.drill_ask('39c38960-d30c-4840-b0c1-c9960de95582', '{"kind":"entity","token":"agent"}', '{"by":[]}');
    v_state := 'answered';
  exception when others then v_state := sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.chk('A1 leakage: ask total = rows total = her plain count, every organization of hers x 2 sources x 3 questions',
                      cardinality(v_fail) = 0 and v_n >= 6, format('%s checks over %s organizations; %s', v_n, cardinality(v_orgs), array_to_string(v_fail, ' | ')));
  perform pg_temp.chk('A2 mine lane = the rows she made', v_ask = v_plain, format('ask=%s plain=%s', v_ask, v_plain));
  perform pg_temp.chk('A3 an organization she is not a member of is refused (42501)', v_state = '42501', v_state);
end $$;

do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_state text; v_bad bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"agent"}', '{"by":[],"lane":"platform"}');
    v_state := 'answered';
  exception when others then v_state := sqlstate;
  end;
  -- labels: every provider label she is shown is the name she can read on ai.provider
  select count(*) into v_bad
    from platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"agents_by_model"}', '{"by":["provider"],"show":["count"]}') a
   where a.kind = 'group' and a.groups ->> 'provider' is not null
     and (a.labels ->> 'provider') is distinct from (select p.name from ai.provider p where p.id = (a.groups ->> 'provider')::uuid);
  execute 'reset role';
  perform pg_temp.chk('A4 the platform lane is refused to a member (42501)', v_state = '42501', v_state);
  perform pg_temp.chk('A5 every relation label is the name the seat reads on the target', v_bad = 0, format('%s wrong', v_bad));
end $$;

-- admin@admin.com: the platform lane only inside the admin apps, and never "mine" there
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_out text; v_in bigint; v_plain bigint; v_mine text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  begin
    perform platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"agent"}', '{"by":[],"lane":"platform"}');
    v_out := 'answered';
  exception when others then v_out := sqlstate;
  end;
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  select (measures ->> 'count')::bigint into v_in
    from platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"agent"}', '{"by":[],"lane":"platform"}') where kind = 'total';
  select count(*) into v_plain from agent.definition where deleted_at is null;
  begin
    perform platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"agent"}', '{"by":[],"lane":"mine"}');
    v_mine := 'answered';
  exception when others then v_mine := sqlstate;
  end;
  perform set_config('request.headers', '{}', true);
  execute 'reset role';
  perform pg_temp.chk('A6 admin outside the admin apps: platform lane refused', v_out = '42501', v_out);
  perform pg_temp.chk('A7 admin inside the admin apps: platform lane = every row the admin lane opens', v_in = v_plain, format('ask=%s plain=%s', v_in, v_plain));
  perform pg_temp.chk('A8 admin inside the admin apps never counts as herself', v_mine = '22023', v_mine);
end $$;

-- ── B. CARDINALITY: shown groups + Other = total; Other and distinct are the truth ─────────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_rows jsonb; v_top text[]; v_total bigint; v_sum bigint; v_other jsonb; v_distinct bigint;
  v_o_count bigint; v_o_people bigint; v_o_models bigint; v_true_distinct bigint; v_says text; v_ngroups integer;
  v_t_people bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select jsonb_agg(to_jsonb(a)) into v_rows
    from platform.drill_ask(c_org, '{"kind":"entity","token":"agents_by_model"}', '{"by":["model"],"show":["count","people","models"],"limit":3}') a;
  select array_agg(x -> 'groups' ->> 'model'), sum((x -> 'measures' ->> 'count')::bigint), count(*)
    into v_top, v_sum, v_ngroups from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'group';
  select x -> 'measures' into v_other from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'other';
  select (x -> 'measures' ->> 'count')::bigint, (x ->> 'distinct_groups')::bigint, x ->> 'says', (x -> 'measures' ->> 'people')::bigint
    into v_total, v_distinct, v_says, v_t_people from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'total';
  -- the oracle, as the same seat: the rows of the models NOT shown
  select count(*), count(distinct t.created_by), count(distinct t.model_id)
    into v_o_count, v_o_people, v_o_models
    from agent.definition t left join ai.model_definition m on m.id = t.model_id
   where t.organization_id = c_org and t.deleted_at is null
     and not (coalesce(m.id::text, '(none)') = any (select coalesce(x, '(none)') from unnest(v_top) x));
  select count(distinct m.id) + max(case when m.id is null then 1 else 0 end) into v_true_distinct
    from agent.definition t left join ai.model_definition m on m.id = t.model_id
   where t.organization_id = c_org and t.deleted_at is null;
  execute 'reset role';
  perform pg_temp.chk('B1 cap: exactly the cap is shown', v_ngroups = 3, format('%s groups', v_ngroups));
  perform pg_temp.chk('B2 shown + Other = total (count)', v_sum + (v_other ->> 'count')::bigint = v_total,
                      format('shown %s + other %s = total %s', v_sum, v_other ->> 'count', v_total));
  perform pg_temp.chk('B3 Other''s non-additive measures are computed from its own rows', (v_other ->> 'people')::bigint = v_o_people and (v_other ->> 'models')::bigint = v_o_models and (v_other ->> 'count')::bigint = v_o_count,
                      format('door people=%s models=%s count=%s oracle %s %s %s', v_other ->> 'people', v_other ->> 'models', v_other ->> 'count', v_o_people, v_o_models, v_o_count));
  perform pg_temp.chk('B4 distinct = the true number of groups', v_distinct = v_true_distinct, format('door %s oracle %s', v_distinct, v_true_distinct));
  perform pg_temp.chk('B5 the total row says the cut in words', v_says ~ 'Other', v_says);
end $$;

-- ── C. PIVOT: cells, row totals, column totals and the grand total equal plain GROUP BYs ──
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_tz text;
  v_bad bigint; v_cells bigint; v_rowt bigint; v_colt bigint; v_grand bigint; v_plain bigint;
begin
  v_tz := custom.agg_calendar(c_org) ->> 'time_zone';
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  create temp table d1piv on commit drop as
    select a.* from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}', '{"by":["agent_type","is_active"],"across":"created_at:month","show":["count"]}') a;
  create temp table d1orc on commit drop as
    select x.agent_type, x.is_active, x.mon, grouping(x.agent_type) as g_by, grouping(x.mon) as g_m, count(*) n
      from (select t.agent_type, t.is_active, to_char(date_trunc('month', t.created_at at time zone v_tz), 'YYYY-MM-DD"T"HH24:MI:SS') as mon
              from agent.definition t where t.organization_id = c_org and t.deleted_at is null) x
     group by grouping sets ((x.agent_type, x.is_active, x.mon), (x.agent_type, x.is_active), (x.mon), ());
  select count(*) into v_bad from d1piv p
   where p.kind in ('group', 'total')
     and (p.measures ->> 'count')::bigint is distinct from (
       select o.n from d1orc o
        where (o.g_by = 0) = (p.groups ? 'agent_type') and (o.g_m = 0) = (p.groups ? 'created_at:month')
          and o.agent_type is not distinct from (p.groups ->> 'agent_type')
          and o.is_active is not distinct from (p.groups ->> 'is_active')::boolean
          and o.mon is not distinct from left(p.groups ->> 'created_at:month', 19));
  select count(*) into v_cells from d1orc;
  if (select count(*) from d1piv where kind in ('group', 'total')) <> v_cells then
    v_bad := v_bad + 1000000;
  end if;
  select count(*) filter (where kind = 'group' and groups ? 'created_at:month'), count(*) filter (where kind = 'group' and not groups ? 'created_at:month'),
         count(*) filter (where kind = 'total' and groups ? 'created_at:month'), max((measures ->> 'count')::bigint) filter (where kind = 'total' and groups = '{}')
    into v_cells, v_rowt, v_colt, v_grand from d1piv;
  select count(*) into v_plain from agent.definition t where t.organization_id = c_org and t.deleted_at is null;
  execute 'reset role';
  perform pg_temp.chk('C1 every pivot cell, row total and column total = a plain GROUP BY as the seat', v_bad = 0,
                      format('%s wrong of %s cells, %s row totals, %s column totals', v_bad, v_cells, v_rowt, v_colt));
  perform pg_temp.chk('C2 the grand total = her plain count', v_grand = v_plain, format('%s vs %s', v_grand, v_plain));
end $$;

-- ── D. COMPARE: both windows counted in the organization's calendar ────────────────────────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_row record; v_c bigint; v_p bigint; v_bad bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into v_row from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}',
      '{"by":["created_at:week"],"show":["count"],"compare":{"against":"previous_period","period":"month","at":"2026-09-15"}}') a where a.kind = 'total';
  select count(*) into v_c from agent.definition t where t.organization_id = c_org and t.deleted_at is null
     and t.created_at >= (v_row.compare -> 'window' ->> 'from')::timestamptz and t.created_at < (v_row.compare -> 'window' ->> 'to')::timestamptz;
  select count(*) into v_p from agent.definition t where t.organization_id = c_org and t.deleted_at is null
     and t.created_at >= (v_row.compare -> 'prior_window' ->> 'from')::timestamptz and t.created_at < (v_row.compare -> 'prior_window' ->> 'to')::timestamptz;
  -- every week of both windows = its own plain count
  select count(*) into v_bad
    from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}',
      '{"by":["created_at:week"],"show":["count"],"compare":{"against":"previous_period","period":"month","at":"2026-09-15"}}') a
   where a.kind = 'group'
     and ((a.groups is not null and a.row_count <> (select count(*) from agent.definition t where t.organization_id = c_org and t.deleted_at is null
              and t.created_at >= greatest((a.groups ->> 'created_at:week')::timestamptz, (a.compare -> 'window' ->> 'from')::timestamptz)
              and t.created_at < least((a.groups ->> 'created_at:week')::timestamptz + interval '7 days', (a.compare -> 'window' ->> 'to')::timestamptz)))
       or (a.prior_groups is not null and a.prior_row_count <> (select count(*) from agent.definition t where t.organization_id = c_org and t.deleted_at is null
              and t.created_at >= greatest((a.prior_groups ->> 'created_at:week')::timestamptz, (a.compare -> 'prior_window' ->> 'from')::timestamptz)
              and t.created_at < least((a.prior_groups ->> 'created_at:week')::timestamptz + interval '7 days', (a.compare -> 'prior_window' ->> 'to')::timestamptz))));
  execute 'reset role';
  perform pg_temp.chk('D1 compare: both window totals = plain counts', v_row.row_count = v_c and v_row.prior_row_count = v_p,
                      format('door %s/%s plain %s/%s', v_row.row_count, v_row.prior_row_count, v_c, v_p));
  perform pg_temp.chk('D2 compare: every week of both windows = its plain count', v_bad = 0, format('%s wrong', v_bad));
  perform pg_temp.chk('D3 compare: delta = current - prior', (v_row.delta -> 'count' ->> 'change')::bigint = v_c - v_p, v_row.delta::text);
end $$;

-- ── E. THE CALENDAR: the inlined period/label text = custom.agg_period_start/agg_local_label ─
do $$
declare
  g text; z text; w text; v_shift integer; v_sql text; v_bad bigint; v_total bigint := 0; v_fail text[] := '{}';
begin
  create temp table d1m on commit drop as
    select (timestamptz '2025-01-01 00:00:00+00' + (i * interval '97 minutes 13 seconds')) as m from generate_series(0, 12000) i;
  foreach z in array array['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Adelaide', 'America/St_Johns'] loop
    foreach w in array array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] loop
      v_shift := (8 - array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], w)) % 7;
      foreach g in array array['day','week','month','quarter','year'] loop
        v_sql := format('select count(*) from pg_temp.d1m x where %s is distinct from custom.agg_local_label(custom.agg_period_start(x.m at time zone %L, %L, %L), %L)',
                        platform._drill_label_sql(platform._drill_period_sql(platform._drill_local_sql('x.m', 'timestamp with time zone'), g, v_shift)),
                        z, g, w, z);
        execute v_sql into v_bad using jsonb_build_object('tz', z);
        v_total := v_total + 12001;
        if v_bad > 0 then v_fail := v_fail || format('%s/%s/%s: %s', z, w, g, v_bad); end if;
      end loop;
    end loop;
  end loop;
  perform pg_temp.chk('E1 calendar parity: period + label text = the store''s own functions', cardinality(v_fail) = 0,
                      format('%s moments x zone x week start x grain; %s', v_total, array_to_string(v_fail, ' | ')));
end $$;

-- ── F. INJECTION: a key carrying SQL is refused; a value carrying SQL is bound ─────────────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  q jsonb; v_state text; v_fail text[] := '{}'; v_n bigint; v_src jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach q in array array[
      '{"by":["agent_type) from agent.definition; select 1 --"]}'::jsonb,
      '{"by":["created_at:month'')--"]}'::jsonb,
      '{"across":"agent_type; drop table x"}'::jsonb,
      '{"show":[{"op":"sum","of":"version); select 1 --"}]}'::jsonb,
      '{"show":[{"op":"pg_sleep","of":"version"}]}'::jsonb,
      '{"sort":{"key":"1; select 1","direction":"desc"}}'::jsonb,
      '{"where":{"agent_type or 1=1":"user"}}'::jsonb,
      '{"where":{"organization_id":"x'' or ''1''=''1"}}'::jsonb,
      '{"window":{"key":"created_at","preset":"30d; select 1"}}'::jsonb,
      '{"lane":"platform'' or true --"}'::jsonb,
      '{"columns":["name, (select 1)"]}'::jsonb,
      '{"limit":"5; select 1"}'::jsonb] loop
    begin
      if q ? 'columns' then
        perform platform.drill_rows(c_org, '{"kind":"entity","token":"agent"}', q);
      else
        perform platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}', q);
      end if;
      v_state := 'answered';
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('22023', '22P02') then
      v_fail := v_fail || format('%s -> %s', q, v_state);
    end if;
  end loop;
  foreach v_src in array array['{"kind":"entity","token":"agent; select 1"}'::jsonb, '{"kind":"entity","token":"pg_catalog.pg_authid"}'::jsonb,
                               '{"kind":"sql","token":"x"}'::jsonb, '{"kind":"table","id":"x''; select 1"}'::jsonb] loop
    begin
      perform platform.drill_ask(c_org, v_src, '{}');
      v_state := 'answered';
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('22023', '42704') then v_fail := v_fail || format('%s -> %s', v_src, v_state); end if;
  end loop;
  -- a VALUE carrying SQL on a text column is bound: it simply matches nothing
  select row_count into v_n from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}',
         '{"by":[],"where":{"category":"x'' or ''1''=''1"}}') where kind = 'total';
  execute 'reset role';
  perform pg_temp.chk('F1 every key, operation, sort, lane, column, limit and source carrying SQL is refused (22023/42704)', cardinality(v_fail) = 0, array_to_string(v_fail, ' | '));
  perform pg_temp.chk('F2 a value carrying SQL is bound, never spliced (matches nothing)', v_n = 0, format('%s rows', v_n));
end $$;

-- ── G. THE DEFINER GUARD: a definition that reads past row security names every lane's rule ─
do $$
declare
  v_def jsonb := '{"key":"d1_planted","label":"Planted definer","grain":"one row per agent","fact":"agent","mode":"definer",
                   "lanes":["organization"],"dimensions":[{"key":"agent_type","label":"Kind","from":"agent_type","kind":"choice"}],
                   "measures":[{"key":"count","label":"Agents","op":"count"}]}';
  v_p text[]; v_p2 text[];
begin
  v_p := platform.drill_definition_problems(v_def);
  v_p2 := platform.drill_definition_problems(v_def || '{"lane_rules":{"organization":{"column":"organization_id","rule":"member"}},
            "joins":[{"as":"task","token":"task","from":"task_id"}]}');
  perform pg_temp.chk('G1 a definer definition without a lane rule is a problem', exists (select 1 from unnest(v_p) x where x ~ 'names no rule'), array_to_string(v_p, ' '));
  perform pg_temp.chk('G2 a definer join to a non-Reference table is a problem', exists (select 1 from unnest(v_p2) x where x ~ 'not Reference data'), array_to_string(v_p2, ' '));
  -- planted INSIDE this rolled-back transaction: the unsound one first
  execute format('create or replace function platform.drill_def__d1_planted() returns jsonb language sql immutable as %L',
                 format('select %L::jsonb', v_def));
end $$;

do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_state text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform platform.drill_ask('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '{"kind":"entity","token":"d1_planted"}', '{"by":[]}');
    v_state := 'answered';
  exception when others then v_state := sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.chk('G3 every door refuses the unsound definer definition (42P17)', v_state = '42P17', v_state);
end $$;

do $$
begin
  execute format('create or replace function platform.drill_def__d1_planted() returns jsonb language sql immutable as %L',
    format('select %L::jsonb', '{"key":"d1_planted","label":"Planted definer","grain":"one row per agent","fact":"agent","mode":"definer",
            "lanes":["organization"],"lane_rules":{"organization":{"column":"organization_id","rule":"member"}},
            "joins":[{"as":"model","token":"ai_model","from":"model_id"}],
            "dimensions":[{"key":"agent_type","label":"Kind","from":"agent_type","kind":"choice"},{"key":"model","label":"Model","from":"model.id","kind":"relation"}],
            "measures":[{"key":"count","label":"Agents","op":"count"}],
            "detail":{"columns":["name","agent_type"]}}'));
end $$;

do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_def_total bigint; v_seat bigint; v_rows jsonb; v_owner bigint;
begin
  select count(*) into v_owner from agent.definition t where t.organization_id = c_org and t.deleted_at is null;
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (measures ->> 'count')::bigint into v_def_total from platform.drill_ask(c_org, '{"kind":"entity","token":"d1_planted"}', '{"by":[]}') where kind = 'total';
  select count(*) into v_seat from agent.definition t where t.organization_id = c_org and t.deleted_at is null;
  v_rows := platform.drill_rows(c_org, '{"kind":"entity","token":"d1_planted"}', '{"limit":1}');
  execute 'reset role';
  perform pg_temp.chk('G4 a sound definer definition counts exactly its lane rule (every row of the organization)', v_def_total = v_owner,
                      format('door %s, every row of the organization %s, the seat opens %s', v_def_total, v_owner, v_seat));
  perform pg_temp.chk('G5 its records are still read AS THE SEAT, and say what they miss', (v_rows ->> 'total')::bigint = v_seat
                      and (v_seat = v_owner or (v_rows ->> 'says') ~ 'records you can open'), (v_rows - 'rows' - 'columns')::text);
end $$;

-- ── H. A CUSTOM TABLE: the door = custom.record_aggregate, as the seat ─────────────────────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';
  c_tbl constant uuid := 'b79ba573-fb65-46f9-be54-e37d11ee4206';
  v_a jsonb; v_b jsonb; v_c jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select jsonb_agg(jsonb_build_object('g', groups, 'm', measures, 'n', row_count) order by groups::text) into v_a
    from platform.drill_ask(c_org, jsonb_build_object('kind', 'table', 'id', c_tbl), '{"by":["status"],"show":["count","sum_duration_minutes"]}');
  select jsonb_agg(jsonb_build_object('g', groups, 'm', measures, 'n', row_count) order by groups::text) into v_b
    from custom.record_aggregate(c_org, c_tbl, '["status"]', '[{"op":"count"},{"op":"sum","key":"duration_minutes"}]');
  select jsonb_agg(groups) into v_c
    from platform.drill_ask(c_org, jsonb_build_object('kind', 'table', 'id', c_tbl), '{"by":["appointment_date:month"],"show":["count"]}');
  execute 'reset role';
  perform pg_temp.chk('H1 a custom Table through the door = custom.record_aggregate, row for row', v_a = v_b and v_a is not null, left(v_a::text, 200));
  perform pg_temp.chk('H2 a period group is keyed <field>:<grain>', v_c -> 0 ? 'appointment_date:month', left(v_c::text, 120));
end $$;

-- ── I. INFERENCE over every registered table: sound or refused by name; no row-access column ─
do $$
declare
  c record; v jsonb; v_ok integer := 0; v_ref integer := 0; v_other text[] := '{}'; v_bad text[] := '{}';
begin
  for c in select e.token from platform.entity_types e where e.is_active loop
    begin
      v := platform._drill_resolve('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', c.token);
      v_ok := v_ok + 1;
      if exists (select 1 from (select x ->> 'from' f from jsonb_array_elements(v -> 'dimensions') x
                                union all select x ->> 'of' from jsonb_array_elements(v -> 'measures') x) s
                  where f ~* ('visi' || 'bility') or f ~* '(shown_to|published_to_web|search_engine_indexed)' or f in ('custom_fields', 'metadata')) then
        v_bad := v_bad || c.token;
      end if;
    exception when others then
      if sqlerrm ~ 'is not offered for drilling' then v_ref := v_ref + 1; else v_other := v_other || (c.token || ': ' || left(sqlerrm, 80)); end if;
    end;
  end loop;
  perform pg_temp.chk('I1 every registered table infers or is refused by name', cardinality(v_other) = 0,
                      format('%s inferred, %s refused; %s', v_ok, v_ref, array_to_string(v_other, ' | ')));
  perform pg_temp.chk('I2 no inferred dimension or measure reads a row-access column', cardinality(v_bad) = 0, array_to_string(v_bad, ', '));
end $$;

-- ── K. TIMING (server side, as the seat, median of 3) ──────────────────────────────────────
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  t0 timestamptz; v_ms numeric[]; v_med numeric; v_lines text[] := '{}'; v_worst numeric := 0; i integer; w text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach w in array array['describe agent', 'ask agent by kind', 'ask agents_by_model by provider', 'ask agent pivot', 'rows agent'] loop
    v_ms := '{}';
    for i in 1..3 loop
      t0 := clock_timestamp();
      if w = 'describe agent' then perform platform.drill_describe(c_org, '{"kind":"entity","token":"agent"}');
      elsif w = 'ask agent by kind' then perform count(*) from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}', '{"by":["agent_type"]}');
      elsif w = 'ask agents_by_model by provider' then perform count(*) from platform.drill_ask(c_org, '{"kind":"entity","token":"agents_by_model"}', '{"by":["provider"],"show":["count","people","model_context"]}');
      elsif w = 'ask agent pivot' then perform count(*) from platform.drill_ask(c_org, '{"kind":"entity","token":"agent"}', '{"by":["agent_type"],"across":"created_at:month"}');
      else perform platform.drill_rows(c_org, '{"kind":"entity","token":"agent"}', '{"limit":50}');
      end if;
      v_ms := v_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
    end loop;
    select x into v_med from unnest(v_ms) x order by x offset 1 limit 1;
    v_worst := greatest(v_worst, v_med);
    v_lines := v_lines || format('%s %s ms', w, v_med);
  end loop;
  execute 'reset role';
  perform pg_temp.chk('K1 every door answers the seat under 1500 ms server side (median of 3)', v_worst < 1500, array_to_string(v_lines, '; '));
end $$;

-- ── THE VERDICT ────────────────────────────────────────────────────────────────────────────
\pset format aligned
\pset tuples_only off
select case when ok then 'PASS' else 'FAIL' end as verdict, name, left(coalesce(detail, ''), 260) as detail from pg_temp.d1r order by n;
select format('%s passed, %s failed (plant: %s)', count(*) filter (where ok), count(*) filter (where not ok), current_setting('d1.plant')) as summary from pg_temp.d1r;
rollback;
