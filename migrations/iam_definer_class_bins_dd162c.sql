-- iam_definer_class_bins_dd162c — THE ADMIN BIN COULD NOT SEE `public.is_admin()`, AND THE FIRST
-- THREE WRITTEN EXEMPTIONS (DD-162, follow-up to iam_definer_class_doors_dd162.)
--
-- Reading the census's residue function by function turned up a bin that was wrong rather than a
-- function that was: `asks_an_admin` matched `is_super_admin|is_platform_admin|_assert_admin|
-- require_admin` and NOT the platform's third administrator predicate, `public.is_admin()`. So
-- `public.industry_curator_list` — whose first statement is
--   `if not (auth.role() = 'service_role' or public.is_admin()) then raise … 42501`
-- read as a function that explains itself to nobody. Fix the class, not the instance: the bin learns
-- the predicate, and every function that uses it stops being a finding at once.
--
-- And the first three rows of `iam.definer_class_exemption`, each read line by line rather than
-- swept. They are here as much to prove the register works end to end as to lower a number.
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
       -- v3: `is_admin` added. It is the platform's third administrator predicate and the bin could
       -- not see it, so functions that refuse a non-administrator in their first statement were
       -- being reported as functions that ask nobody.
       (cd.prosrc ~* 'is_super_admin|is_platform_admin|is_admin\s*\(|_assert_admin|assert_admin|require_admin')
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

-- ══════════════════════════════════════════════ the first three exemptions, each read line by line
insert into iam.definer_class_exemption(schema_name, function_name, identity_args, reason, declared_by)
values
  ('public', '_count_super_admins', '',
   'Returns one integer: count(*) of admin.admins at level super_admin. It hands out no row, no id '
   'and no name, and the number it returns is the same number for every caller, so there is nothing '
   'for a class to govern. It exists so the platform can refuse to remove its last administrator.',
   'B-53 (DD-162)'),
  ('public', '_library_assert_admin', 'p_actor uuid',
   'Returns void. It reads admin.admins only to REFUSE — it raises when the actor is not an '
   'administrator and returns nothing when they are. Asking the class gate before an authorization '
   'check would be asking permission to check permission.',
   'B-53 (DD-162)'),
  ('iam', 'governance_columns', 'p_token text',
   'Returns the governed-columns array for a token from platform.entity_types — the names of columns '
   'the platform protects on that table, identical for every caller. It reads the registry''s own '
   'metadata about a TABLE, never a person''s row, so there is no row whose class could decide.',
   'B-53 (DD-162)')
on conflict (schema_name, function_name, identity_args) do nothing;

-- ═══════════════════════════════════════════════════════════════ the register has to actually bind
do $proof$
declare v_n int; v_before int; v_after int;
begin
  -- 1. The reason constraint refuses a reason that is not a sentence. Proven by trying it.
  begin
    insert into iam.definer_class_exemption(schema_name, function_name, reason, declared_by)
    values ('zz', 'zz_probe', 'ok', 'dd162c proof');
    raise exception 'dd162c: the exemption register accepted "ok" as a reason. An allowlist that '
                    'accepts a word is a place to hide a finding.';
  exception when check_violation then
    raise notice 'dd162c — the register refuses a reason that is not a sentence';
  end;

  -- 2. An exemption actually silences the census row it names, and only that one.
  select count(*) into v_n from iam.definer_class_census
   where schema_name = 'public' and function_name = '_count_super_admins'
     and exempt_reason is not null;
  if v_n <> 1 then
    raise exception 'dd162c: the exemption for public._count_super_admins does not bind to its '
                    'census row (matched % rows)', v_n;
  end if;
  raise notice 'dd162c — a written exemption binds to its census row';

  -- 3. The widened admin bin sees the predicate it was blind to.
  if not exists (select 1 from iam.definer_class_census
                  where schema_name = 'public' and function_name = 'industry_curator_list'
                    and asks_an_admin) then
    raise exception 'dd162c: the admin bin still cannot see public.is_admin(), so widening it did '
                    'nothing and the residue number is still wrong.';
  end if;
  raise notice 'dd162c — the admin bin now sees public.is_admin()';

  select count(*) into v_after from iam.definer_class_census
   where reads_classed and not is_trigger and not asks_the_gate and not narrows_to_caller
     and not asks_an_admin and not org_scoped and exempt_reason is null;
  raise notice 'dd162c: unexplained readers now %', v_after;
end
$proof$;
