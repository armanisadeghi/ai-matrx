-- hr_c8_01_entity_client_excluded_columns_rpc
--
-- HRB-012 (C8 — typegen + mocks + G1 contract freeze).
--
-- WHY: `platform.entity_types.client_excluded_columns` was a declaration with no mechanism.
-- `supabase gen types` reads the live catalog and knows nothing about the registry, so every
-- declared-excluded column was being emitted into `types/database.types.ts` verbatim
-- (30 columns across 16 registered tables, found 2026-08-26). The frontend's new
-- `scripts/strip-client-excluded-columns.ts` removes them as a post-processing step of
-- `pnpm db-types`, and it needs to read the registry.
--
-- The client has no direct grant on `platform.*` — the established pattern is a public
-- SECURITY DEFINER projection (`public.entity_types_list`, `public.entity_schemas_list`,
-- `public.reference_categories_list`). This is the fourth of those, and the narrowest:
-- three columns, only rows that actually declare an exclusion.
--
-- It deliberately does NOT filter on `is_active`. A retired entity's ciphertext column must keep
-- being stripped from the generated types; "we stopped listing the entity" is not a reason to
-- start emitting its secret column names again.
--
-- Not granted to `anon`: build tooling and signed-in callers only.
--
-- Idempotent.

create or replace function public.entity_client_excluded_columns()
returns table (
  schema_name              text,
  table_name               text,
  client_excluded_columns  text[]
)
language sql
stable
security definer
set search_path to ''
as $$
  select et.schema_name, et.table_name, et.client_excluded_columns
    from platform.entity_types et
   where et.client_excluded_columns is not null
     and array_length(et.client_excluded_columns, 1) > 0
   order by et.schema_name, et.table_name;
$$;

comment on function public.entity_client_excluded_columns() is
  'Registry projection consumed by matrx-frontend scripts/strip-client-excluded-columns.ts to '
  'remove client-excluded columns from the generated Supabase types. A PROJECTION CONVENTION, '
  'not a security boundary — the boundary is RLS and column grants (SPEC-ACCESS 4.6).';

revoke all on function public.entity_client_excluded_columns() from public;
grant execute on function public.entity_client_excluded_columns() to authenticated, service_role;
