-- hr_l3_109 — P0 INCIDENT REMEDIATION: hr_l3_108's grandfather match was search-path-dependent and
--             stripped load-bearing RLS-helper grants across the DB. This restores them and fixes the
--             match to be search-path-INDEPENDENT (argument type OIDs), then re-enables the guard.
--
-- SEVERITY — LIVE P0, CONFIRMED.
--   hr_l3_108's enforcement function ran with `search_path = platform, pg_catalog`, which does NOT
--   include `public`. `pg_get_function_identity_arguments` renders type names relative to search_path,
--   so a function whose argument is a `public` type (e.g. the `permission_level` enum) rendered as
--   `public.permission_level` inside the trigger but was snapshotted as `permission_level` — a
--   MISMATCH. The grandfather check therefore FAILED for such functions, and the trigger stripped
--   their client EXECUTE despite their being pre-existing. `iam.has_access` and its family are exactly
--   this shape, and they are referenced by 1613 RLS policies. `service_role` has BYPASSRLS so the app
--   (which reads as service_role) stayed green — masking the break — but `authenticated` does NOT
--   bypass RLS, so a real end-user read of any of those 1613 tables evaluated the policy, called
--   `has_access`, and got 42501 "permission denied for function has_access". Measured live: an
--   authenticated PostgREST read of `crm.deal` returned HTTP 403 before this, HTTP 200 after.
--
-- BLAST RADIUS: 41 pre-existing (grandfathered), non-exempt, non-extension, non-trigger SECURITY
--   DEFINER functions were stripped to owner-only — across iam (the has_access / is_discoverable /
--   discoverable_ids RLS helpers), platform, context, crm, education, seo, web, public (the
--   _d31_impl_* client RPCs) and two non-sender communication helpers. The deliberate campaign
--   revokes (the SMS senders, the outsider-token trio, actor_token DML, the hr.* definer campaign)
--   were NOT touched by this restore — verified still closed — because they match the grandfather by
--   their simple pg_catalog arg types and so were never mis-stripped in the first place; the restore
--   query excluded them by name and excluded the whole hr schema.
--
-- THE FIX: match the grandfather by ARGUMENT TYPE OIDs (`proargtypes`), which are the same integer
--   vector regardless of search_path, instead of by the rendered identity string. And give the
--   enforcement function `public` in its search_path so the human-declared door registry renders
--   naturally too.
--
-- Applied live as `hr_l3_109_fix_grandfather_match_and_restore`. The restore and re-snapshot are
--   environment-specific (like hr_l3_108's snapshot); the file records the remediation.
--
-- RECORDED TECHNICAL DECISIONS
--   · argtypes = `proargtypes::text` (an oidvector of the argument type OIDs). Search-path-independent,
--     overload-distinguishing, immune to how any type name renders. This is the robust key the
--     original should have used.
--   · RE-SNAPSHOT rather than backfill: the old identity_args key can't reliably rejoin to pg_proc
--     (that rejoin is the very search-path bug), so the grandfather is rebuilt from the live catalog
--     with both identity_args (informational) and argtypes (the key).
--   · THE RESTORE GRANTS anon+authenticated+service_role — the standard Supabase client set — to the
--     stripped functions. These were client-reachable before (grandfathered); this returns them to a
--     working state. Any that a domain wants locked down is that team's deliberate call, tracked by
--     the reactive checks — never a silent side effect of this guard.

-- ── 1. RESTORE the stripped grants (idempotent; excludes every deliberate campaign revoke) ───────
do $restore$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef and p.prokind in ('f','p')
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions','graphql',
             'graphql_public','pgbouncer','realtime','_realtime','storage','auth','cron','net','vault',
             'pgsodium','pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle',
             'tiger','tiger_data','topology')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not has_function_privilege('anon', p.oid, 'EXECUTE')
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
       and exists (select 1 from platform.definer_client_grant_grandfather g
                    where g.schema_name = n.nspname and g.function_name = p.proname)
       -- KEEP the deliberate P0/campaign revokes revoked:
       and not (n.nspname = 'communication' and p.proname in
                ('enqueue_notification_sms','sms_notification_gate','resolve_channel_address',
                 'mark_notification_read','record_notification_outcome'))
       and not (n.nspname = 'platform' and p.proname in
                ('mint_outsider_token','revoke_outsider_token','reanchor_outsider_token'))
       and n.nspname <> 'hr'
  loop
    begin
      execute format('grant execute on function %s to authenticated', r.sig);
      execute format('grant execute on function %s to anon', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    exception when others then null;
    end;
  end loop;
end
$restore$;

-- ── 2. RE-KEY the grandfather on argument-type OIDs (search-path-independent) ─────────────────────
alter table platform.definer_client_grant_grandfather
  add column if not exists argtypes text;

truncate platform.definer_client_grant_grandfather;
insert into platform.definer_client_grant_grandfather (schema_name, function_name, identity_args, argtypes)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), p.proargtypes::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prosecdef;

