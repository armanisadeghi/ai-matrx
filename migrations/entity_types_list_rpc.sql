-- entity_types_list_rpc.sql
--
-- Public read access to the `platform.entity_types` registry — the single
-- source of truth for every first-class entity token in the app.
--
-- The client (and build-time generators using a publishable/secret API key)
-- has NO direct grant on the `platform` schema — same doctrine as
-- `platform.associations` / `platform.categories`: reach it ONLY through a
-- PUBLIC SECURITY-DEFINER RPC. This function exposes the registry read-only so:
--   • `scripts/generate-entity-types.ts` can emit the type-safe TS vocabulary, and
--   • runtime code can validate / label tokens without a table grant.
--
-- The registry is non-sensitive schema metadata (token → schema/table/label/flags),
-- so EXECUTE is granted to authenticated + anon. Read-only; no writes here.
-- Idempotent (CREATE OR REPLACE).

create or replace function public.entity_types_list()
returns table (
  token text,
  schema_name text,
  table_name text,
  label text,
  base_tier smallint,
  is_versioned boolean,
  has_soft_delete boolean,
  is_listed boolean,
  is_component boolean,
  is_module boolean,
  category text,
  default_scopeable boolean,
  is_active boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select et.token, et.schema_name, et.table_name, et.label, et.base_tier,
         et.is_versioned, et.has_soft_delete, et.is_listed, et.is_component,
         et.is_module, et.category, et.default_scopeable, et.is_active
    from platform.entity_types et
   where et.is_active
   order by et.token;
$function$;

grant execute on function public.entity_types_list() to authenticated, anon;
