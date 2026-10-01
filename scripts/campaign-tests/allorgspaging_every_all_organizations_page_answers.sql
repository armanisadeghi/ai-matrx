-- allorgspaging_every_all_organizations_page_answers.sql — lane ALL-ORGS-PAGING, 2026-10-01.
--
-- The class (DATA-HOME-3B2 found it in custom.archived_tables_everywhere): a door that, with no
-- organization named, asks EVERY organization for limit + offset rows in one page. Any page past
-- the door's per-organization ceiling is refused (22023 PAGE-1), and every page re-pays every
-- organization. Measured on the old bodies (clone, role authenticated):
--   work_list(null,'unassigned',true,100,500) -> "custom.work_list was asked for 600 rows ... at most 500"
--   work_inbox(null,50,200,true,'inbox')      -> "custom.work_inbox was asked for 250 rows ... at most 200"
--   work_list(null,'assigned',true,500,0)     -> 22P02 (a name typed into one record's Assignee)
--
-- What must hold, from the seat's own chair (admin@admin.com by default — 52 organizations on the
-- clone; -v seat=test@test.com is the member seat), for custom.work_list (mine | assigned |
-- unassigned, finished included) and custom.work_inbox (inbox, inbox+decided, snoozed, done):
--   A. No page is ever refused: offsets 0, 500, 1000, 5000 and a 1000-row page all answer.
--   B. One 1000-row call is EXACTLY the union of the same door asked organization by organization
--      (each walked to its end in 200-row pages): nothing more (no row her organizations' own
--      doors do not show her), nothing less (up to 1000).
--   C. Pages agree: 100-row pages walked to a short page (or 1000 rows) give the same ids in the
--      same order as the one call.
--   D. Budget, under the signed-in clock (statement_timeout 8 s, role authenticated): a 1000-row
--      call within 4000 ms, best of two — half the request timeout.
--
--   psql "<DSN>" -v ON_ERROR_STOP=1 [-v seat=test@test.com] -f scripts/campaign-tests/allorgspaging_every_all_organizations_page_answers.sql
-- Everything happens inside one rolled-back transaction; it writes nothing.

\set ON_ERROR_STOP on
\timing off

\set suite 'allorgspaging_every_all_organizations_page_answers.sql'
\if :{?seat}
\else
  \set seat 'admin@admin.com'
\endif
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin isolation level repeatable read;
set local statement_timeout = '10min';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = :'seat'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- The cases: one door, one shape of the question.
create temp table _case (k text primary key, door text, flav text, fin boolean, inc boolean, view text) on commit drop;
insert into _case values
  ('list mine',          'list',  'mine',       true, null, null),
  ('list assigned',      'list',  'assigned',   true, null, null),
  ('list unassigned',    'list',  'unassigned', true, null, null),
  ('inbox inbox',        'inbox', null, null, false, 'inbox'),
  ('inbox inbox+decided','inbox', null, null, true,  'inbox'),
  ('inbox snoozed',      'inbox', null, null, false, 'snoozed'),
  ('inbox done',         'inbox', null, null, false, 'done');

-- One call of a case as an ordered id list (null org = All organizations).
create or replace function pg_temp.ids(p_k text, p_org uuid, p_limit int, p_offset int) returns uuid[]
language plpgsql as $$
declare c record; v uuid[];
begin
  select * into c from _case where k = p_k;
  if c.door = 'list' then
    select coalesce(array_agg(x.record_id order by x.o), '{}') into v
      from custom.work_list(p_org, c.flav, c.fin, p_limit, p_offset) with ordinality x(record_id, table_id, table_name,
           title, assignee_id, assignee_name, assignee_user_id, due_on, due_state, status, terminal, assigned_by, updated_at, o);
  else
    select coalesce(array_agg(x.item_id order by x.ord), '{}') into v
      from custom.work_inbox(p_org, p_limit, p_offset, c.inc, c.view) with ordinality x(item_id, kind, origin, title,
           subject_id, subject_kind, summary, state, due_on, due_state, actionable, requested_by, requested_by_name, at,
           table_id, table_name, decided_by, decided_by_name, decided_at, outcome, snoozed_until, cleared_at,
           snoozed_count, cleared_count, undo_seconds, undo_refusal, ord);
  end if;
  return v;
end $$;

do $$ begin raise notice 'seat % holds % live organizations', current_setting('request.jwt.claims')::json ->> 'sub',
  (select count(*) from iam.organizations o where o.id in (select iam.my_orgs()) and o.archived_at is null); end $$;

-- THE ORACLE, as her: every organization asked through the same door with its name, walked to its end.
create temp table _expect (k text, id uuid) on commit drop;
do $$
declare c record; v_org uuid; v_at int; v_page uuid[];
begin
  for c in select * from _case loop
    for v_org in select o.id from iam.organizations o where o.id in (select iam.my_orgs()) and o.archived_at is null loop
      v_at := 0;
      begin
        loop
          v_page := pg_temp.ids(c.k, v_org, 200, v_at);
          insert into _expect select c.k, unnest(v_page);
          v_at := v_at + coalesce(array_length(v_page, 1), 0);
          exit when coalesce(array_length(v_page, 1), 0) < 200;
        end loop;
      exception when insufficient_privilege then
        continue;
      when others then
        raise exception 'B FAILED: % — the door asked for organization % alone refused: % (%)', c.k, v_org, sqlerrm, sqlstate;
      end;
    end loop;
  end loop;
