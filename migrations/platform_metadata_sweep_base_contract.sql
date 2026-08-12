-- Applied via Supabase MCP 2026-08-12 (platform_metadata_sweep_base_contract). Arman-approved sweep.
-- Adds the canonical `metadata jsonb NOT NULL DEFAULT '{}'` base column to every ACTIVE registered
-- TABLE missing it (graveyard-schema registrations and views excluded). Purely additive; PG17 fast
-- default. Verified post-apply: zero active registered non-graveyard tables missing metadata.
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct et.schema_name, et.table_name
    from platform.entity_types et
    join pg_class c on c.oid = et.table_ref and c.relkind in ('r','p')
    where et.is_active
      and et.schema_name <> 'graveyard'
      and not exists (
        select 1 from information_schema.columns col
        where col.table_schema = et.schema_name
          and col.table_name = et.table_name
          and col.column_name = 'metadata'
      )
  loop
    execute format('alter table %I.%I add column metadata jsonb not null default %L::jsonb',
                   r.schema_name, r.table_name, '{}');
    n := n + 1;
  end loop;
  raise notice 'metadata added to % tables', n;
end $$;
