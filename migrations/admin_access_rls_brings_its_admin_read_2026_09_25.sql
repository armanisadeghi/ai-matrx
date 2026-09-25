-- admin_access_rls_brings_its_admin_read_2026_09_25
--
-- Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24) — "A new table
-- gets it the moment it gets row-level security."
--
-- After the 2026-09-24 restore, three tables made OUTSIDE iam.apply_rls (platform.cutover_seam,
-- cutover_seam_press, cutover_census_run) came up with RLS on and no platform-admin read arm, and
-- the admin system was blind on them until the chair added it by hand. The generator emits the lane
-- (admin_access_platform_admin_read_is_generated_2026_09_24.sql); this closes every OTHER path:
-- an event trigger at ddl_command_end on CREATE TABLE / ALTER TABLE that, for every table the
-- statement touched which now has RLS on, lives outside graveyard and the Supabase system schemas,
-- and carries no permissive SELECT/ALL arm naming is_platform_admin()/is_super_admin(), creates
--   platform_admin_read FOR SELECT TO authenticated USING ((select public.is_platform_admin()))
-- with the do-not-remove comment every other copy carries.
--
-- DD-151: the event-trigger function is SECURITY INVOKER, or it never fires on the PostgREST /
-- db:apply path. It needs no privilege of its own: whoever enabled RLS owns the table and may
-- create a policy on it. It never raises — a failure is a WARNING naming the table, so no DDL is
-- ever blocked by this lane — and `pnpm check:staff-door` limb D is the hard gate behind it.
-- check:db-guards' EXPECTED list gains `admin_read_follows_rls` in the same change.

set local lock_timeout = '2s';

create or replace function platform._admin_read_follows_rls()
 returns event_trigger
 language plpgsql
 security invoker
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  r record;
begin
  for r in
    select distinct c.oid, n.nspname, c.relname
      from pg_event_trigger_ddl_commands() cmd
      join pg_class c on c.oid = cmd.objid
      join pg_namespace n on n.oid = c.relnamespace
     where cmd.classid = 'pg_class'::regclass
       and c.relkind in ('r', 'p')
       and not c.relispartition
       and c.relrowsecurity
       and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                             'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                             'information_schema')
       and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast%'
       and not exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid
            and (p.polname = 'platform_admin_read'
                 or (p.polpermissive and p.polcmd in ('r', '*')
                     and coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'is_platform_admin|is_super_admin')))
  loop
    begin
      execute format(
        'create policy platform_admin_read on %I.%I for select to authenticated using ((select public.is_platform_admin()))',
        r.nspname, r.relname);
      execute format(
        'comment on policy platform_admin_read on %I.%I is %L', r.nspname, r.relname,
        'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. This is how Arman and platform admins read every row through the admin system (aidream dashboard, admin.app.matrxserver.com, the Supabase-style table browser). Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).');
      raise notice 'admin_read_follows_rls: %.% has row-level security and no platform-admin read arm — created platform_admin_read (common-docs/policies/our-own-admin-database-access.md)', r.nspname, r.relname;
    exception when others then
      raise warning 'admin_read_follows_rls: could not create platform_admin_read on %.% (%: %) — the admin system is BLIND on it until it exists; check:staff-door limb D will fail. Law: common-docs/policies/our-own-admin-database-access.md', r.nspname, r.relname, sqlstate, sqlerrm;
    end;
  end loop;
end
$function$;

comment on function platform._admin_read_follows_rls() is
  'Event trigger: every RLS table gets platform_admin_read the moment it has row-level security. SECURITY INVOKER (DD-151). Law: common-docs/policies/our-own-admin-database-access.md.';

-- No grant change: an event_trigger function cannot be called except as an event trigger.

drop event trigger if exists admin_read_follows_rls;
create event trigger admin_read_follows_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'ALTER TABLE')
  execute function platform._admin_read_follows_rls();
