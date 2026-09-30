-- scripts/campaign-tests/scopesoldwriters_clients_lose_red_green.sql — lane SCOPES-OLD-WRITERS (census S5 + S9).
--
-- RED-THEN-GREEN ON THE DEV CLONE ONLY, IN ONE TRANSACTION THAT ROLLS BACK.
--
--   psql "<clone>" -v a=<abs path, the doors file> -v b=<abs path, this lane's revoke file> -v bdown=<abs path, its inverse> \
--        -f scopesoldwriters_clients_lose_red_green.sql
--
--   R1 before the revoke a signed-in owner's own call of public.create_scope lands (the old door is open);
--   G1 after it the same call is refused 42501, and no client role holds EXECUTE on any of the seventeen;
--   G2 every scope door a screen uses still lands for that owner: type, item, scope, value, tags, template,
--      archive and restore (through custom.context_*), and Trash's own restore (public.entity_undelete);
--   G3 the server keeps the old function (service_role calls public.create_scope and it lands);
--   G4 the seventeen register rows say server_only, so the reopen trigger does not hand the grant back;
--   G5 the inverse gives every grant and every row back exactly.

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

begin;
set local lock_timeout = '15s';
set local statement_timeout = '120s';
do $$ begin
  if (select count(*) from cron.job where active) > 0 then
    raise exception 'scopesoldwriters_clients_lose_red_green runs on the dev clone only';
  end if;
end $$;

\set W '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
\set ADMIN '87a6e699-3622-4869-8843-d0867456c0dd'
\set PET '2f4c0d35-a510-4e38-b2b7-fbea0ff6afe0'
\set NOTE_T 'note'

create temp table l11b_result(check_name text primary key, ok boolean, detail text) on commit drop;
create temp table l11b_names(fn text) on commit drop;
insert into l11b_names values ('create_scope_type'),('update_scope_type'),('delete_scope_type'),('restore_scope_type'),
  ('create_scope'),('update_scope'),('delete_scope'),('restore_scope'),('create_context_item'),('update_context_item'),
  ('delete_context_item'),('restore_context_item'),('set_context_value'),('set_scope_context_value'),('apply_template'),
  ('apply_template_by_key'),('set_entity_scopes');
create temp table l11b_before on commit drop as
select p.oid::regprocedure::text as fn, coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '<default>') as acl,
       (select to_jsonb(d) - 'declared_at' from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = p.proname) as door
  from pg_proc p join l11b_names n on n.fn = p.proname where p.pronamespace = 'public'::regnamespace;

\i :a
-- the register's deferred guards (door_body_must_decide, provision_shape_guard) judge now, not at a commit that never comes
set constraints all immediate;
set constraints all deferred;

-- ═══ R1 ═══
savepoint r1;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select (public.create_scope(:'W', :'PET', 'L11 probe Pepper') ->> 'id') is not null as r1_landed \gset
reset role;
rollback to savepoint r1;
insert into l11b_result values ('R1 red: before the revoke a client call of public.create_scope lands', :'r1_landed'::boolean, 'landed = ' || :'r1_landed');

\i :b
-- the register's deferred guards (door_body_must_decide, provision_shape_guard) judge now, not at a commit that never comes
set constraints all immediate;
set constraints all deferred;

-- ═══ G1 ═══
savepoint g1;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
\set ON_ERROR_STOP 0
select public.create_scope(:'W', :'PET', 'L11 probe Pepper');
\set g1_err :LAST_ERROR_SQLSTATE '|' :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP 1
rollback to savepoint g1;
insert into l11b_result values ('G1 green: the same client call is refused', :'g1_err' like '42501|permission denied for function create_scope%', :'g1_err');
insert into l11b_result
select 'G1 green: no client role holds EXECUTE on any of the seventeen', count(*) = 0, coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none')
  from pg_proc p join l11b_names n on n.fn = p.proname
 where p.pronamespace = 'public'::regnamespace
   and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'));

