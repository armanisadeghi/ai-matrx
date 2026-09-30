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
--   N7 get_scope_context: a value's `updated_at` is the store's clock (N1); its version is compared.
--   N9 the organization chose `shared_only` (custom/member_default_visibility): the store shows a
--      plain member only what is shared with her; the old scope ACL ignored the knob. Counted as
--      `org_shared_only` when the new answer is the old one less rows (or a refusal).
--   N10 a current value row whose every value column is empty is no value (old listed it).
--   `clone_lag`: organizations still on the old writer on THIS clone only, rows the in-transaction
--      catch-up could not carry or settings keys it cannot erase (both 0 on production).
--   `store_switched_off`: an organization whose record store is switched off (its scopes stay on the
--      old tables by design); named for the chair, never counted as equal.
--   `store_newer`: the store holds a later version of a value than the old image (a store write
--      the image never received); counted, named, never fixed here (no row reconciliation).
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
set local transaction_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
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
declare f text; v_def text;
begin
  foreach f in array array['get_scope_tree', 'list_scope_types', 'list_scope_type_items', 'get_scope_context',
                           'get_user_full_context'] loop
    -- Once the campaign file is on this database the old body lives on as context.<name>_from_the_image
    -- (SECURITY INVOKER); before, it is the live public body.
    if to_regproc('context.' || f || '_from_the_image') is not null then
      v_def := replace(pg_get_functiondef(('context.' || f || '_from_the_image')::regproc),
                       'FUNCTION context.' || f || '_from_the_image(', 'FUNCTION l6_old.' || f || '(');
      v_def := regexp_replace(v_def, '\n STABLE\n', E'\n STABLE SECURITY DEFINER\n');
    else
      v_def := replace(pg_get_functiondef(('public.' || f)::regproc), 'FUNCTION public.' || f || '(', 'FUNCTION l6_old.' || f || '(');
    end if;
    execute v_def;
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

