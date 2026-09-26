-- THE DOOR LAW for link pickers: a picker offers only the kinds of record that CAN be linked here.
-- Found 2026-09-26 (RC-B11 verify): the passage "Link…" picker offered every listable kind, and all but a
-- handful failed with an unregistered pair — a dead choice. Clients cannot read platform.association_types,
-- so this signed-in read door answers "which kinds of record may be linked TO a <target_type>" (edges are
-- stored linked-record → annotated record) from the registry itself: active pairs whose label is unset
-- (any label) or the one asked for. Configuration only — no record, id or person is returned.

set local lock_timeout = '2s';

create or replace function public.association_link_sources(p_target_type text, p_label text default null)
 returns table(source_type text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select distinct t.source_type::text
    from platform.association_types t
   where t.target_type = p_target_type
     and t.is_active
     and (t.label is null or t.label = p_label)
   order by 1;
$function$;

comment on function public.association_link_sources(text, text) is
  'The kinds of record that may be linked TO p_target_type (registered, active association pairs; label unset or = p_label). Link pickers offer only these (door law). Registry configuration only.';

-- Declared signed-in door (platform.client_callable_door), BEFORE the grant.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'public', 'association_link_sources', pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes), 'rcb11',
       'Link pickers: which kinds of record may be linked to this kind (registry configuration only, no records).', true
  from pg_proc p where p.oid = 'public.association_link_sources(text, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'association_link_sources');
grant execute on function public.association_link_sources(text, text) to authenticated, service_role;
