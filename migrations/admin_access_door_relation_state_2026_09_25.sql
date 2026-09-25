-- admin_access_door_relation_state_2026_09_25
--
-- Law: common-docs/policies/our-own-admin-database-access.md item 3.
-- aidream's super-admin read door (GET /admin/db-door/rest/v1/{table}) must serve ONLY relations no
-- signed-in session may SELECT. It asked Postgres that with inline SQL, which aidream's raw-SQL ban
-- forbids; this is the one question as a function it calls over PostgREST with the service key.
-- Metadata only (pg_class + has_table_privilege), no row is read.

create or replace function platform.admin_door_relation_state(p_schema text, p_table text)
 returns text
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select coalesce((
    select case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'client_readable'
                else 'doors_only' end
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = p_schema and c.relname = p_table
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
  ), 'missing')
$function$;

comment on function platform.admin_door_relation_state(text, text) is
  'missing | client_readable | doors_only — whether aidream''s super-admin read door may serve schema.table (doors_only only). Law: common-docs/policies/our-own-admin-database-access.md item 3.';
