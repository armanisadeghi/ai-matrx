-- chair-step: an AUDITED DATA REPAIR, after storetails3_what_one_archive_takes_one_restore_brings_back.sql.
--   Every table archived BEFORE that file has no archive event, so "Bring it back" on it could
--   return the table row alone. This writes, for each such archived table, the ONE archive event
--   its archive would have written — reconstructed from what the store still holds, marked
--   `reconstructed: true` with the rule it was reconstructed by — so its restore brings back
--   exactly its unit. It writes ONLY `history.migration_log` rows (verb `archive`); no row of
--   anybody's data changes, nothing is deleted. Re-running is safe: a table that already has an
--   event is skipped.
--   Inverse: migrations/inverse/storetails3_every_archived_table_remembers_what_it_took_down.sql
--   (it withdraws exactly these rows — stamps them undone and `withdrawn` — never deletes them).
-- lock: custom
-- lane: STORE-TAILS-3
--
-- THE RECONSTRUCTION RULE (every archive went through custom.record_delete, which stamps every
-- row it takes with the SAME `deleted_at` — the transaction's moment — and custom.table_archive,
-- which a screen calls chunk after chunk until the table is empty and then archives the table):
--   * the TABLE, at its own `deleted_at` T;
--   * its FIELDS, RULES and SAVED VIEWS archived at exactly T (the table's own cascade);
--   * its RECORDS archived in the unbroken run of archive moments that ends at T — walking back
--     from T, one moment to the one before, while the gap is at most five minutes (measured on
--     production 2026-09-24: of 1,308 gaps between consecutive archive moments of an archived
--     table's records, 1,285 are under a minute and 7 are over five). A record archived on its own
--     earlier than that run was a separate decision and is not part of the table's archive;
--   * every record CONTAINED by one of those rows ('contains' association tombstoned with it, at
--     the same moment), to ten levels.

set local lock_timeout = '30s';
set local statement_timeout = '600s';

select set_config('app.actor_system', 'campaign/storetails3-archive-events', true);

create temp table storetails3_tables on commit drop as
select r.organization_id as org, r.id, r.deleted_at as at, coalesce(nullif(r.data ->> 'name', ''), r.id::text) as name
  from custom.record r
  join iam.organizations o on o.id = r.organization_id
 where r.table_id = custom.table_kernel_id()
   and r.data_class = 'table'
   and r.deleted_at is not null
   and not exists (
     select 1 from history.migration_log m
      where m.organization_id = r.organization_id
        and m.target_id = r.id
        and m.verb = 'archive'
        and m.undone_at is null
        and exists (select 1 from jsonb_array_elements(coalesce(m.inverse -> 'took', '[]'::jsonb)) x
                     where x ->> 0 = r.id::text and (x ->> 1)::timestamptz = r.deleted_at));

-- The unbroken run of archive moments of each table's records that ends at the table's own.
create temp table storetails3_moments on commit drop as
with d as (
  select t.org, t.id as table_id, x.deleted_at as at
    from storetails3_tables t
    join custom.record x
      on x.organization_id = t.org and x.table_id = t.id and x.data_class = 'record'
     and x.deleted_at is not null and x.deleted_at <= t.at
  union
  select t.org, t.id, t.at from storetails3_tables t),
g as (
  select d.*, lead(d.at) over (partition by d.org, d.table_id order by d.at desc) as earlier
    from d),
brk as (
  select g.org, g.table_id, max(g.earlier) as break_at
    from g
   where g.at - g.earlier > interval '5 minutes'
   group by 1, 2)
select g.org, g.table_id, g.at
  from g left join brk b on b.org = g.org and b.table_id = g.table_id
 where g.at > coalesce(b.break_at, '-infinity'::timestamptz);

create temp table storetails3_members on commit drop as
with recursive
recs as (
  select m.org, m.table_id, x.id, x.deleted_at as at, 0 as depth, 5 as pass
    from storetails3_moments m
    join custom.record x
      on x.organization_id = m.org and x.table_id = m.table_id and x.data_class = 'record'
     and x.deleted_at = m.at),
kids(org, table_id, id, at, depth, pass) as (
  select * from recs
  union
  select k.org, k.table_id, c.id, c.deleted_at, k.depth + 1, 5
    from kids k
    join platform.associations a
      on a.organization_id = k.org and a.source_type = 'record' and a.source_id = k.id
     and a.role = 'contains' and a.target_type = 'record'
     and a.deleted_at = k.at
    join custom.record c
      on c.organization_id = k.org and c.id = a.target_id and c.deleted_at = k.at
   where k.depth < 10),
struct as (
  select t.org, t.id as table_id, x.id, x.deleted_at as at, 0 as depth,
         case when x.table_id = custom.field_kernel_id() then 2
              when x.table_id = custom.rule_kernel_id() then 3
              else 4 end as pass
    from storetails3_tables t
    join custom.record x
      on x.organization_id = t.org and x.deleted_at = t.at
     and ((x.table_id = custom.field_kernel_id() and x.data ->> 'entity_definition_id' = t.id::text)
       or (x.table_id = custom.rule_kernel_id() and x.data ->> 'scope_table_id' = t.id::text)
       or (x.data ? 'layout' and x.data ->> 'subject' = t.id::text)))
select distinct on (org, table_id, id) org, table_id, id, at, depth, pass
  from (select * from kids union all select * from struct) u
 order by org, table_id, id, depth;

-- The events, in the order the archive took the rows: records (a container before what it
-- contained), then saved views, rules and fields, then the table.
insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, applied_by, note)
select t.org, 'archive', 'table', t.id,
       jsonb_build_object(
         'kind', 'restore',
         'record_id', t.id::text,
         'open', false,
         'archived_at', t.at,
         'reconstructed', true,
         'rule', 'STORE-TAILS-3 reconstruction: the table at its deleted_at; its fields, rules and saved views archived at that same moment; its records in the unbroken run of archive moments (gaps of at most five minutes) ending there; what those records contained, archived with them.',
         'also', coalesce((select jsonb_agg(m.id::text order by case m.pass when 5 then 1 when 4 then 2 when 3 then 3 else 4 end, m.at, m.depth, m.id)
                             from storetails3_members m where m.org = t.org and m.table_id = t.id), '[]'::jsonb),
         'took', coalesce((select jsonb_agg(jsonb_build_array(m.id::text, m.at)
                                            order by case m.pass when 5 then 1 when 4 then 2 when 3 then 3 else 4 end, m.at, m.depth, m.id)
                             from storetails3_members m where m.org = t.org and m.table_id = t.id), '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_array(t.id::text, t.at))),
       custom.record_archiver(t.org, t.id),
       format('STORE-TAILS-3: %s was archived before archive events existed; this is the unit its archive took, reconstructed (%s row(s) with it), so "Bring it back" returns all of it.',
              t.name, (select count(*) from storetails3_members m where m.org = t.org and m.table_id = t.id))
  from storetails3_tables t;

select count(*) as tables_given_an_event,
       (select count(*) from storetails3_members) as rows_named_with_them,
       (select count(*) from storetails3_members where pass = 5) as records,
       (select count(*) from storetails3_members where pass = 2) as fields,
       (select count(*) from storetails3_members where pass = 3) as rules,
       (select count(*) from storetails3_members where pass = 4) as saved_views
  from storetails3_tables;
