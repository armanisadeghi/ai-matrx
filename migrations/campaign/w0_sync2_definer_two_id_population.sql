-- target: branch
--
-- w0_sync2_definer_two_id_population — one more object production landed WHILE this sync
-- was running.
--
-- `platform.definer_two_id_population()` appeared on production between this lane's
-- re-measure and its exit proof. That is not an accident of timing to apologise for, it is
-- the standing condition this sync exists for: production takes a migration a minute and
-- the rehearsal branch is a transplant. It was carried with the same one command that
-- carried the other fifteen — `pnpm check:branch-schema-drift --sync-plan --out <file>` —
-- which is the whole point of that mode.
--
-- Body verbatim from production's `pg_get_functiondef`, read SELECT-only — and it is
-- SECURITY DEFINER, so production's `platform.client_callable_door` row travels with it in
-- the SAME transaction. That is not decoration: `provision_shape_guard` refused the first
-- attempt at COMMIT ("reached COMMIT with no access decision declared"), and DD-223 refuses
-- a door row naming a function that does not exist yet, so after the CREATE is the only
-- place it can go. `identity_argtypes` is the one column not copied — it holds per-database
-- type OIDs — and is recomputed here from the branch's own catalog through
-- `platform.door_argtypes`. The guard stays ON; nothing is disabled.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync2_definer_two_id_population.sql \
--     --target branch --lane W0-SYNC --no-generate

-- ============================ FUNCTIONS (1)

CREATE OR REPLACE FUNCTION platform.definer_two_id_population()
 RETURNS TABLE(object_ref text, schema_name text, function_name text, id_arguments text[], unruled_id_arguments text[], unchecked_id_arguments text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with pop as (
    select p.oid, n.nspname, p.proname,
           format('%s.%s(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_ref,
           a.id_args,
           (select d.argument_rules from platform.client_callable_door d
             where d.schema_name = n.nspname and d.function_name = p.proname
               and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
             limit 1) as rules
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral (
        select coalesce(array_agg(coalesce(p.proargnames[t.ord], 'arg' || t.ord) order by t.ord), array[]::text[]) as id_args
          from unnest(p.proargtypes) with ordinality as t(typ, ord)
         where t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype)
      ) a
     where p.prosecdef
       and p.prokind in ('f', 'p')
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions','graphql',
                             'graphql_public','pgbouncer','realtime','_realtime','storage','auth',
                             'cron','net','vault','pgsodium','pgsodium_masks','supabase_functions',
                             'supabase_migrations','dashboard','pgtle','tiger','tiger_data','topology')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('anon', p.oid, 'EXECUTE'))
       and coalesce(array_length(a.id_args, 1), 0) >= 2
       and platform.definer_body_decides_access(p.oid)
  )
  select pop.object_ref, pop.nspname::text, pop.proname::text, pop.id_args,
         coalesce((select array_agg(x order by x) from unnest(pop.id_args) x
                    where pop.rules is null
                       or pop.rules #> array['arguments', x, 'foreign'] is null), array[]::text[]),
         coalesce((select array_agg(x order by x) from unnest(pop.id_args) x
                    where coalesce((pop.rules #>> array['arguments', x, 'foreign', 'unchecked'])::boolean, false)),
                  array[]::text[])
    from pop
   order by 1
$function$
;

-- platform.definer_two_id_population() is SECURITY DEFINER: production's door row, in the same transaction.
-- The door table itself is one column behind production. `check:branch-schema-drift`
-- measures OBJECTS, not columns, so nothing was ever going to report this — the apply did,
-- by failing on it. Production's own shape, additive, on the branch only.
alter table platform.client_callable_door add column if not exists contract_probe jsonb;

insert into platform.client_callable_door (id, reason, probe_args, declared_at, declared_by, schema_name, function_name, identity_args, argument_rules, contract_probe, gate_predicate, non_client_lane, anonymous_callers, anonymous_purpose, signed_in_callers, identity_argtypes) select '53dff9c6-8db5-460c-b9ba-eca238666a91'::uuid, 'SERVER-ONLY. Reads pg_proc and platform.client_callable_door; takes no entity id; answers a question about the CATALOGUE, not about any tenant''s rows.'::text, null::jsonb, '2026-09-17T21:20:49.540113+00:00'::timestamp with time zone, '0851 the per-argument census'::text, 'platform'::text, 'definer_two_id_population'::text, ''::text, null::jsonb, null::jsonb, null::text, 'server_only: scripts/check_definer_bodies_decide_access.py and repo migrations, which run as postgres; no client ever asks the catalogue this'::text, 'false'::boolean, null::text, 'false'::boolean, platform.door_argtypes(p.proargtypes) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'platform' and p.proname = 'definer_two_id_population' and pg_get_function_identity_arguments(p.oid) = '' on conflict do nothing;
