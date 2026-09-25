-- LANE STORE-TAILS-3 — THE GUARD: EVERY TABLE ARCHIVE CAN BE BROUGHT BACK AS THE UNIT IT TOOK.
--
-- Two ways a table's archive and its restore stop being symmetric, both counted:
--   (a) RESTORED WITHOUT ITS CONTENTS — a LIVE table whose last archive (History's SOFT_DELETE of
--       the table row, at moment T) took Fields, saved views, Rules or records that are STILL
--       archived at exactly T. That is "Bring it back" having returned the table row alone (the
--       defect STORE-LEAK-FORMULA found on Rooms).
--   (b) NOTHING SAYS WHAT IT TOOK — an ARCHIVED table with no open-to-undo archive event
--       (`history.migration_log`, verb `archive`, not undone) whose `took` names the table at its
--       current `deleted_at`. Its restore could bring back only the table row, however the door
--       is written.
--
-- SELF-CONTAINED: it reads `custom.record`, `history.row_versions` and `history.migration_log`
-- only, so it runs the same on a database without the fix (that is how it is proven RED on
-- production before the repair). It writes nothing.
--
-- RED: any (a) or (b), counted and the first twenty named. GREEN: none.

\set ON_ERROR_STOP on
\timing off

do $census$
declare
  v_a     bigint;
  v_a_list text;
  v_b     bigint;
  v_b_list text;
  v_arch  bigint;
begin
  -- (a) live tables restored without what their last archive took
  with t as (
    select r.organization_id org, r.id, coalesce(r.data ->> 'name', r.id::text) as name
      from custom.record r
     where r.table_id = '11111111-0000-4000-8000-000000000001'::uuid
       and r.data_class = 'table' and r.deleted_at is null),
  last_archive as (
    select distinct on (h.row_id) h.organization_id org, h.row_id, (h.row_data ->> 'deleted_at')::timestamptz as at
      from history.row_versions h
      join t on t.id = h.row_id and t.org = h.organization_id
     where h.entity_type = 'custom.record' and h.operation = 'SOFT_DELETE'
     order by h.row_id, h.occurred_at desc),
  stranded as (
    select t.org, t.id, t.name, count(*) as n
      from t
      join last_archive l on l.row_id = t.id and l.org = t.org
      join custom.record x
        on x.organization_id = t.org
       and x.deleted_at = l.at
       and (x.table_id = t.id
            or (x.table_id = '11111111-0000-4000-8000-000000000002'::uuid and x.data ->> 'entity_definition_id' = t.id::text)
            or (x.table_id = '11111111-0000-4000-8000-000000000003'::uuid and x.data ->> 'scope_table_id' = t.id::text)
            or (x.data ? 'layout' and x.data ->> 'subject' = t.id::text))
     group by 1, 2, 3)
  select count(*), string_agg(format('%s / %s (%s): %s row(s) still archived from its last archive', s.org, s.name, s.id, s.n), E'\n    ')
    into v_a, v_a_list
    from (select * from stranded order by n desc limit 20) s;
  select count(*) into v_a from (
    select 1
      from custom.record r
      join lateral (select (h.row_data ->> 'deleted_at')::timestamptz as at
                      from history.row_versions h
                     where h.entity_type = 'custom.record' and h.organization_id = r.organization_id
                       and h.row_id = r.id and h.operation = 'SOFT_DELETE'
                     order by h.occurred_at desc limit 1) l on true
     where r.table_id = '11111111-0000-4000-8000-000000000001'::uuid
       and r.data_class = 'table' and r.deleted_at is null
       and exists (select 1 from custom.record x
                    where x.organization_id = r.organization_id and x.deleted_at = l.at
                      and (x.table_id = r.id
                           or (x.table_id = '11111111-0000-4000-8000-000000000002'::uuid and x.data ->> 'entity_definition_id' = r.id::text)
                           or (x.table_id = '11111111-0000-4000-8000-000000000003'::uuid and x.data ->> 'scope_table_id' = r.id::text)
                           or (x.data ? 'layout' and x.data ->> 'subject' = r.id::text)))) q;

  -- (b) archived tables with no event that says what their archive took
  select count(*) into v_arch
    from custom.record r
   where r.table_id = '11111111-0000-4000-8000-000000000001'::uuid
     and r.data_class = 'table' and r.deleted_at is not null;
  with missing as (
    select r.organization_id org, r.id, coalesce(r.data ->> 'name', r.id::text) as name
      from custom.record r
     where r.table_id = '11111111-0000-4000-8000-000000000001'::uuid
       and r.data_class = 'table' and r.deleted_at is not null
       and not exists (
         select 1 from history.migration_log m
          where m.organization_id = r.organization_id
            and m.target_id = r.id
            and m.verb = 'archive'
            and m.undone_at is null
            and m.inverse ->> 'kind' = 'restore'
            and not coalesce((m.inverse ->> 'open')::boolean, false)
            and exists (select 1 from jsonb_array_elements(coalesce(m.inverse -> 'took', '[]'::jsonb)) x
                         where x ->> 0 = r.id::text and (x ->> 1)::timestamptz = r.deleted_at)))
  select count(*), (select string_agg(format('%s / %s (%s)', m.org, m.name, m.id), E'\n    ')
                      from (select * from missing order by name limit 20) m)
    into v_b, v_b_list
    from missing;

  if v_a > 0 or v_b > 0 then
    raise exception 'STORE-TAILS-3 ARCHIVE GUARD RED: % live table(s) were brought back without what their archive took; % of % archived table(s) have no event that says what their archive took, so "Bring it back" would return the table row alone.% (a) % % (b) %',
      v_a, v_b, v_arch, E'\n', coalesce(v_a_list, 'none'), E'\n', coalesce(v_b_list, 'none')
      using errcode = '23514',
            hint = 'Store fix: storetails3_what_one_archive_takes_one_restore_brings_back.sql. Repair: storetails3_every_archived_table_remembers_what_it_took.sql.';
  end if;
  raise notice 'STORE-TAILS-3 ARCHIVE GUARD GREEN: no live table is missing what its archive took, and all % archived tables carry an event that says exactly what to bring back', v_arch;
end
$census$;
