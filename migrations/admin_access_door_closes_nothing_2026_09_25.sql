-- admin_access_door_closes_nothing_2026_09_25
--
-- Law: common-docs/policies/our-own-admin-database-access.md item 3 — `service_role` holds SELECT on
-- every relation (it is the admin system's server door, aidream/aidream/api/routers/admin_db_door.py),
-- and `relations_closed_to_the_admin_door` must return 0. On production it returned 71.
--
-- ROOT CAUSE (measured 2026-09-25, all 71 read from the catalogue):
--   1. Every one of the 71 is CLIENT-READABLE (`authenticated` holds SELECT) and none holds any
--      service_role privilege. The 2026-09-25 backfill granted service_role only on the 113 relations
--      the door serves (doors-only: no `authenticated` SELECT), so these were never touched.
--   2. They were all created BEFORE the `admin_read_follows_rls` event trigger existed, in schemas
--      with NO default privilege for service_role (ai, audit, billing, content_ir, context,
--      education, iam, legal, mandate, meta, platform, runtime, seo-by-postgres …), and never ran
--      through iam.apply_table_grants (views, audit/staging tables, unregistered tables) — the only
--      path that ends in `grant all … to service_role`.
--   3. Nothing re-opens the door after a REVOKE: the event trigger fires on CREATE/ALTER only, so a
--      later `revoke … from service_role` (the provisioner issues one after every CREATE TABLE) closes
--      it silently until somebody runs the check.
--
-- THE FIX, for the class:
--   A. Grant SELECT to service_role on every relation the check names (service_role ONLY — no
--      grant to anon, authenticated or PUBLIC is issued anywhere in this file).
--   B. ALTER DEFAULT PRIVILEGES FOR ROLE postgres … GRANT SELECT ON TABLES TO service_role in every
--      postgres-owned platform schema not declared closed, so a new relation is born readable by the
--      door even where event triggers do not fire (service_role / replica sessions).
--   C. A new event trigger `admin_door_survives_revoke` (REVOKE): re-grants SELECT to service_role on
--      any in-scope relation that lost it, and says so with a NOTICE. Never raises — a failure is a
--      WARNING naming the relation — so no REVOKE is ever blocked.
--   D. The file proves the check returns 0 before it commits.
--   Hard gate behind it: aidream db/tests/test_admin_door_reads_every_relation.py.
--
-- NOT touched: schemas declared CLOSED in platform.schema_client_exposure (custom, history). Their
-- closed-schema design (no service_role reach) conflicts with this law; that conflict is the owner's
-- to rule and is reported, not decided here. Both schemas already read 0 on the check today.

set local lock_timeout = '2s';

-- ── A. the 71 ────────────────────────────────────────────────────────────────
do $a$
declare
  r record;
  n integer := 0;
begin
  for r in
    select n2.nspname, c.relname
      from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
     where c.relkind in ('r','p','v','m') and not c.relispartition
       and n2.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                              'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                              'information_schema','pg_toast','partman')
       and n2.nspname not like 'pg\_temp%' and n2.nspname not like 'pg\_toast%'
       and not has_table_privilege('service_role', c.oid, 'SELECT')
     order by 1, 2
  loop
    execute format('grant select on %I.%I to service_role', r.nspname, r.relname);
    n := n + 1;
  end loop;
  raise notice 'admin_access_door_closes_nothing: granted SELECT to service_role on % relation(s)', n;
end
$a$;

-- ── B. default privileges ─────────────────────────────────────────────────────
do $b$
declare
  s text;
begin
  for s in
    select n.nspname
      from pg_namespace n
     where pg_get_userbyid(n.nspowner) in ('postgres', 'svc_seo')
       and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                             'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                             'information_schema','pg_toast','partman','graphql','graphql_public',
                             'pgsodium_masks','pgbouncer')
       and n.nspname not like 'pg\_%'
       and n.nspname not like 'zz\_%'
       and not exists (select 1 from platform.schema_client_exposure e
                        where e.schema_name = n.nspname and not e.client_exposed)
     order by 1
  loop
    execute format('alter default privileges for role postgres in schema %I grant select on tables to service_role', s);
  end loop;
end
$b$;

-- ── C. a REVOKE never closes the door ────────────────────────────────────────
create or replace function platform._admin_door_survives_revoke()
 returns event_trigger
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
declare
  r record;
begin
  -- OUR OWN ADMIN DATABASE ACCESS (common-docs/policies/our-own-admin-database-access.md item 3):
  -- service_role's SELECT is the admin door's read and is never revoked. Only SELECT, only
  -- service_role; schemas declared closed in platform.schema_client_exposure are left to that design.
  for r in
    select n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p','v','m') and not c.relispartition
       and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                             'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                             'information_schema','pg_toast','partman')
       and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast%'
       and not exists (select 1 from platform.schema_client_exposure e
                        where e.schema_name = n.nspname and not e.client_exposed)
       and not has_table_privilege('service_role', c.oid, 'SELECT')
  loop
    begin
      execute format('grant select on %I.%I to service_role', r.nspname, r.relname);
      raise notice 'admin_door_survives_revoke: %.% lost service_role SELECT (the admin door''s read) — re-granted. Law: common-docs/policies/our-own-admin-database-access.md', r.nspname, r.relname;
    exception when others then
      raise warning 'admin_door_survives_revoke: could not re-grant SELECT to service_role on %.% (%: %) — the admin door is BLIND on it. Law: common-docs/policies/our-own-admin-database-access.md', r.nspname, r.relname, sqlstate, sqlerrm;
    end;
  end loop;
end
$function$;

comment on function platform._admin_door_survives_revoke() is
  'Event trigger (REVOKE): re-grants SELECT to service_role on any relation that lost it — the admin system''s server door reads as service_role. Never raises. Law: common-docs/policies/our-own-admin-database-access.md item 3.';

drop event trigger if exists admin_door_survives_revoke;
create event trigger admin_door_survives_revoke
  on ddl_command_end
  when tag in ('REVOKE')
  execute function platform._admin_door_survives_revoke();

-- ── D. the proof ─────────────────────────────────────────────────────────────
do $d$
declare
  v_closed integer;
  v_names text;
begin
  select count(*), string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into v_closed, v_names
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p','v','m') and not c.relispartition
     and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                           'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                           'information_schema','pg_toast','partman')
     and not has_table_privilege('service_role', c.oid, 'SELECT');
  if v_closed <> 0 then
    raise exception 'admin_access_door_closes_nothing: relations_closed_to_the_admin_door = % after the grant (%)', v_closed, v_names;
  end if;
end
$d$;
