-- Read-only DB-truth introspection for the cross-repo "truth-vs-code" guards.
-- Returns the live schema -> [tables] / [views] map plus the PostgREST-exposed
-- schema list, as one JSON blob. Returns only structural metadata (relation
-- NAMES — already shipped to browsers in the generated Database types), never row
-- data. This is the canonical, offline/CI-friendly truth source the frontend's
-- `scripts/schema-check` refresher pulls (no direct Postgres connection needed).
-- Idempotent: CREATE OR REPLACE.
create or replace function public.schema_truth_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'project', current_database(),
    'source', 'schema_truth_snapshot()',
    'exposed_schemas', coalesce((
      select string_to_array(replace(split_part(cfg, '=', 2), ' ', ''), ',')
      from (select unnest(rolconfig) as cfg from pg_roles where rolname = 'authenticator') s
      where cfg like 'pgrst.db_schemas=%'
      limit 1
    ), array[]::text[]),
    'schemas', coalesce((
      select jsonb_object_agg(schema_name, rels order by schema_name)
      from (
        select n.nspname as schema_name, jsonb_agg(c.relname order by c.relname) as rels
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p') and c.relispartition = false
          and n.nspname::text <> all (array[
            'pg_catalog','information_schema','storage','supabase_migrations',
            'cron','net','pgsodium','auth','vault','realtime','extensions',
            'pgbouncer','_realtime','graphql','graphql_public'])
        group by n.nspname
      ) t
    ), '{}'::jsonb),
    'views', coalesce((
      select jsonb_object_agg(schema_name, rels order by schema_name)
      from (
        select n.nspname as schema_name, jsonb_agg(c.relname order by c.relname) as rels
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('v','m')
          and n.nspname::text <> all (array[
            'pg_catalog','information_schema','storage','supabase_migrations',
            'cron','net','pgsodium','auth','vault','realtime','extensions',
            'pgbouncer','_realtime','graphql','graphql_public'])
        group by n.nspname
      ) t
    ), '{}'::jsonb)
  );
$$;

comment on function public.schema_truth_snapshot() is
  'Read-only live schema/view map + PostgREST-exposed schema list for cross-repo schema-truth-check guards (matrx-frontend scripts/schema-check, aidream db/schema_analysis). Structural metadata only — no row data.';

grant execute on function public.schema_truth_snapshot() to anon, authenticated, service_role;