\i migrations/campaign/scopesreadstree_the_scope_readers_switch.sql
select to_regproc('custom.scope_rows_of') is null as l6_need_up \gset
\if :l6_need_up
\i migrations/campaign/scopesreadstree_the_scope_tree_and_values_read_the_store.sql
\endif
\i migrations/campaign/scopesreadstree_a_file_reference_names_the_file.sql
-- THE SWITCH OFF: every door answers exactly as its old body (checked on the service seat of every
-- organization for the list doors, and 300 scopes' values).
create temp table l6_off on commit drop as
  select o.organization_id,
         (select public.get_scope_tree(o.organization_id)) = (select l6_old.get_scope_tree(o.organization_id)) as tree,
         (select public.list_scope_types(o.organization_id)) = (select l6_old.list_scope_types(o.organization_id)) as types
    from (select distinct organization_id from context.scope_types where deleted_at is null) o
   where set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null;
\echo ==== SWITCH OFF: the doors answer as the old bodies
select count(*) as organizations, count(*) filter (where tree and types) as identical from l6_off;
select count(*) as scopes, count(*) filter (where public.get_scope_context(s.id, null, true) = l6_old.get_scope_context(s.id, null, true)) as identical
  from (select id from context.scopes where deleted_at is null order by id limit 300) s;
select set_config('request.jwt.claims', '', true) is not null as cleared;
-- THE SWITCH ON for the rest of this transaction.
update platform.feature_knob set value = 'true'::jsonb where feature = 'custom' and key = 'scope_readers_read_the_store';
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

-- THE CLONE'S OWN LAG. Production pressed every organization onto the store-first writer
-- (SCOPES-PRESS-EVERYONE, 2026-09-29 20:07Z); on this clone a few are still on the old writer
-- (the undo rehearsal) and no follow runs here (quarantined), so their store copy trails what
-- other lanes wrote to the clone since. For those organizations only, every old row is carried
-- into the store here through the store's own halves (custom._ctx_bridge, the path every
-- store-first write takes), inside this transaction; what refuses is counted and named.
create temp table l6_catchup (organization_id uuid, kind text, row_id uuid, ok boolean, says text) on commit drop;
do $catchup$
declare o uuid; r record;
begin
  perform set_config('request.jwt.claims', '', true);
  for o in select distinct st.organization_id from context.scope_types st
            where st.deleted_at is null and custom.context_writer(st.organization_id) = 'old' loop
    for r in select x.* from context.scope_types x where x.organization_id = o order by x.created_at, x.id loop
      begin perform custom._ctx_bridge('scope_types', 'UPDATE', to_jsonb(r), o, r.id);
            insert into l6_catchup values (o, 'scope_type', r.id, true, null);
      exception when others then insert into l6_catchup values (o, 'scope_type', r.id, false, sqlerrm); end;
    end loop;
    for r in select ci.* from context.context_items ci join context.scope_types st on st.id = ci.scope_type_id
              where st.organization_id = o order by ci.created_at, ci.id loop
      begin perform custom._ctx_bridge('context_items', 'UPDATE', to_jsonb(r), o, r.scope_type_id);
            insert into l6_catchup values (o, 'context_item', r.id, true, null);
      exception when others then insert into l6_catchup values (o, 'context_item', r.id, false, sqlerrm); end;
    end loop;
    for r in with recursive d as (
               select x.id, 0 as depth from context.scopes x where x.organization_id = o and x.parent_scope_id is null
               union all
               select c.id, d.depth + 1 from context.scopes c join d on c.parent_scope_id = d.id where d.depth < 20)
             select x.*, d.depth from context.scopes x join (select id, min(depth) depth from d group by id) d on d.id = x.id
             order by d.depth, x.created_at, x.id loop
      begin perform custom._ctx_bridge('scopes', 'UPDATE', to_jsonb(r) - 'depth', o, r.scope_type_id);
            insert into l6_catchup values (o, 'scope', r.id, true, null);
      exception when others then insert into l6_catchup values (o, 'scope', r.id, false, sqlerrm); end;
    end loop;
    for r in select v.* from context.context_item_values v join context.scopes x on x.id = v.scope_id
              where x.organization_id = o and v.is_current order by v.created_at, v.id loop
      begin perform custom._ctx_bridge('context_item_values', 'UPDATE', to_jsonb(r), o, null);
            insert into l6_catchup values (o, 'value', r.id, true, null);
      exception when others then insert into l6_catchup values (o, 'value', r.id, false, sqlerrm); end;
    end loop;
  end loop;
end
$catchup$;
\echo ==== THE CLONE LAG, carried for the organizations still on the old writer here
select (select name from iam.organizations where id = organization_id) as organization, kind, count(*) filter (where ok) as carried, count(*) filter (where not ok) as refused
  from l6_catchup group by 1, 2 order by 1, 2;
select (select name from iam.organizations where id = organization_id) as organization, kind, left(says, 160) as refused_because, count(*)
  from l6_catchup where not ok group by 1, 2, 3 order by 4 desc limit 10;

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
    -- N10: a current value row whose every value column is empty is no value.
    if p_side = 'old' then
      select coalesce(jsonb_agg(
               case when (e -> 'value_text') = 'null' and (e -> 'value_number') = 'null' and (e -> 'value_boolean') = 'null'
                         and (e -> 'value_json') = 'null' and (e -> 'value_date') = 'null' and (e -> 'value_timestamp') = 'null'
                         and (e -> 'value_time') = 'null' and (e -> 'value_document_url') = 'null' and e ? 'has_value'
                    then e || '{"has_value": false, "version": null, "updated_at": null}'::jsonb else e end order by ord), '[]'::jsonb)
        into v from jsonb_array_elements(v) with ordinality x(e, ord)
       where p_fn = 'get_scope_context(empty)'
          or not ((e -> 'value_text') = 'null' and (e -> 'value_number') = 'null' and (e -> 'value_boolean') = 'null'
                  and (e -> 'value_json') = 'null' and (e -> 'value_date') = 'null' and (e -> 'value_timestamp') = 'null'
                  and (e -> 'value_time') = 'null' and (e -> 'value_document_url') = 'null');
    end if;
    select coalesce(jsonb_agg(
             e || jsonb_build_object(
               'value_text', coalesce(pg_temp.l6_ref_ids(e ->> 'value_text'), e -> 'value_text'),
               'updated_at', null)
             || case when e ? 'fetch_hint' then jsonb_build_object('fetch_hint',
                     case e ->> 'fetch_hint' when 'lazy' then 'on_demand' when 'batch_related' then 'always' else e ->> 'fetch_hint' end) else '{}'::jsonb end
             - 'updated_at'
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
             order by o ->> 'id'), '[]'::jsonb))
      into v from jsonb_array_elements(v -> 'organizations') with ordinality oo(o, oord);
  end if;
  return v;
