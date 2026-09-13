-- iam_definer_class_census_speed_dd162b — THE CENSUS HAS TO BE READABLE BY THE GUARD THAT READS IT
-- (DD-162, follow-up to iam_definer_class_doors_dd162.)
--
-- v2 replaced v1's `position()` substring match with a word-boundary regex, which is correct — v1
-- matched `chat.conversation` inside `chat.conversation_message` — and roughly ten times slower: the
-- match is every client-callable definer body against every classed table, and `pnpm
-- check:definer-class` reads the view through PostgREST, whose statement budget is a hard 8 s
-- (DD-149). Measured right after applying v2: the guard's own census query came back `57014
-- canceling statement due to statement timeout`.
--
-- A guard that cannot read its own census is not a guard, and a census nobody can read is a number
-- that was true on a Friday. The fix keeps the correct answer and puts the CHEAP test first: the
-- substring is a necessary condition for the regex, so `strpos(...) > 0 and prosrc ~ '<boundaries>'`
-- returns exactly what the regex alone returns, and the regex only ever runs on the few pairs that
-- already share a substring.
create or replace view iam.definer_class_census as
with client_definers as (
  select p.oid,
         n.nspname                                    as schema_name,
         p.proname                                    as function_name,
         pg_get_function_identity_arguments(p.oid)    as identity_args,
         p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger,
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
  select et.schema_name, et.table_name, et.token, et.data_class::text as data_class,
         et.schema_name || '.' || et.table_name as qualified
    from platform.entity_types et
   where et.is_active and et.data_class::text in ('private','confidential')
), matched as (
  select cd.oid,
         (select coalesce(string_agg(distinct c.token, ', ' order by c.token), '')
            from classed c
           -- CHEAP TEST FIRST, same answer. The substring is a necessary condition for the
           -- word-boundary regex, so this pair of tests returns exactly what the regex returned and
           -- runs the regex only where a substring already matched.
           where strpos(cd.prosrc, c.qualified) > 0
             and cd.prosrc ~ ('(^|[^a-zA-Z0-9_.])' || c.schema_name || '\.' || c.table_name
                              || '([^a-zA-Z0-9_]|$)'))                as classed_tokens
    from client_definers cd
)
select cd.schema_name,
       cd.function_name,
       cd.identity_args,
       case when cd.is_trigger then 'trigger (not a client door)'
            when cd.auth_exec and cd.anon_exec then 'authenticated, anon'
            when cd.anon_exec then 'anon'
            else 'authenticated' end                                  as reachable_by,
       cd.is_trigger,
       (cd.prosrc ~* 'set\s+(created_by|user_id|owner_id|organization_id|visibility)\s*=')
                                                                      as writes_identity,
       (m.classed_tokens <> '')                                       as reads_classed,
       m.classed_tokens,
       (cd.prosrc like '%class_allows%' or cd.prosrc like '%has_access%'
        or cd.prosrc like '%assert_class_read%' or cd.prosrc like '%assert_may_transfer%')
                                                                      as asks_the_gate,
       (cd.prosrc ~* '(created_by|user_id|owner_id|actor_user_id|actor_id|recipient_user_id|student_user_id)\s*=\s*[^;]{0,40}(auth\.uid\(\)|v_uid|v_actor|v_user|v_caller|current_user_id)')
                                                                      as narrows_to_caller,
       (cd.prosrc ~* 'is_super_admin|is_platform_admin|_assert_admin|require_admin')
                                                                      as asks_an_admin,
       (cd.prosrc ~* 'iam\.my_orgs|iam\.is_org_manager|iam\.is_org_owner|iam\._container_authz|is_org_member')
                                                                      as org_scoped,
       exists (select 1 from platform.client_callable_door d
                where d.schema_name = cd.schema_name and d.function_name = cd.function_name)
                                                                      as declared,
       ex.reason                                                      as exempt_reason
  from client_definers cd
  join matched m on m.oid = cd.oid
  left join iam.definer_class_exemption ex
         on ex.schema_name = cd.schema_name
        and ex.function_name = cd.function_name
        and (ex.identity_args = '' or ex.identity_args = cd.identity_args);

comment on view iam.definer_class_census is
  'DD-137c/DD-162 / VISIBILITY-BY-CLASS §3.4 chokepoint 3. Every SECURITY DEFINER function a client '
  'role can execute, with whether it rewrites an identity column, whether it reads a private or '
  'confidential table, and whether it ANSWERS: the class gate, the per-row kernel, an own-row '
  'predicate, an administrator check, or an organization predicate. Trigger functions are labelled '
  'as trigger, not counted as doors. Re-measured on every read. A text measurement of function '
  'bodies: a FLOOR on the problem, never a ceiling — dynamic SQL is invisible to it.';

revoke all on iam.definer_class_census from public;
grant select on iam.definer_class_census to service_role;

-- The point of this file is that the guard can READ it, so the file proves that and not just that
-- it compiles. The budget is the PostgREST door's real one.
do $speed$
declare v_t0 timestamptz := clock_timestamp(); v_n int; v_ms numeric;
begin
  select count(*) into v_n from iam.definer_class_census;
  v_ms := extract(epoch from (clock_timestamp() - v_t0)) * 1000;
  raise notice 'dd162b: the census reads % rows in % ms', v_n, round(v_ms);
  if v_ms > 5000 then
    raise exception 'dd162b: the census still takes % ms. The guard reads it through PostgREST, '
                    'whose ceiling is 8 s (DD-149), so this is a guard that cannot run.', round(v_ms);
  end if;
end
$speed$;
