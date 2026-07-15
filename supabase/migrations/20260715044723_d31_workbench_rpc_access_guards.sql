-- D31: preserve the mature workbench implementations behind small, auditable
-- authorization wrappers.  The renamed implementations are owner-only; all
-- PostgREST callers go through the original guarded signatures.

alter function public.add_data_row_to_user_table(uuid, jsonb)
  rename to _d31_impl_add_data_row_to_user_table;
alter function public.update_user_table_config(uuid, jsonb, jsonb)
  rename to _d31_impl_update_user_table_config;
alter function public.update_user_table_metadata(uuid, text, text, boolean, boolean)
  rename to _d31_impl_update_user_table_metadata;
alter function public.update_user_list(uuid, varchar, text, boolean, boolean, boolean, jsonb)
  rename to _d31_impl_update_user_list;
alter function public.get_user_table_complete(uuid, text, text)
  rename to _d31_impl_get_user_table_complete;
alter function public.get_user_list_with_items(uuid)
  rename to _d31_impl_get_user_list_with_items;

revoke execute on function public._d31_impl_add_data_row_to_user_table(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public._d31_impl_update_user_table_config(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public._d31_impl_update_user_table_metadata(uuid, text, text, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function public._d31_impl_update_user_list(uuid, varchar, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public._d31_impl_get_user_table_complete(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public._d31_impl_get_user_list_with_items(uuid)
  from public, anon, authenticated, service_role;

create function public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_datasets d
      where d.id = p_table_id and d.user_id = auth.uid()
    )
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_add_data_row_to_user_table(p_table_id, p_data);
end;
$function$;

create function public.update_user_table_config(
  p_table_id uuid,
  p_table_updates jsonb default null,
  p_field_updates jsonb default null
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = auth.uid())
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_config(p_table_id, p_table_updates, p_field_updates);
end;
$function$;

create function public.update_user_table_metadata(
  p_table_id uuid,
  p_table_name text default null,
  p_description text default null,
  p_is_public boolean default null,
  p_authenticated_read boolean default null
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = auth.uid())
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_metadata(
    p_table_id, p_table_name, p_description, p_is_public, p_authenticated_read
  );
end;
$function$;

create function public.update_user_list(
  p_list_id uuid,
  p_list_name varchar default null,
  p_description text default null,
  p_is_public boolean default null,
  p_authenticated_read boolean default null,
  p_public_read boolean default null,
  p_items jsonb default null
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id and l.user_id = auth.uid()
    )
  ) is not true then
    raise exception 'owner access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_list(
    p_list_id, p_list_name, p_description, p_is_public,
    p_authenticated_read, p_public_read, p_items
  );
end;
$function$;

create function public.get_user_table_complete(
  p_table_id uuid,
  p_sort_field text default null,
  p_sort_direction text default 'asc'
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_datasets d
      where d.id = p_table_id
        and (d.is_public or d.user_id = auth.uid())
    )
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'viewer'), false)
  ) is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction);
end;
$function$;

create function public.get_user_list_with_items(p_list_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        and (l.is_public or l.public_read or l.user_id = auth.uid())
    )
    or coalesce(public.has_permission('udt_structured_lists', p_list_id, 'viewer'), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

revoke execute on function public.add_data_row_to_user_table(uuid, jsonb) from public, anon;
revoke execute on function public.update_user_table_config(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.update_user_table_metadata(uuid, text, text, boolean, boolean) from public, anon;
revoke execute on function public.update_user_list(uuid, varchar, text, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function public.add_data_row_to_user_table(uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_user_table_config(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.update_user_table_metadata(uuid, text, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.update_user_list(uuid, varchar, text, boolean, boolean, boolean, jsonb) to authenticated, service_role;

-- Public resources remain readable by ID, but the wrapper enforces the row's
-- visibility before invoking the legacy aggregator.
revoke execute on function public.get_user_table_complete(uuid, text, text) from public;
revoke execute on function public.get_user_list_with_items(uuid) from public;
grant execute on function public.get_user_table_complete(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.get_user_list_with_items(uuid) to anon, authenticated, service_role;

-- Lower-risk RPCs already derive/validate auth.uid(); close the redundant anon
-- grants and pin their resolution paths.
alter function public.get_user_tables() set search_path = public, pg_temp;
alter function public.update_user_table_default_sort(uuid, text, text) set search_path = public, pg_temp;
alter function public.update_user_table_row_ordering(uuid, boolean, jsonb) set search_path = public, pg_temp;
alter function public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) set search_path = public, pg_temp;
alter function public.get_structured_list_for_selection(uuid) set search_path = public, pg_temp;

revoke execute on function public.get_user_tables() from public, anon;
revoke execute on function public.update_user_table_default_sort(uuid, text, text) from public, anon;
revoke execute on function public.update_user_table_row_ordering(uuid, boolean, jsonb) from public, anon;
revoke execute on function public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) from public, anon;
revoke execute on function public.get_structured_list_for_selection(uuid) from public, anon;
grant execute on function public.get_user_tables() to authenticated, service_role;
grant execute on function public.update_user_table_default_sort(uuid, text, text) to authenticated, service_role;
grant execute on function public.update_user_table_row_ordering(uuid, boolean, jsonb) to authenticated, service_role;
grant execute on function public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) to authenticated, service_role;
grant execute on function public.get_structured_list_for_selection(uuid) to authenticated, service_role;