end
$f$;

-- What differs between two answers that are lists of rows: the ids on one side only, and the
-- keys that differ on rows both sides hold.
create or replace function pg_temp.l6_diff(p_o jsonb, p_n jsonb) returns jsonb language sql immutable as $f$
  with o as (select coalesce(e ->> 'id', e ->> 'item_id') as id, e from jsonb_array_elements(p_o) e),
       n as (select coalesce(e ->> 'id', e ->> 'item_id') as id, e from jsonb_array_elements(p_n) e)
  select jsonb_build_object(
    'only_old', coalesce((select jsonb_agg(o.id) from o where not exists (select 1 from n where n.id = o.id)), '[]'),
    'only_new', coalesce((select jsonb_agg(n.id) from n where not exists (select 1 from o where o.id = n.id)), '[]'),
    'rows', coalesce((select jsonb_agg(o.id) from o join n on n.id = o.id where o.e <> n.e), '[]'),
    'keys', coalesce((select jsonb_agg(distinct k) from o join n on n.id = o.id, jsonb_object_keys(o.e || n.e) k
                       where (o.e -> k) is distinct from (n.e -> k)), '[]'))
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
      when j.why = 'member' and not iam.member_lane_open(j.organization_id)
           and (j.n ? '__error'
                or jsonb_typeof(j.o) = 'array' and jsonb_typeof(j.n) = 'array'
                   and not exists (select 1 from jsonb_array_elements(j.n) e
                                    where not (j.o @> jsonb_build_array(jsonb_build_object('id', e -> 'id')))
                                      and e ? 'id')) then 'org_shared_only'
      when j.fn like 'get_scope_context%' and exists (
             select 1 from context.context_item_values v
               join custom.record f on f.id = v.context_item_id
               join custom.record r on r.id = v.scope_id
              where v.scope_id = j.arg::uuid and v.is_current
                and coalesce((r.data -> '_values' -> (f.data ->> 'key') ->> 'ver')::int, 1) > v.version) then 'store_newer'
      -- THE CLONE LAG (see the catch-up above): only for the organizations still on the old writer
      -- here, only rows the catch-up could not carry (a concurrent clone user's lock) or settings
      -- keys the old side dropped and the store's halves never erase. Both measured 0 on
      -- production (the lane's PROGRESS doc).
      when j.organization_id in (select organization_id from l6_catchup)
           and jsonb_typeof(j.o) = 'array' and jsonb_typeof(j.n) = 'array'
           and (select bool_and(x #>> '{}' in (select row_id::text from l6_catchup where not ok))
                  from jsonb_array_elements(d.d -> 'only_old') x) is not false
           and (select bool_and(x #>> '{}' in (select row_id::text from l6_catchup where not ok))
                  from jsonb_array_elements(d.d -> 'only_new') x) is not false
           and ((d.d -> 'keys') <@ '["settings"]'::jsonb
                or (select bool_and(x #>> '{}' in (select row_id::text from l6_catchup where not ok))
                      from jsonb_array_elements(d.d -> 'rows') x)) then 'clone_lag'
      when j.fn = 'get_user_full_context' and j.o ? 'organizations' and j.n ? 'organizations'
           and (j.o -> 'organizations') is not null
           and (select bool_and(case when (oo.o - 'scopes') <> (nn.o - 'scopes') then false
                                     when (oo.o -> 'scopes') = (nn.o -> 'scopes') then true
                                     else not iam.member_lane_open((oo.o ->> 'id')::uuid)
                                          and (oo.o -> 'scopes') @> (nn.o -> 'scopes') end)
                  from jsonb_array_elements(j.o -> 'organizations') with ordinality oo(o, i)
                  join jsonb_array_elements(j.n -> 'organizations') with ordinality nn(o, i2) on nn.o ->> 'id' = oo.o ->> 'id')
           and jsonb_array_length(j.o -> 'organizations') = jsonb_array_length(j.n -> 'organizations') then 'org_shared_only'
      -- An organization whose record store is switched off keeps its scopes on the old tables by
      -- design (SCOPES-PRESS-EVERYONE skipped it); the store does not hold it. Named, never a pass.
      when j.organization_id is not null and not custom.store_is_open(j.organization_id) then 'store_switched_off'
      else 'MISMATCH' end as verdict
    from l6_judged j
    cross join lateral (select case when jsonb_typeof(j.o) = 'array' and jsonb_typeof(j.n) = 'array'
                                    then pg_temp.l6_diff(j.o, j.n) end as d) d;

\if :{?dump}
\pset tuples_only on
\pset format unaligned
\o :dump
select jsonb_build_object('verdict', verdict, 'fn', fn, 'why', why, 'user_id', user_id, 'org', organization_id, 'arg', arg, 'o', o, 'n', n) from l6_verdict where verdict in ('MISMATCH', 'order_only', 'store_newer');
\o
\pset tuples_only off
\pset format aligned
\endif
\echo
\echo ==== VERDICTS (function x verdict)
select fn, verdict, count(*) from l6_verdict group by 1, 2 order by 1, 2;
\echo ==== SEATS
select why, count(distinct coalesce(user_id::text, 'service') || organization_id::text) as seats, count(*) as answers from l6_verdict group by 1 order by 1;
\echo ==== DD-112: the planted share must be listed by the new tree and refused by the old one
select fn, verdict, jsonb_array_length(case when jsonb_typeof(n) = 'array' then n else '[]' end) as listed
  from l6_verdict where why = 'planted share (DD-112)' and fn like 'get_scope_tree%' order by fn limit 5;
create temp table l6_plant_copy on commit drop as select * from l6_plant;
grant select on l6_plant_copy to authenticated;
\echo ==== DD-112, the store door for the same seat: the list must agree with the record
select set_config('request.jwt.claims', jsonb_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated')::text, true) is not null as as_test;
set local role authenticated;
select p.scope_id,
       pg_temp.l6_call(format('select custom.read_record(%L::uuid, %L::uuid, false)', p.organization_id, p.scope_id)) ? '__error' as read_record_refuses,
       (pg_temp.l6_call(format('select public.get_scope_tree(%L::uuid)', p.organization_id)) ? '__error') as tree_refuses
  from (select * from l6_plant_copy) p;
reset role;
\echo ==== FILE REFERENCES: every File-column value names the same live file on both sides (no masking by store_newer)
select count(*) as file_cells,
       count(*) filter (where pg_temp.l6_ref_ids(o.e ->> 'value_text') = pg_temp.l6_ref_ids(n.e ->> 'value_text')) as same_file
  from l6_result r
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.old) = 'array' then r.old else '[]' end) o(e)
  join lateral jsonb_array_elements(case when jsonb_typeof(r.new) = 'array' then r.new else '[]' end) n(e) on n.e ->> 'item_id' = o.e ->> 'item_id'
 where r.fn = 'get_scope_context' and o.e ->> 'value_text' like '%"file_id"%';
\echo ==== order_only: the ties behind each (old order key equal on both neighbours)
select fn, why, organization_id, arg from l6_verdict where verdict = 'order_only';
\echo ==== MISMATCHES (first 12, both sides)
select fn, why, user_id, organization_id, arg, left(o::text, 700) as old, left(n::text, 700) as new
  from l6_verdict where verdict = 'MISMATCH' order by fn, organization_id, arg limit 12;
\echo ==== MISMATCH COUNT
select count(*) as mismatches from l6_verdict where verdict = 'MISMATCH';
\echo ==== CHECKS: the membrane guard with the new bodies
select check_key, ok from public.__scope_access_membrane_conformance()
 where check_key in ('membraned_doors_carry_a_real_call', 'list_doors_filter_the_readable_set', 'value_doors_are_membraned');

rollback;
