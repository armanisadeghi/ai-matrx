-- LANE CHAIR-DOORS-2 — A BLANK GROUP SORTS LAST.
-- Guard for migrations/campaign/chairdoors2_c_a_blank_group_sorts_last.sql (custom.agg_sql).
--
-- Fixture, inside this transaction only: in the Visits table of an organization test@test.com owns,
-- 70 of 200 visits lose their referring physician (35 with the Field removed, 35 with ""), so blank
-- is by far the most common value (the busiest physician has at most 40).
-- Then, as `authenticated` with test@test.com's claims, custom.record_aggregate grouped by referring
-- physician:
--   · limit 3: three real physicians, no blank group, the first is the busiest real one;
--   · limit 50: every group is listed and the blank group(s) come after every real one.
-- One transaction, rolled back; nothing is left behind.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_c_blank_group_sorts_last.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_c_blank_group_sorts_last.sql'
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
       '9b8278c0-82b9-4034-9deb-1fc215522002'::uuid as dry_run, -- an org she owns
       'e1eb83b8-4f47-4961-b523-c2ab0fe6da0f'::uuid as visits   -- its Visits table
\gset

-- Fixture as the owner: 70 visits with no referring physician.
with pick as (
  select id, row_number() over (order by id) n from custom.record
   where organization_id = :'dry_run' and table_id = :'visits' and deleted_at is null
   order by id limit 70)
update custom.record r
   set data = case when p.n % 2 = 0 then r.data - 'referring_physician'
                   else jsonb_set(r.data, '{referring_physician}', '""'::jsonb) end
  from pick p
 where r.id = p.id and r.organization_id = :'dry_run';
select max(c) as busiest_real from (
  select count(*) c from custom.record
   where organization_id = :'dry_run' and table_id = :'visits' and deleted_at is null
     and nullif(data ->> 'referring_physician', '') is not null
   group by data ->> 'referring_physician') x \gset
select count(*) as blanks from custom.record
 where organization_id = :'dry_run' and table_id = :'visits' and deleted_at is null
   and nullif(data ->> 'referring_physician', '') is null \gset
select set_config('t.dry_run', :'dry_run', true), set_config('t.visits', :'visits', true),
       set_config('t.busiest_real', :'busiest_real', true), set_config('t.blanks', :'blanks', true) \g /dev/null

-- ── the member's seat ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'me', 'role', 'authenticated')::text, true) \g /dev/null

do $$
declare top3 jsonb; all_g jsonb; n_real int; first_blank int; last_real int; m text;
begin
  insert into res values ('fixture: blank is the most common value',
    current_setting('t.blanks')::int > current_setting('t.busiest_real')::int,
    format('%s blank, busiest physician %s', current_setting('t.blanks'), current_setting('t.busiest_real')));

  select jsonb_agg(jsonb_build_object('g', a.groups ->> 'referring_physician', 'n', a.row_count) order by o) into top3
    from custom.record_aggregate(current_setting('t.dry_run')::uuid, current_setting('t.visits')::uuid,
           '["referring_physician"]'::jsonb, '[]'::jsonb, null, '{}'::jsonb, 3, 'viewer', null)
         with ordinality a(groups, measures, row_count, pg, pm, prc, delta, cmp, o);
  insert into res values ('limit 3: no blank group takes a slot',
    jsonb_array_length(top3) = 3
    and not exists (select 1 from jsonb_array_elements(top3) e where nullif(e ->> 'g', '') is null),
    top3::text);
  insert into res values ('limit 3: the first is the busiest real physician',
    (top3 -> 0 ->> 'n')::int = current_setting('t.busiest_real')::int, top3 -> 0 ->> 'n');

  select jsonb_agg(jsonb_build_object('g', a.groups ->> 'referring_physician', 'n', a.row_count) order by o) into all_g
    from custom.record_aggregate(current_setting('t.dry_run')::uuid, current_setting('t.visits')::uuid,
           '["referring_physician"]'::jsonb, '[]'::jsonb, null, '{}'::jsonb, 50, 'viewer', null)
         with ordinality a(groups, measures, row_count, pg, pm, prc, delta, cmp, o);
  select min(o) filter (where nullif(e ->> 'g', '') is null), max(o) filter (where nullif(e ->> 'g', '') is not null),
         count(*) filter (where nullif(e ->> 'g', '') is not null)
    into first_blank, last_real, n_real
    from jsonb_array_elements(all_g) with ordinality x(e, o);
  insert into res values ('limit 50: blank groups come after every real one',
    first_blank is not null and last_real is not null and first_blank > last_real,
    format('first blank at %s, last real at %s, %s real groups', first_blank, last_real, n_real));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('record_aggregate answers', false, m);
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors2_c_blank_group_sorts_last.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
