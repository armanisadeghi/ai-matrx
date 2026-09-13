-- dd194_pg_stat_statements_not_readable_by_client_roles — THE QUERY-TEXT MIRROR, CLOSED TO CLIENTS
-- (DD-194. SECURITY, defence in depth. GRANTS only; no policy, no DDL on any of our own objects.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- `extensions.pg_stat_statements` and `extensions.pg_stat_statements_info` carry `PUBLIC:SELECT` —
-- not an explicit `anon` grant, which is why a role-name census misses them: PUBLIC is how `anon`,
-- `authenticated` and `service_role` all hold it. B-78 measured 100+ rows answering `set role anon`.
-- That view mirrors the text of every statement this platform has run, literals and all.
--
-- It is NOT a live internet leak and this file does not claim to close one: PostgREST does not
-- expose the `extensions` schema, so no publishable key can address either relation over HTTPS
-- (measured — a request for a schema PostgREST does not serve is refused with `PGRST106`). It is a
-- grant nobody intended, on the one relation that would tell a caller what every other caller ran,
-- and the correct bound for a client role is zero.
--
-- WHY FROM PUBLIC AND NOT FROM anon/authenticated. Revoking from a role that holds nothing of its
-- own is a no-op that reads like a fix — the safe path beside the unsafe one. PUBLIC is the grant
-- that exists, so PUBLIC is what is revoked.
--
-- WHO KEEPS IT. `postgres` and `dashboard_user` hold explicit table grants and are untouched, so
-- the Supabase dashboard's query-performance report, our own migrations' DROP-watch queries
-- (`observability_drop_watch.sql`, `observability_prune_war_room_watch.sql`) and every agent session
-- that reads it through the pooler as `postgres` keep working. No client-role caller exists:
-- searched matrx-frontend and aidream — every reference is a migration or a doc, none is a
-- browser or service-role path.

revoke select on extensions.pg_stat_statements from public;
revoke select on extensions.pg_stat_statements_info from public;

do $$
declare
  v_left integer;
  v_pg   integer;
begin
  select count(*) into v_left
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'extensions'
    and c.relname in ('pg_stat_statements','pg_stat_statements_info')
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'));
  if v_left > 0 then
    raise exception 'dd194: % grant(s) still let a client role read the recorded SQL text. Nothing was committed.', v_left;
  end if;

  select count(*) into v_pg
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'extensions'
    and c.relname in ('pg_stat_statements','pg_stat_statements_info')
    and pg_get_userbyid(a.grantee) = 'postgres' and a.privilege_type = 'SELECT';
  if v_pg <> 2 then
    raise exception 'dd194: postgres lost its own SELECT on pg_stat_statements — every DROP-watch migration and performance census would break. Nothing was committed.';
  end if;

  raise notice 'dd194: anon, authenticated and service_role can no longer read the recorded SQL text; postgres and dashboard_user keep it.';
end $$;