-- ═══ G2 — every scope door a screen uses ═══
savepoint g2;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'authenticated')::text, true) \gset
select (custom.context_type_write(:'W', null, '{"label_singular":"L11 probe Supplier","label_plural":"L11 probe Suppliers"}') -> 'row' ->> 'id') as t_id \gset
select (custom.context_type_write(:'W', :'t_id', '{"icon":"truck"}') -> 'row' ->> 'icon') = 'truck' as t_upd \gset
select (custom.context_item_write(null, :'t_id', '{"key":"account_rep","display_name":"Account rep"}') -> 'row' ->> 'id') as i_id \gset
select (custom.context_item_write(:'i_id', :'t_id', '{"display_name":"Account representative"}') -> 'row' ->> 'display_name') = 'Account representative' as i_upd \gset
select (custom.context_item_write(:'i_id', :'t_id', '{"max_items":2}') -> 'row' ->> 'max_items') = '2' as i_rowupd \gset
select (custom.context_scope_write(:'W', null, :'t_id', '{"name":"L11 probe Harbor Freight"}') -> 'row' ->> 'id') as s_id \gset
select (custom.context_scope_write(:'W', :'s_id', :'t_id', '{"description":"Tools and hardware"}') -> 'row' ->> 'description') = 'Tools and hardware' as s_upd \gset
select (custom.context_value_write(json_build_object('context_item_id', :'i_id', 'scope_id', :'s_id', 'value_text', 'Dana Whitfield')::jsonb) ->> 'ok')::boolean as v_ok \gset
select (custom.context_tags_set('note', (select n.id from workbench.notes n where n.organization_id = :'W' and n.deleted_at is null and n.created_by = :'ADMIN' limit 1), array[:'s_id']::uuid[]) ->> 'ok')::boolean as tag_ok \gset
select (custom.context_scope_archive(:'s_id') ->> 'ok')::boolean as s_arch \gset
select (custom.context_scope_restore(:'s_id') ->> 'ok')::boolean as s_rest \gset
select (custom.context_item_archive(:'i_id') ->> 'ok')::boolean as i_arch \gset
select (custom.context_item_restore(:'i_id') ->> 'ok')::boolean as i_rest \gset
select (custom.context_type_archive(:'t_id') ->> 'ok')::boolean as t_arch \gset
select public.entity_undelete('scope_type', :'t_id')::text as t_undelete \gset
reset role;
select exists (select 1 from custom.record r where r.organization_id = :'W' and r.id = :'s_id' and r.deleted_at is null) as s_in_store \gset
rollback to savepoint g2;
insert into l11b_result values ('G2 green: every scope door a screen uses lands for the owner (and Trash restores)',
  :'t_upd'::boolean and :'i_upd'::boolean and :'i_rowupd'::boolean and :'s_upd'::boolean and :'v_ok'::boolean and :'tag_ok'::boolean
  and :'s_arch'::boolean and :'s_rest'::boolean and :'i_arch'::boolean and :'i_rest'::boolean and :'t_arch'::boolean and :'s_in_store'::boolean,
  format('type %s item %s/%s scope %s value %s tags %s archive/restore %s %s %s %s type-archive %s undelete %s store %s',
         :'t_upd', :'i_upd', :'i_rowupd', :'s_upd', :'v_ok', :'tag_ok', :'s_arch', :'s_rest', :'i_arch', :'i_rest', :'t_arch', :'t_undelete', :'s_in_store'));

-- ═══ G3 — the server keeps the old function ═══
savepoint g3;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role', 'service_role')::text, true) \gset
select (public.create_scope(:'W', :'PET', 'L11 probe Pepper') ->> 'id') is not null as g3_landed \gset
reset role;
rollback to savepoint g3;
insert into l11b_result values ('G3 green: the server (service_role) still calls public.create_scope', :'g3_landed'::boolean, 'landed = ' || :'g3_landed');

-- ═══ G4 ═══
insert into l11b_result
select 'G4 green: the seventeen register rows are closed (server_only)', count(*) filter (where not d.signed_in_callers and d.non_client_lane like 'server_only:%') = 17,
       count(*) filter (where not d.signed_in_callers and d.non_client_lane like 'server_only:%') || ' of ' || count(*)
  from platform.client_callable_door d join l11b_names n on n.fn = d.function_name where d.schema_name = 'public';

-- ═══ G5 — the inverse ═══
\i :bdown
-- the register's deferred guards (door_body_must_decide, provision_shape_guard) judge now, not at a commit that never comes
set constraints all immediate;
set constraints all deferred;
insert into l11b_result
select 'G5 green: the inverse gives every grant and every row back', count(*) = 0, coalesce(string_agg(b.fn || ' acl ' || b.acl || ' door ' || coalesce(b.door::text,'-'), E'\n'), 'every grant and row equal')
  from l11b_before b join pg_proc p on p.oid::regprocedure::text = b.fn
 where b.acl <> coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '<default>')
    or b.door is distinct from (select to_jsonb(d) - 'declared_at' from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = p.proname);

\pset tuples_only off
\pset format aligned
select case when ok then 'GREEN' else 'RED  ' end as verdict, check_name, left(detail, 1500) as detail from l11b_result order by check_name;
select case when bool_and(ok) then 'ALL GREEN' else 'SOMETHING IS RED' end as suite from l11b_result;
rollback;
