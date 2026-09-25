-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_index_the_promotion_layer.sql` (§4.13, rule 27).
-- It restores the prior state exactly: schema `custom` holds none of this lane's sixteen
-- functions, `custom.record` carries no `zz_promoted_field_cap` trigger, and no promoted
-- index — `cpi_*` or `cpu_*`, parent or partition — exists anywhere in the schema.
--
-- IT IS `-- target: branch` ON PURPOSE, for the same reason every other inverse in this
-- directory is: an inverse is a DROP, which rule 9 forbids on production in any lane.
--
-- ORDER MATTERS. The trigger fires `custom._promoted_field_cap_guard()`, which calls
-- `custom.promoted_field_cap()`; the generator calls the expression functions. So: the
-- promoted indexes first (they are what the functions built), then the trigger, then the
-- functions in dependency order, callers before callees.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- 1. Every promoted index this lane's generator or promote_field could have built, parent and
--    partition alike, found by the naming rule rather than by a remembered list.
-- 🚨 TWO THINGS THIS SWEEP GOT WRONG THE FIRST TIME, BOTH MEASURED 2026-09-17 AND BOTH FATAL
-- TO AN INVERSE THAT CLAIMS THE SCHEMA IS CLEAN AFTERWARDS:
--   · A PARTITIONED index — the parent this lane creates on `custom.record` — has
--     `relkind = 'I'`, not `'i'`. Filtering on `'i'` alone saw the sixteen children and NONE of
--     the five parents, so the inverse left every promoted index standing while reporting
--     nothing wrong.
--   · An ATTACHED child cannot be dropped on its own: `cannot drop index
--     custom.cpu_code_68ea4c4907_01 because index custom.cpu_code_68ea4c4907 requires it`.
--     Parents go FIRST, and each one takes its children with it; the second pass then clears
--     anything built by ROUTE B before its ATTACH ever ran.
do $$
declare r record;
begin
  for r in select n.nspname, c.relname
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'custom' and c.relkind in ('i', 'I') and not c.relispartition
              and (c.relname like 'cpi\_%' or c.relname like 'cpu\_%')
            order by c.relname
  loop
    execute format('drop index if exists %I.%I cascade', r.nspname, r.relname);
  end loop;
  for r in select n.nspname, c.relname
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'custom' and c.relkind in ('i', 'I')
              and (c.relname like 'cpi\_%' or c.relname like 'cpu\_%')
            order by c.relname
  loop
    execute format('drop index if exists %I.%I cascade', r.nspname, r.relname);
  end loop;
end $$;

-- 2. The cap trigger, before its function.
drop trigger if exists zz_promoted_field_cap on custom.record;

-- 3. The functions, callers before callees.
drop function if exists custom._promoted_field_cap_guard();
drop function if exists custom.promoted_read(uuid, uuid, text, text);
drop function if exists custom.promoted_query_sql(uuid, uuid, text);
drop function if exists custom.promote_table(uuid, uuid);
drop function if exists custom.promote_field(uuid, uuid, uuid);
drop function if exists custom.promoted_index_ddl(uuid, uuid);
drop function if exists custom.promoted_fields(uuid, uuid);
drop function if exists custom.promoted_index_name(uuid, text, boolean);
drop function if exists custom.promoted_index_expr(jsonb);
drop function if exists custom.promoted_value_path(jsonb);
drop function if exists custom.promoted_index_arm(jsonb);
drop function if exists custom.table_storage(uuid, uuid);
drop function if exists custom.storage_modes();
drop function if exists custom.promotion_inline_ceiling();
drop function if exists custom.table_record_ceiling();
drop function if exists custom.promoted_field_cap();