end $$;

-- A. NO PAGE IS REFUSED.
do $$
declare c record; v_off int;
begin
  for c in select * from _case order by k loop
    foreach v_off in array array[0, 500, 1000, 5000] loop
      begin
        perform pg_temp.ids(c.k, null, case when c.door = 'list' then 100 else 50 end, v_off);
      exception when others then
        raise exception 'A FAILED: % — the All-organizations page at offset % was refused: % (%)', c.k, v_off, sqlerrm, sqlstate;
      end;
    end loop;
    begin
      perform pg_temp.ids(c.k, null, 1000, 0);
    exception when others then
      raise exception 'A FAILED: % — a 1000-row All-organizations page was refused: % (%)', c.k, sqlerrm, sqlstate;
    end;
  end loop;
  raise notice 'A passed: offsets 0, 500, 1000, 5000 and a 1000-row page answered for all 7 cases';
end $$;

-- B. ONE CALL = THE UNION OF EVERY ORGANIZATION'S OWN DOOR.
do $$
declare c record; v_one uuid[]; v_n int; v_got int; v_extra int; v_dup int;
begin
  for c in select * from _case order by k loop
    v_n := (select count(distinct id) from _expect e where e.k = c.k);
    v_one := pg_temp.ids(c.k, null, 1000, 0);
    v_got := coalesce(array_length(v_one, 1), 0);
    select count(*) into v_extra from unnest(v_one) u(id)
     where not exists (select 1 from _expect e where e.k = c.k and e.id = u.id);
    select count(*) - count(distinct id) into v_dup from unnest(v_one) u(id);
    if v_extra > 0 then
      raise exception 'B FAILED: % — % row(s) answered that no organization''s own door shows her', c.k, v_extra;
    end if;
    if v_dup > 0 then
      raise exception 'B FAILED: % — % row(s) answered twice', c.k, v_dup;
    end if;
    if v_got <> least(v_n, 1000) then
      raise exception 'B FAILED: % — one 1000-row call answered % rows; her organizations'' own doors hold %', c.k, v_got, v_n;
    end if;
    raise notice 'B passed: % — one call answered % of % rows, none outside her organizations'' doors', c.k, v_got, v_n;
  end loop;
end $$;

-- C. 100-ROW PAGES AGREE WITH THE ONE CALL.
do $$
declare c record; v_one uuid[]; v_all uuid[]; v_page uuid[]; v_off int;
begin
  for c in select * from _case order by k loop
    v_one := pg_temp.ids(c.k, null, 1000, 0);
    v_all := '{}'; v_off := 0;
    loop
      v_page := pg_temp.ids(c.k, null, 100, v_off);
      v_all := v_all || v_page;
      exit when coalesce(array_length(v_page, 1), 0) < 100 or v_off >= 900;
      v_off := v_off + 100;
    end loop;
    if v_all is distinct from v_one then
      raise exception 'C FAILED: % — 100-row pages (% rows) differ from the one call (% rows)',
        c.k, coalesce(array_length(v_all, 1), 0), coalesce(array_length(v_one, 1), 0);
    end if;
    raise notice 'C passed: % — % rows in 100-row pages, same ids in the same order as the one call', c.k, coalesce(array_length(v_all, 1), 0);
  end loop;
end $$;

-- D. A 1000-ROW CALL WITHIN 4000 MS UNDER THE SIGNED-IN 8 S CLOCK. One call per statement.
create temp table _t (k text, ms numeric) on commit drop;
create or replace function pg_temp.time1(p_k text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin
  perform pg_temp.ids(p_k, null, 1000, 0);
  insert into _t values (p_k, extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
set local statement_timeout = '8s';
select pg_temp.time1('list mine');
select pg_temp.time1('list mine');
select pg_temp.time1('list assigned');
select pg_temp.time1('list assigned');
select pg_temp.time1('list unassigned');
select pg_temp.time1('list unassigned');
select pg_temp.time1('inbox inbox');
select pg_temp.time1('inbox inbox');
select pg_temp.time1('inbox inbox+decided');
select pg_temp.time1('inbox inbox+decided');
select pg_temp.time1('inbox snoozed');
select pg_temp.time1('inbox snoozed');
select pg_temp.time1('inbox done');
select pg_temp.time1('inbox done');
set local statement_timeout = '10min';
do $$
declare r record;
begin
  for r in select k, round(min(ms)) as best from _t group by k order by k loop
    if r.best > 4000 then
      raise exception 'D FAILED: % — a 1000-row All-organizations call took % ms (budget 4000 ms, half the 8 s request timeout)', r.k, r.best;
    end if;
    raise notice 'D passed: % — best of two % ms', r.k, r.best;
  end loop;
end $$;

\echo 'GREEN'
rollback;
