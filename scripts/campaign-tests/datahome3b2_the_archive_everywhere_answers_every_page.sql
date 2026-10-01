-- datahome3b2_the_archive_everywhere_answers_every_page.sql — lane DATA-HOME-3B2, 2026-10-01.
--
-- custom.archived_tables_everywhere (the data home's and the old hub's "Archived" section) answered
-- production 400 and 500 on 3 of ~12 walks:
--   400 = 22023 PAGE-1 "custom.read_records_archived was asked for 1200 rows": the door asked every
--         organization for limit + offset rows, so the page at offset 1000 asked past the store's
--         1000-row page ceiling and was refused (2026-10-01 10:03:49Z).
--   500 = 57014 statement timeout (8 s, role authenticated): every page paid every organization's
--         wall, mask and ladder again (52 organizations for admin, ~50 ms each), ~3 s a page on a
--         quiet database and over 8 s on a loaded one (2026-10-01 10:09:53Z-10:10:13Z, 6 in a row).
--
-- What must hold, from the seat's own chair (admin@admin.com by default; -v seat=test@test.com):
--   A. No page is ever refused: offsets 0, 800, 1000, 5000 and a 1000-row page all answer.
--   B. One call can hold the whole archive (up to the 1000-row page): the answer of
--      archived_tables_everywhere('org', 1000, 0) is EXACTLY the union of custom.read_records_archived
--      over every organization of hers (each page of it within that organization's ceiling) — same
--      ids, nothing more (the wall: no Table she cannot see), nothing less.
--   C. Pages agree: 200-row pages walked until a short page give the same ids in the same order.
--   D. Budget: a 1000-row call within 4000 ms (best of two) — half the 8 s statement_timeout of role
--      authenticated that cut the old body off; the old body took
--      ~3000 ms for ONE 200-row page (production mean 3291 ms). Measured after: 1.7-2.6 s.
--
--   psql "<DSN>" -v ON_ERROR_STOP=1 [-v seat=test@test.com] -f scripts/campaign-tests/datahome3b2_the_archive_everywhere_answers_every_page.sql
-- Read-only; everything happens inside one rolled-back transaction.

\set ON_ERROR_STOP on
\timing off

\set suite 'datahome3b2_the_archive_everywhere_answers_every_page.sql'
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

-- THE ORACLE, as her: every organization's own door, paged within its own ceiling.
set local role authenticated;
create temp table _expect (id uuid, org uuid, archived_at timestamptz) on commit drop;
do $$
declare v_org uuid; v_at int; v_got int; v_ceil int;
begin
  for v_org in select o.id from iam.organizations o where o.id in (select iam.my_orgs()) and o.archived_at is null loop
    v_at := 0;
    begin
      v_ceil := custom.page_ceiling(v_org);
      loop
        insert into _expect select x.id, v_org, x.archived_at
          from custom.read_records_archived(v_org, custom.table_kernel_id(), 'org', false, v_ceil, v_at) x;
        get diagnostics v_got = row_count;
        v_at := v_at + v_got;
        exit when v_got < v_ceil;
      end loop;
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
end $$;

-- A. NO PAGE IS REFUSED.
do $$
declare v_off int; v_lim int;
begin
  foreach v_off in array array[0, 800, 1000, 5000] loop
    begin
      perform custom.archived_tables_everywhere('org', 200, v_off);
    exception when others then
      raise exception 'A FAILED: the page at offset % was refused: % (%)', v_off, sqlerrm, sqlstate;
    end;
  end loop;
  begin
    perform custom.archived_tables_everywhere('org', 1000, 0);
  exception when others then
    raise exception 'A FAILED: a 1000-row page was refused: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'A passed: offsets 0, 800, 1000, 5000 and a 1000-row page all answered';
end $$;

-- B. ONE CALL = THE WHOLE ARCHIVE THROUGH EVERY ORGANIZATION'S OWN DOOR.
do $$
declare v_n int := (select count(*) from _expect); v_one jsonb; v_got int; v_extra int; v_missing int;
begin
  if v_n > 1000 then
    raise notice 'B: % archived Tables, more than one page; comparing the newest 1000', v_n;
  end if;
  v_one := custom.archived_tables_everywhere('org', 1000, 0) -> 'tables';
  v_got := jsonb_array_length(v_one);
  select count(*) into v_extra from jsonb_array_elements(v_one) w
   where not exists (select 1 from _expect e where e.id = (w ->> 'id')::uuid and e.org = (w ->> 'organization_id')::uuid);
  if v_extra > 0 then
    raise exception 'B FAILED: % archived Table(s) answered that no organization''s own door shows her', v_extra;
  end if;
  if v_got <> least(v_n, 1000) then
    raise exception 'B FAILED: one 1000-row call answered % archived Tables; her organizations'' own doors hold %', v_got, v_n;
  end if;
  raise notice 'B passed: one call answered all % archived Tables, none outside her organizations'' doors', v_got;
end $$;

-- C. 200-ROW PAGES AGREE WITH THE ONE CALL.
do $$
declare v_one jsonb := custom.archived_tables_everywhere('org', 1000, 0) -> 'tables';
        v_all jsonb := '[]'; v_page jsonb; v_off int := 0;
begin
  loop
    v_page := custom.archived_tables_everywhere('org', 200, v_off) -> 'tables';
    v_all := v_all || v_page;
    exit when jsonb_array_length(v_page) < 200 or v_off >= 800;
    v_off := v_off + 200;
  end loop;
  if (select jsonb_agg(w -> 'id') from jsonb_array_elements(v_all) w)
     is distinct from (select jsonb_agg(w -> 'id') from jsonb_array_elements(v_one) w) then
    raise exception 'C FAILED: 200-row pages (% rows) differ from the one call (% rows)',
      jsonb_array_length(v_all), jsonb_array_length(v_one);
  end if;
  raise notice 'C passed: % rows in 200-row pages, same ids in the same order as the one call', jsonb_array_length(v_all);
end $$;

-- D. A 1000-ROW CALL WITHIN HALF THE REQUEST TIMEOUT (4000 MS).
do $$
declare t0 timestamptz; v_best numeric := 1e9; n int;
begin
  for n in 1..2 loop
    t0 := clock_timestamp(); perform custom.archived_tables_everywhere('org', 1000, 0);
    v_best := least(v_best, extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
  if v_best > 4000 then
    raise exception 'D FAILED: the whole archive took % ms in one call (budget 4000 ms, half the 8 s request timeout)', round(v_best);
  end if;
  raise notice 'D passed: the whole archive in one call, best of two % ms', round(v_best);
end $$;

\echo 'GREEN'
rollback;