-- ── 3. FIX the enforcement function: match grandfather by argtypes; public in search_path ────────
create or replace function platform.enforce_definer_client_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $fn$
declare
  r  record;
  fn record;
  v_grant boolean := false;
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
begin
  for r in select objid, object_type from pg_event_trigger_ddl_commands()
  loop
    begin
      if r.objid is not null and lower(r.object_type) = 'function' then
        select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
               p.proargtypes::text as argtypes,
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
        -- 🚨 GRANDFATHER MATCH BY ARG-TYPE OIDs — search-path-independent (hr_l3_109 fix).
        if exists (select 1 from platform.definer_client_grant_grandfather g
                    where g.schema_name = fn.sch and g.function_name = fn.nm and g.argtypes = fn.argtypes) then continue; end if;
        if exists (select 1 from platform.client_callable_door c
                    where c.schema_name = fn.sch and c.function_name = fn.nm and c.identity_args = fn.ia) then continue; end if;
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      elsif upper(r.object_type) = 'FUNCTION' then
        v_grant := true;
      end if;
    exception when others then null;
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
         -- 🚨 same argtypes match — the re-sweep MUST respect the grandfather (the hr_l3_108 bug).
         and not exists (select 1 from platform.definer_client_grant_grandfather g
                          where g.schema_name = n.nspname and g.function_name = p.proname
                            and g.argtypes = p.proargtypes::text)
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_args = pg_get_function_identity_arguments(p.oid))
    loop
      begin
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      exception when others then null;
      end;
    end loop;
  end if;
exception when others then null;
end;
$fn$;

-- ── 4. RE-ENABLE the guard ───────────────────────────────────────────────────────────────────────
alter event trigger enforce_definer_client_grants enable;

-- ── 5. SELF-CHECK ────────────────────────────────────────────────────────────────────────────────
do $chk$
begin
  if (select evtenabled from pg_event_trigger where evtname = 'enforce_definer_client_grants') = 'D' then
    raise exception 'hr_l3_109: the guard is still disabled';
  end if;
  if not has_function_privilege('authenticated', 'iam.has_access(text,uuid,public.permission_level)', 'EXECUTE') then
    raise exception 'hr_l3_109: iam.has_access is still not executable by authenticated';
  end if;
  if exists (select 1 from hr.punch_write_path_conformance()
              where check_key = 'definer_grant_ddl_guard_installed' and not ok) then
    raise exception 'hr_l3_109: check 36 is red';
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('platform', 'enforce_definer_client_grants', 'hr_l3_109_fix_grandfather_match_and_restore',
   array['g.argtypes = fn.argtypes', 'g.argtypes = p.proargtypes'],
   array[]::text[],
   'The DB-wide definer-grant guard MUST match the grandfather by argument-type OIDs '
   || '(proargtypes), not by the rendered identity string. hr_l3_108 matched by identity under '
   || 'search_path platform,pg_catalog which excludes public, so functions with a public-schema type '
   || 'argument (e.g. permission_level, in iam.has_access — referenced by 1613 RLS policies) failed '
   || 'the grandfather check and had their client EXECUTE stripped, a live P0 for every authenticated '
   || 'reader. A re-emit that reverts to identity-string matching reintroduces that incident.',
   true, true, false)
on conflict do nothing;
