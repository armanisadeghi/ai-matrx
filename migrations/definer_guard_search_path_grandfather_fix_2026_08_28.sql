-- definer_guard_search_path_grandfather_fix — restore the RLS-helper EXECUTE grants hr_l3_108's
--   guard wrongly swept, and close the search_path grandfather-match hole so it cannot recur.
--
-- APPLIED LIVE 2026-08-28 (sections A–D, via Supabase MCP, each verified in place). Section E — the
--   normalized matcher inside `platform.enforce_definer_client_grants` — is written and idempotent
--   but NOT YET APPLIED: the agent sandbox's permission gate refused replacing the enforcement
--   function, so that one section awaits an operator run (whole-file re-run is safe; A–D no-op).
--   Sections A+B already close the hole for every definer that exists today at the DATA layer; E is
--   the CODE-layer immunity for functions and door rows created in the future.
--
-- THE INCIDENT (2026-08-28, first user error 21:27 UTC)
--   Production 42501 `permission denied for function has_access` / `accessible_entity_ids`
--   (PostgREST 403) on plain SELECTs across the platform — context.scopes, workspace.projects,
--   workbench.product_capture_*, and every other table whose RLS policies call the iam helpers as
--   the querying role. `iam.has_access` is referenced by ~1,613 policies and
--   `iam.accessible_entity_ids` by ~1,075; both had lost EXECUTE for `authenticated`/`anon`.
--
-- ROOT CAUSE — identity-args text matching is search_path-DEPENDENT
--   hr_l3_108 installed the DB-wide `enforce_definer_client_grants` event trigger: on any GRANT it
--   re-sweeps every client-reachable SECURITY DEFINER function and revokes client EXECUTE unless
--   the function matches the GRANDFATHER snapshot or the door registry — matched by raw text on
--   (schema, name, pg_get_function_identity_arguments()). That rendering is search_path-relative:
--   the snapshot ran with `public` on the search_path and stored `p_required permission_level`
--   (unqualified), while the trigger runs with `set search_path to 'platform','pg_catalog'` and
--   renders the same argument as `p_required public.permission_level`. The text differs → the
--   grandfather lookup misses → the sweep treats a snapshotted function as new and strips it.
--   Victim class: every grandfathered definer with an argument typed by a non-pg_catalog,
--   non-platform type (public enums/composites: permission_level, admin_level, visibility, mcp_*,
--   context_*, field_data_type) — 26 signatures, including the RLS kernels above,
--   `public.has_permission` (policy-referenced), and client RPC doors the frontend calls
--   (admin_promote/admin_update, admin_upsert_relationship_rule, create_context_item,
--   udt_change_field_type, provision_mcp_server, upsert_mcp_connection, web.create_site, ...).
--   The sweep fired on the first migration containing a GRANT after the trigger landed (~21:20 UTC,
--   hr_c4_54 / hr_l1_57); errors began seven minutes later. Plain-typed helpers (is_org_member,
--   personal_org_id, ...) matched their snapshot rows and survived — exactly the victim/survivor
--   split observed live.
--
-- THE FIX, LAYER BY LAYER
--   A. The 26 swept signatures are declared in `platform.client_callable_door` (hr_l3_108's own
--      sanctioned extension point), rendered EXACTLY as the trigger renders them, so its raw-text
--      match skips them on every future sweep. They ARE client doors: RLS predicates evaluated as
--      the querying role, plus internally-gated client RPCs.
--   B. The grandfather snapshot gains a trigger-rendering row for EVERY live grandfathered definer
--      (~1,780), so no existing function can miss the raw-text lookup again. (Data repair — the
--      original unqualified rows remain; both renderings now match.)
--   C. EXECUTE restored: `authenticated` + `service_role` on all 26 (their pre-sweep state — the
--      guard's own contract was "day one strips zero live doors"); `anon` additionally on the three
--      RLS predicates (iam.has_access, iam.accessible_entity_ids, public.has_permission), which
--      {public}-role policies evaluate for anon share-link reads and which sat under the implicit
--      PUBLIC grant before the sweep. anon is deliberately NOT restored on the RPC doors.
--   D. Falsification: grants held through the trigger's own re-sweep; zero grandfather mismatches
--      under the trigger's search_path; zero policy-referenced functions unreachable by
--      authenticated; the previously-failing SELECTs evaluate cleanly under SET ROLE authenticated.
--   E. (PENDING) `platform.normalize_identity_args()` + a rematched guard that compares grandfather
--      and door rows through it — immunity for FUTURE definers/doors regardless of the search_path
--      any author renders their registry rows under.
--
-- Idempotent throughout; safe to re-run whole.

-- ── A. THE VICTIMS ARE DECLARED DOORS — rendered as the trigger renders them ─────────────────────
set search_path to platform, pg_catalog;

insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       'definer_guard_search_path_grandfather_fix',
       case
         when (n.nspname, p.proname) in (('iam','has_access'), ('iam','accessible_entity_ids'),
                                         ('public','has_permission'))
           then 'RLS kernel predicate: evaluated AS THE QUERYING ROLE by thousands of policies '
             || '(anon included via {public}-role policies). Client EXECUTE is load-bearing for '
             || 'every org read. Was grandfathered, but the hr_l3_108 sweep missed the snapshot row '
             || 'because pg_get_function_identity_arguments renders public.* types schema-qualified '
             || 'under the trigger''s search_path while the snapshot stored them unqualified; swept '
             || '2026-08-28, restored by definer_guard_search_path_grandfather_fix.'
         else 'Pre-hr_l3_108 client-reachable definer (grandfathered surface: iam/files access '
             || 'helpers and gated client RPC doors — admin, context-items, UDT, MCP, web). Swept '
             || '2026-08-28 by the search_path grandfather-match rendering bug; authenticated '
             || 'EXECUTE restored by definer_guard_search_path_grandfather_fix.'
       end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and (n.nspname, p.proname) in (
    ('iam','has_access'), ('iam','accessible_entity_ids'), ('iam','discoverable_ids'),
    ('iam','has_access_as'), ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','is_discoverable'), ('iam','is_discoverable_base'),
    ('files','has_access_for'), ('files','is_discoverable_for'),
    ('platform','entity_row_access_attrs'),
    ('public','has_permission'), ('public','has_permission_for'), ('public','has_access_as'),
    ('public','admin_promote'), ('public','admin_update'), ('public','admin_upsert_relationship_rule'),
    ('public','create_context_item'), ('public','provision_mcp_server'),
    ('public','udt_change_field_type'), ('public','upsert_mcp_connection'),
    ('web','create_site'))
on conflict (schema_name, function_name, identity_args) do nothing;

-- ── B. GRANDFATHER DATA REPAIR — add the trigger-rendering row for every live definer ────────────
insert into platform.definer_client_grant_grandfather (schema_name, function_name, identity_args)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and exists (select 1 from platform.definer_client_grant_grandfather g
               where g.schema_name = n.nspname and g.function_name = p.proname)
on conflict do nothing;

-- ── C. RESTORE THE GRANTS — doors declared first, so the GRANT-fired re-sweep leaves them ────────
do $grants$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig, n.nspname as sch, p.proname as nm
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef
       and (n.nspname, p.proname) in (
         ('iam','has_access'), ('iam','accessible_entity_ids'), ('iam','discoverable_ids'),
         ('iam','has_access_as'), ('iam','has_access_for'), ('iam','has_access_for_base'),
         ('iam','is_discoverable'), ('iam','is_discoverable_base'),
         ('files','has_access_for'), ('files','is_discoverable_for'),
         ('platform','entity_row_access_attrs'),
         ('public','has_permission'), ('public','has_permission_for'), ('public','has_access_as'),
         ('public','admin_promote'), ('public','admin_update'), ('public','admin_upsert_relationship_rule'),
         ('public','create_context_item'), ('public','provision_mcp_server'),
         ('public','udt_change_field_type'), ('public','upsert_mcp_connection'),
         ('web','create_site'))
  loop
    execute format('grant execute on function %s to authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if (f.sch, f.nm) in (('iam','has_access'), ('iam','accessible_entity_ids'),
                         ('public','has_permission')) then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end
$grants$;

-- ── D. FALSIFICATION — grants stuck through the re-sweep, the mismatch class is empty ────────────
do $verify$
declare v_missing text; v_mismatched bigint;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and (n.nspname, p.proname) in (
       ('iam','has_access'), ('iam','accessible_entity_ids'), ('iam','discoverable_ids'),
       ('iam','has_access_as'), ('iam','has_access_for'), ('iam','has_access_for_base'),
       ('iam','is_discoverable'), ('iam','is_discoverable_base'),
       ('files','has_access_for'), ('files','is_discoverable_for'),
       ('platform','entity_row_access_attrs'),
       ('public','has_permission'), ('public','has_permission_for'), ('public','has_access_as'),
       ('public','admin_promote'), ('public','admin_update'), ('public','admin_upsert_relationship_rule'),
       ('public','create_context_item'), ('public','provision_mcp_server'),
       ('public','udt_change_field_type'), ('public','upsert_mcp_connection'),
       ('web','create_site'))
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_missing is not null then
    raise exception 'definer_guard fix: authenticated still cannot execute: %', v_missing;
  end if;

  if not has_function_privilege('anon', 'iam.has_access(text,uuid,public.permission_level)', 'EXECUTE') then
    raise exception 'definer_guard fix: anon lost iam.has_access — {public}-role policies would 42501 for share-link reads';
  end if;

  -- Under the trigger's own search_path (set at the top of this file), no live grandfathered
  -- definer misses its snapshot row any more.
  select count(*) into v_mismatched
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and exists (select 1 from platform.definer_client_grant_grandfather g
                  where g.schema_name = n.nspname and g.function_name = p.proname)
     and not exists (select 1 from platform.definer_client_grant_grandfather g
                  where g.schema_name = n.nspname and g.function_name = p.proname
                    and g.identity_args = pg_get_function_identity_arguments(p.oid));
  if v_mismatched <> 0 then
    raise exception 'definer_guard fix: % grandfathered definer(s) still unmatched', v_mismatched;
  end if;
end
$verify$;

-- The real probe (run separately when applying by hand — the failing production reads, as the
-- client role; a surviving 42501 raises. auth.uid() is NULL under a bare SET ROLE, so counts are
-- 0 by design; only error-free policy evaluation is asserted):
--   begin; set local role authenticated;
--   select count(*) from context.scopes;
--   select count(*) from workspace.projects;
--   select count(*) from workbench.product_capture_item;
--   rollback;

-- ── E. PENDING — CODE-LAYER IMMUNITY: normalized grandfather/door matching in the guard ──────────
-- Replaces hr_l3_108's enforcement function so registry matching is rendering-independent for
-- functions and door rows created in the FUTURE (A/B above already cover everything that exists).
-- (Collision note: two overloads that differ only by the SCHEMA of an argument type would
-- normalize alike — the guard then skips both, failing OPEN into the reactive checks 33/35, the
-- same deliberate posture as the guard's own fail-open blocks.)
create or replace function platform.normalize_identity_args(p_args text)
returns text
language sql
immutable
strict
as $$ select regexp_replace(p_args, '([a-zA-Z_][a-zA-Z0-9_$]*\.)+', '', 'g') $$;

comment on function platform.normalize_identity_args(text) is
  'Strips schema qualifiers from a pg_get_function_identity_arguments() rendering so grandfather/'
  'door matching in platform.enforce_definer_client_grants is search_path-independent '
  '(definer_guard_search_path_grandfather_fix). The rendering is search_path-RELATIVE; never '
  'compare two renderings without normalizing both sides.';

create or replace function platform.enforce_definer_client_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'platform', 'pg_catalog'
as $fn$
declare
  r  record;
  fn record;
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
  v_grant boolean := false;
begin
  -- 🚨 TWO EVENT SHAPES (hr_l3_108). A CREATE FUNCTION reports object_type='function' with the
  -- objid (handled per-function); a GRANT reports 'FUNCTION' with NULL objid, so it triggers a
  -- bounded DB-wide re-sweep of every undeclared client-reachable definer.
  -- 🚨 MATCHING IS NORMALIZED (definer_guard_search_path_grandfather_fix): identity-args renderings
  -- are search_path-relative, so grandfather and door rows are compared through
  -- platform.normalize_identity_args on BOTH sides — never by raw text equality.
  for r in select objid, object_type from pg_event_trigger_ddl_commands()
  loop
    begin
      if r.objid is not null and lower(r.object_type) = 'function' then
        select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
               pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig
          into fn
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.oid = r.objid;
        if not found then continue; end if;
        if not fn.prosecdef then continue; end if;
        if fn.prokind not in ('f','p') then continue; end if;
        if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
        if fn.sch = any(v_exempt) then continue; end if;
        if exists (select 1 from pg_depend d where d.objid = r.objid and d.deptype = 'e') then continue; end if;
        if exists (select 1 from platform.definer_client_grant_grandfather g
                    where g.schema_name = fn.sch and g.function_name = fn.nm
                      and platform.normalize_identity_args(g.identity_args)
                        = platform.normalize_identity_args(fn.ia)) then continue; end if;
        if exists (select 1 from platform.client_callable_door c
                    where c.schema_name = fn.sch and c.function_name = fn.nm
                      and platform.normalize_identity_args(c.identity_args)
                        = platform.normalize_identity_args(fn.ia)) then continue; end if;
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      elsif upper(r.object_type) = 'FUNCTION' then
        v_grant := true;   -- a GRANT on some function(s); sweep after the loop.
      end if;
    exception when others then null;   -- 🚨 FAIL-OPEN per row: never abort the DDL.
    end;
  end loop;

  if v_grant then
    for fn in
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.prokind in ('f','p')
         and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
         and not (n.nspname = any(v_exempt))
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')
           or has_function_privilege('public', p.oid, 'EXECUTE'))
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         and not exists (select 1 from platform.definer_client_grant_grandfather g
                          where g.schema_name = n.nspname and g.function_name = p.proname
                            and platform.normalize_identity_args(g.identity_args)
                              = platform.normalize_identity_args(pg_get_function_identity_arguments(p.oid)))
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and platform.normalize_identity_args(c.identity_args)
                              = platform.normalize_identity_args(pg_get_function_identity_arguments(p.oid)))
    loop
      begin
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      exception when others then null;
      end;
    end loop;
  end if;
exception
  when others then
    null;   -- belt and suspenders: the whole pass can never raise.
end;
$fn$;
