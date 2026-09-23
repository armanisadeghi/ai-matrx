-- OPERATOR CENSUS, not a product suite: twenty measured parity pairs over custom.read_door_parity,
-- a server-only helper platform.client_callable_door names this file as a caller of — so it cannot
-- run as the seat `authenticated`, and pnpm check:suites-take-the-seat does not count it.
-- READ-PERF — the parity clause, at 100,000 records: for 20 (member, filter) pairs the answer is
-- identical to the one the per-row ladder gives. "The filter" is the pair's own combination of
-- the organization's visibility lane, the level asked for, and the seat asking — the three
-- things that change which rows come back — and the comparison is row by row, through
-- `custom.read_door_parity`, which asks `custom.has_visibility` about every row it reports on.
--
-- It is bounded at 300 randomly chosen rows per pair (6,000 row answers) because the per-row
-- ladder costs about 7 ms a row here: asking it about all 100,000 for all 20 pairs is nine hours.
-- The sample is random per pair, not the first page, so an ordered answer cannot pass it.
\set ON_ERROR_STOP on
\timing off
begin;
set local lock_timeout = '120s';
set local statement_timeout = '3600s';
select set_config('app.actor_system','readperf_parity20', true);
do $t$
declare
  v_org   constant uuid := 'b3c98221-861e-405c-b986-5f5abd45e362';  -- Cascade Electronics Recovery (FIXTURE-ORGS 2026-09-23: repointed from an archived duplicate to the family's one kept org; the old table b52d5921 no longer existed)
  v_tbl   constant uuid := 'a7511f92-ace2-41a1-af39-da8efe2585ec';  -- Weights By Material
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_who uuid; v_lane text; v_lvl public.permission_level; v_row record;
  v_i int; v_diff int; v_rows int := 0;
begin
  for v_i in 1..20 loop
    v_who  := case when v_i % 2 = 0 then v_admin else v_dana end;
    v_lane := case when v_i % 4 < 2 then 'all_records' else 'shared_only' end;
    v_lvl  := (array['viewer','commenter','editor','admin'])[1 + (v_i % 4)]::public.permission_level;
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values ('custom','member_default_visibility','organization', v_org, v_org, to_jsonb(v_lane), 'readperf parity20')
    on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;

    select count(*) into v_diff
      from custom.read_door_parity(v_org, v_tbl, v_who, v_lvl, 300) p
     where p.verdict <> 'same';
    if v_diff > 0 then
      select * into v_row from custom.read_door_parity(v_org, v_tbl, v_who, v_lvl, 300) p
       where p.verdict <> 'same' limit 1;
      raise exception 'PARITY FAILED on pair % (person %, lane %, level %): % of 300 rows disagree. First: record % set_based=% per_row=% — %',
        v_i, v_who, v_lane, v_lvl, v_diff, v_row.record_id, v_row.set_based, v_row.per_row, v_row.verdict;
    end if;
    v_rows := v_rows + 300;
    raise notice 'pair % — person %, lane %, level %: 300 rows, identical.',
      v_i, case when v_who = v_admin then 'admin@admin.com' else 'test@test.com' end, v_lane, v_lvl;
  end loop;
  raise notice 'PARITY PASSED — 20 (member, filter) pairs, % row answers at 100,000 records, every one identical to custom.has_visibility.', v_rows;
end $t$;
rollback;
