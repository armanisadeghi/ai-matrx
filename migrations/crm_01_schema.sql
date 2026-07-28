-- CRM core, step 1: the `crm` schema, grants, default privileges, registry row.
--
-- Order is load-bearing: ALTER DEFAULT PRIVILEGES must run BEFORE any table is
-- created in the schema, or the tables come out ungrantable.
--
-- `anon` is granted USAGE deliberately: the public expert directory relies on the
-- `pub_read` policy that `iam.apply_rls` emits for anon, and without schema USAGE
-- that policy is dead — and it fails as a SILENT NULL through a wrapper RPC, not a
-- 404 (see .claude/skills/db-change/TOOLKIT.md).
--
-- NOTE: PostgREST exposure (Supabase → Settings → API → Exposed schemas) is
-- dashboard-only config and is NOT applied here. Browser reads of `crm.*` 404
-- until a human adds it.
--
-- Idempotent. Applied live via Supabase MCP.

create schema if not exists crm;

grant usage on schema crm to authenticated, anon, service_role;

alter default privileges in schema crm
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema crm
  grant select on tables to anon;

-- btree_gist backs the affiliation "one primary employer at a time" EXCLUDE
-- constraint (uuid equality + daterange overlap in one index).
create extension if not exists btree_gist with schema extensions;

-- platform.schemas drives SCHEMA_DISPLAY in the generated entity-type file;
-- scripts/generate-entity-types.ts THROWS when a schema is missing from it.
insert into platform.schemas (schema_name, display_name, sort_order, is_active)
select 'crm', 'CRM', 87, true
where not exists (select 1 from platform.schemas where schema_name = 'crm');
