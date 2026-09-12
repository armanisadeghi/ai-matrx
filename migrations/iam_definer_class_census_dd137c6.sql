-- iam_definer_class_census_dd137c6 — THE CENSUS §3.4 SAYS THE FIRST DRAFT NEVER RAN
-- (DD-137c, step 6; VISIBILITY-BY-CLASS §3.4 chokepoint 3).
--
-- §3.4, verbatim: "The census the first draft never ran (F-1's third repair, and it is the class
-- fix, law 3): every SECURITY DEFINER function granted to `authenticated` or `anon` that reads or
-- rewrites an owner, organization or visibility column."
--
-- A census written once into a report is a number that was true on a Friday. This one is a VIEW, so
-- it is re-measured every time somebody looks, and `pnpm check:definer-class` reads it rather than
-- keeping a second copy of the rule in TypeScript.
--
-- WHAT IT MEASURES, AND WHAT EACH COLUMN MEANS
--   reachable_by      — `authenticated`, `anon`, or both. A definer function no client role can
--                       execute is not a door and is not listed.
--   writes_identity   — the function body assigns `created_by` / `user_id` / `owner_id`,
--                       `organization_id`, or `visibility`. This is F-1's hole: a class that governs
--                       one RLS arm is defeated by any call that changes who the owner is.
--   reads_classed     — it names a table classed `private` or `confidential`, so its reads are not
--                       filtered by RLS and the class must be checked INSIDE it.
--   asks_the_gate     — it calls `iam.class_allows` / `iam.assert_class_allows`, or asks the kernel
--                       per row through `iam.has_access`. Either is an answer; neither being present
--                       is the finding.
--
-- 🚨 IT IS A TEXT MEASUREMENT OF FUNCTION BODIES AND IT SAYS SO. `prosrc` matching cannot see
-- through dynamic SQL, and a function that builds `set organization_id = …` out of `format()` will
-- read as innocent. So this census is a FLOOR on the problem, never a ceiling, and the guard that
-- reads it prints that sentence every run. The honest use is: nothing here may be unexplained; the
-- absence of a row is not a proof of safety.

create or replace view iam.definer_class_census as
with client_definers as (
  select p.oid,
         n.nspname                                    as schema_name,
         p.proname                                    as function_name,
         pg_get_function_identity_arguments(p.oid)    as identity_args,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
         p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                           'pgsodium','vault','auth','storage','realtime','cron','net','pgbouncer',
                           'supabase_migrations')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))
), classed as (
  select et.schema_name, et.table_name, et.token, et.data_class::text as data_class
    from platform.entity_types et
   where et.is_active and et.data_class::text in ('private','confidential')
)
select cd.schema_name,
       cd.function_name,
       cd.identity_args,
       case when cd.auth_exec and cd.anon_exec then 'authenticated, anon'
            when cd.anon_exec then 'anon'
            else 'authenticated' end                           as reachable_by,
       (cd.prosrc ~* 'set\s+(created_by|user_id|owner_id|organization_id|visibility)\s*=')
                                                               as writes_identity,
       exists (select 1 from classed c
                where position(c.schema_name || '.' || c.table_name in cd.prosrc) > 0)
                                                               as reads_classed,
       (cd.prosrc like '%class_allows%' or cd.prosrc like '%has_access%')
                                                               as asks_the_gate,
       (select coalesce(string_agg(distinct c.token, ', ' order by c.token), '')
          from classed c
         where position(c.schema_name || '.' || c.table_name in cd.prosrc) > 0)
                                                               as classed_tokens,
       exists (select 1 from platform.client_callable_door d
                where d.schema_name = cd.schema_name and d.function_name = cd.function_name)
                                                               as declared
  from client_definers cd;

comment on view iam.definer_class_census is
  'DD-137c / VISIBILITY-BY-CLASS §3.4 chokepoint 3. Every SECURITY DEFINER function a client role '
  'can execute, with whether it rewrites an identity column, whether it reads a private or '
  'confidential table, and whether it asks the class gate or the kernel. Re-measured on every read. '
  'A text measurement of function bodies: a FLOOR on the problem, never a ceiling — dynamic SQL is '
  'invisible to it.';

revoke all on iam.definer_class_census from public;
grant select on iam.definer_class_census to service_role;

-- ═══════════════════════════════════════════════════════════════════════════ the numbers, recorded
do $$
declare v_total int; v_writes int; v_reads int; v_unguarded int; v_names text;
begin
  select count(*),
         count(*) filter (where writes_identity),
         count(*) filter (where reads_classed),
         count(*) filter (where writes_identity and not asks_the_gate)
    into v_total, v_writes, v_reads, v_unguarded
    from iam.definer_class_census;

  select string_agg(schema_name || '.' || function_name, ', ' order by schema_name, function_name)
    into v_names
    from iam.definer_class_census
   where writes_identity and not asks_the_gate;

  raise notice 'dd137c6 CENSUS: % client-callable SECURITY DEFINER functions; % rewrite an identity '
               'column; % read a private or confidential table; % rewrite an identity column WITHOUT '
               'asking the gate or the kernel: %', v_total, v_writes, v_reads, v_unguarded, v_names;

  -- The census must be able to SEE the thing it exists to find, or it is decoration. The gate this
  -- lane wired into `public.create_share_link` is the proof both ways: that function is
  -- client-callable, it is SECURITY DEFINER, and it now asks the gate.
  if not exists (select 1 from iam.definer_class_census
                  where schema_name = 'public' and function_name = 'create_share_link'
                    and asks_the_gate) then
    raise exception 'dd137c6: the census cannot see that create_share_link asks the gate, so it '
                    'cannot be trusted to see that anything else does not.';
  end if;
  if not exists (select 1 from iam.definer_class_census where writes_identity) then
    raise exception 'dd137c6: the census found NOTHING that rewrites an identity column. Measured '
                    'live on 2026-09-12 there were five. A census that finds nothing has stopped '
                    'measuring.';
  end if;
end $$;
