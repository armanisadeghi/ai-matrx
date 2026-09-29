-- SCOPES-READS-TREE — THE SHADOW COMPARE (lane SCOPES-READS-TREE, 2026-09-29; the DD-099 method).
--
-- What it proves: every reader this lane moved to the record store answers what it answered over the
-- old tables, for every seat that can ask it. In ONE transaction on the dev clone, rolled back:
--   * the live (old) bodies are copied into a scratch schema `l6_old`, then the campaign file is \i'd,
--     so public.* holds the new bodies and l6_old.* the old ones, over the same rows;
--   * every membership (person x organization) of every organization that has a scope type, the
--     service seat for every such organization, every person who holds a class membership on a scope
--     of an organization they are not a member of, and a PLANTED share (test@test.com, outsider,
--     `viewer` on one Castellano & Reyes scope) ask, as themselves (claims + SET LOCAL ROLE
--     authenticated / service_role):
--       get_scope_tree(org), get_scope_tree(org, type) for every live type, list_scope_types(org),
--       list_scope_type_items(type) for every live type, get_scope_context(scope, null, true|false)
--       for every live scope of the organization, get_user_full_context() for every person once;
--     and resolve_full_context(person, 'conversation', <none>, the type's scopes) is compared with
--     custom.resolve_context asked directly as that person (the wrapper passes the identity through);
--   * the answers are compared as JSON after the declared normalisations (below). Anything else
--     that differs is a MISMATCH and is printed with both sides.
-- Normalisations (each one a deliberate difference named in the campaign file's header):
--   N1 the store's own clock: created_at, updated_at, updated_by, version of a scope / scope type row
--      (and a scope type's created_by where the old side had none);
--   N2 row ORDER where the old ORDER BY leaves ties (jsonb_agg over equal keys): compared as a set by
--      id when the ordered compare differs (counted as `order_only`, never a pass in disguise: a
--      real ordering change of a strictly ordered list would show in `order_only` and is read);
--   N3 a reference value: the set of its LIVE target ids (the chair's ruling, aidream
--      context_compare.py), both sides parsed from the fence;
--   N4 fetch_hint `lazy` / `batch_related` read as `on_demand` / `always` on the old side;
--   N5 a trashed context item the old list still listed (is_active, deleted_at set) is dropped from
--      the old side;
--   N6 DD-112: old refused (42501) a person outside the organization and new lists what was shared
--      with her — counted as `dd112_listed`, not a mismatch (the planted share MUST land here).
--   N7 get_scope_context: a value's `updated_at` is compared to the second (the store keeps the
--      write time as an ISO string, the old side as timestamptz).
--   N8 a date or datetime value is compared as its one value, whichever of value_text / value_date /
--      value_timestamp the old writer put it in (the store keeps the value, not the column; the
--      server reads the first non-null column).
-- PLANT (the compare must be seen failing): `-v plant=1` renames one Castellano & Reyes scope's
-- Record inside the transaction (the old side still says the old name) — get_scope_tree and
-- get_scope_context go red for every seat that sees it.
--
-- Seats that are NOT asked: Arman's own accounts (the lane's first rule: never Arman's account);
-- their organizations are still asked by every other member and by the service seat. anon holds no
-- EXECUTE on any of these functions, so there is no anonymous seat to compare.
--
-- Run (from matrx-frontend, dev clone only):
--   psql <clone> -f scripts/campaign-tests/scopesreadstree_shadow_compare.sql            (green)
--   psql <clone> -v plant=1 -f scripts/campaign-tests/scopesreadstree_shadow_compare.sql (red)

\set ON_ERROR_STOP 1
\pset pager off
begin;
set local statement_timeout = 0;
set local lock_timeout = '120s';

-- THE CLONE, NEVER PRODUCTION: the quarantine facts are never true of production.
do $clone$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     or exists (select 1 from cron.job where active) then
    raise exception 'scopesreadstree_shadow_compare runs on the dev clone only (pg_net present or a cron job active).';
  end if;
end
$clone$;

-- The old bodies, kept beside the new ones for the length of this transaction.
set local session_replication_role = replica;   -- no DDL guard fires on the scratch copies
create schema l6_old;
do $copy$
declare f text;
begin
  foreach f in array array['get_scope_tree', 'list_scope_types', 'list_scope_type_items', 'get_scope_context',
                           'get_user_full_context'] loop
    execute replace(pg_get_functiondef(('public.' || f)::regproc), 'FUNCTION public.' || f || '(', 'FUNCTION l6_old.' || f || '(');
  end loop;
end
$copy$;
-- Declared as doors for this transaction only, so the DDL guards leave their grants alone.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
select 'l6_old', p.proname, pg_get_function_identity_arguments(p.oid), p.proargtypes::oid[],
       'The old body copied for the SCOPES-READS-TREE shadow compare; this transaction is rolled back.', 'scopesreadstree_shadow_compare'
  from pg_proc p where p.pronamespace = 'l6_old'::regnamespace;
grant usage on schema l6_old to authenticated, service_role;
grant execute on all functions in schema l6_old to authenticated, service_role;
set local session_replication_role = origin;

\i migrations/campaign/scopesreadstree_the_scope_tree_and_values_read_the_store.sql
set local statement_timeout = 0;
set local lock_timeout = '120s';
-- The campaign file's own grant sweeps every undeclared definer; the scratch copies get theirs back.
set local session_replication_role = replica;
grant execute on all functions in schema l6_old to authenticated, service_role;
set local session_replication_role = origin;

-- THE PLANTED SHARE (DD-112): test@test.com, not a member of Castellano & Reyes, is shared one scope.
create temp table l6_plant as
  select s.id as scope_id, s.organization_id
    from context.scopes s
   where s.organization_id = '7cd12da2-2213-4378-8fba-a9e2dc4ea657' and s.deleted_at is null
     and not exists (select 1 from iam.organization_member om
                      where om.organization_id = s.organization_id and om.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   order by s.name, s.id limit 1;
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by, granted_via)
select 'record', p.scope_id, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'viewer', '87a6e699-3622-4869-8843-d0867456c0dd', 'share'
  from l6_plant p;

\if :{?plant}
set local session_replication_role = replica;
update custom.record r set data = r.data || jsonb_build_object('name', (r.data ->> 'name') || ' (planted)')
 where r.organization_id = '7cd12da2-2213-4378-8fba-a9e2dc4ea657'
   and r.id = (select s.id from context.scopes s join iam.organization_member om on om.organization_id = s.organization_id
                where s.organization_id = '7cd12da2-2213-4378-8fba-a9e2dc4ea657' and s.deleted_at is null
                  and om.user_id = '87a6e699-3622-4869-8843-d0867456c0dd'
                order by s.name desc, s.id limit 1);
set local session_replication_role = origin;
\echo PLANT: one Castellano & Reyes scope Record renamed inside this transaction
\endif

-- THE SEATS.
create temp table l6_seat on commit drop as
  with orgs as (select distinct organization_id from context.scope_types where deleted_at is null),
  excluded as (select u.id from auth.users u
                where lower(u.email) in ('arman@armansadeghi.com', 'arman26@gmail.com', 'arman@titaniumsuccess.com'))
  select om.user_id, om.organization_id, 'member'::text as why
    from iam.organization_member om
   where om.organization_id in (select organization_id from orgs)
     and om.user_id not in (select id from excluded)
  union
  select m.user_id, s.organization_id, 'class membership outside the organization'
    from iam.memberships m join context.scopes s on s.id = m.container_id
   where m.container_type in ('scope', 'record')
     and not exists (select 1 from iam.organization_member om where om.organization_id = s.organization_id and om.user_id = m.user_id)
     and m.user_id not in (select id from excluded)
  union
  select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, p.organization_id, 'planted share (DD-112)' from l6_plant p
  union
  select null::uuid, o.organization_id, 'service' from orgs o;
grant select on l6_seat to authenticated, service_role;

create temp table l6_result (fn text, user_id uuid, organization_id uuid, arg text, why text, old jsonb, new jsonb) on commit drop;
grant insert, select, update on l6_result to authenticated, service_role;

-- One call, answered or refused, as JSON.
create or replace function pg_temp.l6_call(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  execute p_sql into v;
  return coalesce(v, 'null'::jsonb);
exception when others then
  return jsonb_build_object('__error', sqlstate, '__message', sqlerrm);
end
$f$;
grant execute on function pg_temp.l6_call(text) to authenticated, service_role;

-- Every GRANT above fires the DDL guards, which sweep client EXECUTE off undeclared definers; the
-- scratch copies get theirs back last, with the guards quiet, and the grant is checked.
set local session_replication_role = replica;
grant execute on all functions in schema l6_old to authenticated, service_role;
set local session_replication_role = origin;
do $g$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'l6_old'::regnamespace
              and not has_function_privilege('authenticated', p.oid, 'execute')) then
    raise exception 'scratch copies lost their grant; the compare would compare refusals';
  end if;
end $g$;

-- Ask every question of every seat.
do $ask$
declare
  s record; t record; sc record;
  v_claims text;
  v_role text;
  v_types uuid[];
  v_scopes uuid[];
  v_users_done uuid[] := '{}';
begin
  for s in select * from l6_seat order by organization_id, user_id nulls first loop
    v_claims := case when s.user_id is null then jsonb_build_object('role', 'service_role')::text
                     else jsonb_build_object('sub', s.user_id, 'role', 'authenticated')::text end;
    v_role := case when s.user_id is null then 'service_role' else 'authenticated' end;
    select array_agg(st.id order by st.id) into v_types from context.scope_types st
     where st.organization_id = s.organization_id and st.deleted_at is null;
    select array_agg(x.id order by x.id) into v_scopes from context.scopes x
      join context.scope_types st on st.id = x.scope_type_id and st.deleted_at is null
     where x.organization_id = s.organization_id and x.deleted_at is null;
    perform set_config('request.jwt.claims', v_claims, true);
    execute format('set local role %I', v_role);

    insert into l6_result values ('get_scope_tree', s.user_id, s.organization_id, null, s.why,
      pg_temp.l6_call(format('select l6_old.get_scope_tree(%L::uuid)', s.organization_id)),
      pg_temp.l6_call(format('select public.get_scope_tree(%L::uuid)', s.organization_id)));
    insert into l6_result values ('list_scope_types', s.user_id, s.organization_id, null, s.why,
      pg_temp.l6_call(format('select l6_old.list_scope_types(%L::uuid)', s.organization_id)),
      pg_temp.l6_call(format('select public.list_scope_types(%L::uuid)', s.organization_id)));
    for t in select unnest(coalesce(v_types, '{}')) as id loop
      insert into l6_result values ('get_scope_tree(type)', s.user_id, s.organization_id, t.id::text, s.why,
        pg_temp.l6_call(format('select l6_old.get_scope_tree(%L::uuid, %L::uuid)', s.organization_id, t.id)),
        pg_temp.l6_call(format('select public.get_scope_tree(%L::uuid, %L::uuid)', s.organization_id, t.id)));
      insert into l6_result values ('list_scope_type_items', s.user_id, s.organization_id, t.id::text, s.why,
        pg_temp.l6_call(format('select l6_old.list_scope_type_items(%L::uuid)', t.id)),
        pg_temp.l6_call(format('select public.list_scope_type_items(%L::uuid)', t.id)));
    end loop;
    for sc in select unnest(coalesce(v_scopes, '{}')) as id loop
      insert into l6_result values ('get_scope_context(empty)', s.user_id, s.organization_id, sc.id::text, s.why,
        pg_temp.l6_call(format('select l6_old.get_scope_context(%L::uuid, null, true)', sc.id)),
        pg_temp.l6_call(format('select public.get_scope_context(%L::uuid, null, true)', sc.id)));
      insert into l6_result values ('get_scope_context', s.user_id, s.organization_id, sc.id::text, s.why,
        pg_temp.l6_call(format('select l6_old.get_scope_context(%L::uuid, null, false)', sc.id)),
        pg_temp.l6_call(format('select public.get_scope_context(%L::uuid, null, false)', sc.id)));
    end loop;
    if s.user_id is not null and not (s.user_id = any (v_users_done)) then
      v_users_done := v_users_done || s.user_id;
      insert into l6_result values ('get_user_full_context', s.user_id, null, null, s.why,
        pg_temp.l6_call('select l6_old.get_user_full_context()'),
        pg_temp.l6_call('select public.get_user_full_context()'));
    end if;
    execute 'reset role';
  end loop;

  -- THE WRAPPER passes the person through: resolve_full_context (as the service) against
  -- custom.resolve_context asked directly as that person, one type's scopes at a time.
  for s in select distinct l.user_id, l.organization_id from l6_seat l where l.user_id is not null and l.why = 'member' loop
    for t in select st.id, (select array_agg(x.id order by x.id) from (select x2.id from context.scopes x2
                                where x2.scope_type_id = st.id and x2.deleted_at is null order by x2.id limit 60) x) as ids
               from context.scope_types st where st.organization_id = s.organization_id and st.deleted_at is null loop
      continue when t.ids is null;
      perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
      execute 'set local role service_role';
      insert into l6_result values ('resolve_full_context', s.user_id, s.organization_id, t.id::text, 'member',
        null, pg_temp.l6_call(format('select public.resolve_full_context(%L::uuid, %L, null, %L::uuid[], %L::text[]) - ''resolved_at''',
                                     s.user_id, 'conversation', t.ids, '{}')));
      execute 'reset role';
      perform set_config('request.jwt.claims', jsonb_build_object('sub', s.user_id, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      update l6_result set old = pg_temp.l6_call(format('select custom.resolve_context(%L, null, %L::uuid[], %L::uuid[], %L::text[]) - ''resolved_at''',
                                                        'conversation', t.ids, '{}', '{}'))
       where fn = 'resolve_full_context' and user_id = s.user_id and organization_id = s.organization_id and arg = t.id::text;
      execute 'reset role';
    end loop;
  end loop;
end
$ask$;
reset role;

-- ═══════════════════════════════════════════════════════════════ normalise and judge

-- N3: the live target ids a reference value names (fence items id / file_id / table_id).
create or replace function pg_temp.l6_ref_ids(p_text text) returns jsonb language plpgsql immutable as $f$
declare v_doc jsonb; v jsonb;
begin
  if p_text is null or p_text !~ '```matrx' then return null; end if;
  begin
    v_doc := substring(p_text from '```matrx\s*(\{.*\})\s*```')::jsonb;
  exception when others then return to_jsonb(p_text); end;
  select coalesce(jsonb_agg(distinct i) filter (where i is not null), '[]'::jsonb) into v
    from (select coalesce(e ->> 'id', e ->> 'file_id', e ->> 'table_id') as i
            from jsonb_array_elements(coalesce(v_doc -> 'items', '[]'::jsonb)) e) z
   where not exists (select 1 from custom.record r where r.id::text = z.i and r.deleted_at is not null);
  return v;
end
$f$;

create or replace function pg_temp.l6_norm(p_fn text, p_side text, p_v jsonb) returns jsonb language plpgsql as $f$
declare v jsonb := p_v;
begin
  if v is null or jsonb_typeof(v) <> 'array' and p_fn not in ('get_user_full_context', 'resolve_full_context') then
    return v;
  end if;
  if p_fn in ('get_scope_tree', 'get_scope_tree(type)', 'list_scope_types') then
    select coalesce(jsonb_agg((e - 'created_at' - 'updated_at' - 'updated_by' - 'version'
                               - case when p_fn = 'list_scope_types' then 'created_by' else '' end) order by ord), '[]'::jsonb)
      into v from jsonb_array_elements(v) with ordinality x(e, ord);
  elsif p_fn = 'list_scope_type_items' then
    select coalesce(jsonb_agg(e || jsonb_build_object('fetch_hint',
                     case e ->> 'fetch_hint' when 'lazy' then 'on_demand' when 'batch_related' then 'always' else e ->> 'fetch_hint' end) order by ord), '[]'::jsonb)
      into v from jsonb_array_elements(v) with ordinality x(e, ord)
     where p_side = 'new' or not exists (select 1 from context.context_items ci where ci.id = (e ->> 'id')::uuid and ci.deleted_at is not null);
  elsif p_fn in ('get_scope_context', 'get_scope_context(empty)') then
    select coalesce(jsonb_agg(
             e || jsonb_build_object(
               'value_text', coalesce(pg_temp.l6_ref_ids(e ->> 'value_text'), e -> 'value_text'),
               'updated_at', case when e ? 'updated_at' then to_jsonb(date_trunc('second', (e ->> 'updated_at')::timestamptz)) end)
             || case when e ? 'fetch_hint' then jsonb_build_object('fetch_hint',
                     case e ->> 'fetch_hint' when 'lazy' then 'on_demand' when 'batch_related' then 'always' else e ->> 'fetch_hint' end) else '{}'::jsonb end
             - case when e ? 'updated_at' then '' else 'updated_at' end
             - case when e ->> 'value_type' in ('date', 'datetime') then array['value_text', 'value_date', 'value_timestamp'] else array[]::text[] end
             || case when e ->> 'value_type' in ('date', 'datetime')
                     then jsonb_build_object('__when', coalesce(e -> 'value_date', e -> 'value_timestamp', e -> 'value_text')) else '{}'::jsonb end
           order by ord), '[]'::jsonb)
      into v from jsonb_array_elements(v) with ordinality x(e, ord)
     where p_side = 'new' or not exists (select 1 from context.context_items ci where ci.id = (e ->> 'item_id')::uuid and ci.deleted_at is not null);
  elsif p_fn = 'get_user_full_context' and v ? 'organizations' then
    select jsonb_build_object('organizations', coalesce(jsonb_agg(
             o || jsonb_build_object(
               'scope_types', (select coalesce(jsonb_agg(t order by t ->> 'id'), '[]'::jsonb) from jsonb_array_elements(o -> 'scope_types') t),
               'scopes', (select coalesce(jsonb_agg(t order by t ->> 'id'), '[]'::jsonb) from jsonb_array_elements(o -> 'scopes') t),
               'projects', (select coalesce(jsonb_agg(p || jsonb_build_object('scope_tags',
                              (select coalesce(jsonb_agg(g order by g ->> 'scope_id'), '[]'::jsonb) from jsonb_array_elements(p -> 'scope_tags') g))
                              order by pord), '[]'::jsonb)
                            from jsonb_array_elements(o -> 'projects') with ordinality pp(p, pord)))
             order by oord), '[]'::jsonb))
      into v from jsonb_array_elements(v -> 'organizations') with ordinality oo(o, oord);
  end if;
  return v;
end
$f$;

create temp table l6_judged on commit drop as
  select r.*,
         pg_temp.l6_norm(r.fn, 'old', r.old) as o,
         pg_temp.l6_norm(r.fn, 'new', r.new) as n
    from l6_result r;

create temp table l6_verdict on commit drop as
  select j.*,
    case
      when j.o = j.n then 'equal'
      when j.why <> 'member' and j.why <> 'service' and j.o ? '__error' and j.o ->> '__error' = '42501'
           and jsonb_typeof(j.n) = 'array' and jsonb_array_length(j.n) > 0 and j.fn like 'get_scope_tree%' then 'dd112_listed'
      when j.why <> 'member' and j.why <> 'service' and j.o ? '__error' and j.o ->> '__error' = '42501'
           and j.n ? '__error' and j.n ->> '__error' = '42501' then 'equal_refusal_text'
      when jsonb_typeof(j.o) = 'array' and jsonb_typeof(j.n) = 'array'
           and (select coalesce(jsonb_agg(e order by coalesce(e ->> 'id', e ->> 'item_id')), '[]') from jsonb_array_elements(j.o) e)
             = (select coalesce(jsonb_agg(e order by coalesce(e ->> 'id', e ->> 'item_id')), '[]') from jsonb_array_elements(j.n) e) then 'order_only'
      else 'MISMATCH' end as verdict
    from l6_judged j;

\echo
\echo ==== VERDICTS (function x verdict)
select fn, verdict, count(*) from l6_verdict group by 1, 2 order by 1, 2;
\echo ==== SEATS
select why, count(distinct coalesce(user_id::text, 'service') || organization_id::text) as seats, count(*) as answers from l6_verdict group by 1 order by 1;
\echo ==== DD-112: the planted share must be listed by the new tree and refused by the old one
select fn, verdict, jsonb_array_length(case when jsonb_typeof(n) = 'array' then n else '[]' end) as listed
  from l6_verdict where why = 'planted share (DD-112)' and fn like 'get_scope_tree%' order by fn limit 5;
\echo ==== MISMATCHES (first 12, both sides)
select fn, why, user_id, organization_id, arg, left(o::text, 700) as old, left(n::text, 700) as new
  from l6_verdict where verdict = 'MISMATCH' order by fn, organization_id, arg limit 12;
\echo ==== MISMATCH COUNT
select count(*) as mismatches from l6_verdict where verdict = 'MISMATCH';
\if :{?dump}
\copy (select jsonb_build_object('fn', fn, 'why', why, 'user_id', user_id, 'org', organization_id, 'arg', arg, 'o', o, 'n', n) from l6_verdict where verdict = 'MISMATCH') to :'dump'
\endif
\echo ==== CHECKS: the membrane guard with the new bodies
select check_key, ok from public.__scope_access_membrane_conformance()
 where check_key in ('membraned_doors_carry_a_real_call', 'list_doors_filter_the_readable_set', 'value_doors_are_membraned');

rollback;
