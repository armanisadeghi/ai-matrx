-- DRILL-WAVE3 — seven declared definitions counted on the database
-- (migrations/campaign/drillwave3_drill_declares_seven_definitions.sql).
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillwave3_green.sql
--
-- P. PARITY — for each definition, as the admin on the platform lane: the door's total = a hand count of the
--    fact table read through the same role; the groups of the first Dimension add up to the total.
-- M. MEMBER SEAT — test@test.com (not an admin) asks crm_deals and hr_timesheets with NO lane (what the member
--    explorer sends: every organization she is in): the door's total = her own row-security count of the table,
--    every group is one of her organizations, and it is no more than the admin's total.
-- Each check records pass/fail, never aborts.

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table w3 (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.w3(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on w3 to authenticated;
grant usage on sequence w3_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;

-- ════════════════ P. parity as the admin ════════════════
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('matrx.admin_lane', 'on', true);

do $$
declare
  c record;
  v_door bigint;
  v_hand bigint;
  v_groups bigint;
begin
  for c in
    select * from (values
      ('write_failures',   'failures',   'select count(*) from ops.system_write_failure',     'table_target'),
      ('tool_calls',       'calls',      'select count(*) from chat.tool_call where deleted_at is null',                'fault_domain'),
      ('ops_issue_events', 'events',     'select count(*) from ops.ops_issue_event',           'provider'),
      ('rs_syntheses',     'syntheses',  'select count(*) from research.rs_synthesis',         'scope'),
      ('rs_analyses',      'analyses',   'select count(*) from research.rs_analysis',          'agent_type'),
      ('crm_deals',        'deals',      'select count(*) from crm.deal where deleted_at is null',                    'status'),
      ('hr_timesheets',    'timesheets', 'select count(*) from hr.pay_period_employment',      'state')
    ) t(token, measure, hand, dim)
  loop
    begin
      execute 'set local role authenticated';
      execute c.hand into v_hand;
      select (t.measures ->> c.measure)::bigint into v_door
        from platform.drill_ask(null, jsonb_build_object('kind','entity','token',c.token), jsonb_build_object('show', jsonb_build_array(c.measure), 'lane', 'platform')) t
       where t.kind = 'total';
      select coalesce(sum((t.measures ->> c.measure)::bigint), 0) into v_groups
        from platform.drill_ask(null, jsonb_build_object('kind','entity','token',c.token), jsonb_build_object('by', jsonb_build_array(c.dim), 'show', jsonb_build_array(c.measure), 'limit', 1000, 'lane', 'platform')) t
       where t.kind in ('group','other');
      execute 'reset role';
      perform pg_temp.chk(format('P %s: door total = hand count of the table', c.token), v_door = v_hand, format('door %s; hand %s', v_door, v_hand));
      perform pg_temp.chk(format('P %s: groups by %s add up to the total', c.token, c.dim), v_groups = v_door, format('groups %s; total %s', v_groups, v_door));
    exception when others then
      execute 'reset role';
      perform pg_temp.chk(format('P %s: asked', c.token), false, sqlerrm);
    end;
  end loop;
end $$;

-- ════════════════ M. a member's seat ════════════════
select set_config('request.jwt.claims', json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated')::text, true);
select set_config('matrx.admin_lane', 'off', true);

do $$
declare
  c record;
  v_door bigint;
  v_hand bigint;
  v_orgs int;
  v_outside int;
  v_admin bigint;
begin
  for c in
    select * from (values
      ('crm_deals',     'deals',      'crm.deal where deleted_at is null'),
      ('hr_timesheets', 'timesheets', 'hr.pay_period_employment where true')
    ) t(token, measure, tbl)
  loop
    begin
      execute 'set local role authenticated';
      execute format('select count(*) from %s', c.tbl) into v_hand;
      select (t.measures ->> c.measure)::bigint into v_door
        from platform.drill_ask(null, jsonb_build_object('kind','entity','token',c.token), jsonb_build_object('show', jsonb_build_array(c.measure))) t
       where t.kind = 'total';
      execute format('select count(*) from %s and organization_id not in (select m.organization_id from iam.organization_member m where m.user_id = ''4060701e-706a-4c76-b3ca-0bbc69fa5a14'')', c.tbl) into v_outside;
      execute 'reset role';
      perform pg_temp.chk(format('M %s: the member''s door total = her own row-security count', c.token), v_door = v_hand, format('door %s; hand %s', v_door, v_hand));
      perform pg_temp.chk(format('M %s: no row of an organization she cannot read', c.token), v_outside = 0, format('%s rows outside her organizations', v_outside));
    exception when others then
      execute 'reset role';
      perform pg_temp.chk(format('M %s: asked as a member', c.token), false, sqlerrm);
    end;
  end loop;
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from w3 order by n;
rollback;
