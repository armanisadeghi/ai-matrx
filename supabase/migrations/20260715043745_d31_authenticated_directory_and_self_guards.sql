-- D31: authenticated callers must not turn definer RPC parameters into a
-- cross-user/cross-organization read primitive.

create or replace function public.get_user_lists_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if (auth.role() = 'service_role' or p_user_id = auth.uid()) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'list_id', l.id,
      'list_name', l.list_name,
      'description', l.description,
      'created_at', l.created_at,
      'updated_at', l.updated_at,
      'item_count', (
        select count(*)
        from workbench.udt_structured_list_items i
        where i.list_id = l.id
      ),
      'group_count', (
        select count(distinct i.group_name)
        from workbench.udt_structured_list_items i
        where i.list_id = l.id
      )
    )
    order by l.created_at desc
  )
  into v_result
  from workbench.udt_structured_lists l
  where l.user_id = p_user_id;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_organization_members_with_users(p_org_id uuid)
returns table(
  id uuid,
  organization_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  invited_by uuid,
  user_email text,
  user_display_name text,
  user_avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  return query
  select
    om.id,
    om.organization_id,
    om.user_id,
    om.role::text,
    om.joined_at,
    om.invited_by,
    au.email::text,
    coalesce(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name',
      ''
    )::text,
    coalesce(au.raw_user_meta_data ->> 'avatar_url', '')::text
  from iam.organization_member om
  left join auth.users au on au.id = om.user_id
  where om.organization_id = p_org_id
  order by om.joined_at asc;
end;
$function$;

create or replace function public.search_users_intelligent(
  search_term text,
  current_user_id uuid,
  max_results integer default 10
)
returns table(
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  match_score integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_search_term text := btrim(coalesce(search_term, ''));
  v_limit integer := greatest(1, least(coalesce(max_results, 10), 50));
begin
  if (auth.role() = 'service_role' or current_user_id = auth.uid()) is not true then
    raise exception 'access denied: caller identity mismatch'
      using errcode = '42501';
  end if;

  if length(v_search_term) < 2 then
    raise exception 'search term must contain at least 2 characters'
      using errcode = '22023';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      split_part(u.email::text, '@', 1)
    )::text,
    (u.raw_user_meta_data ->> 'avatar_url')::text,
    case
      when lower(u.email::text) = lower(v_search_term) then 100
      when lower(u.email::text) like lower(v_search_term) || '%' then 80
      when lower(u.email::text) like '%' || lower(v_search_term) || '%' then 60
      when lower(coalesce(u.raw_user_meta_data ->> 'display_name', ''))
        like '%' || lower(v_search_term) || '%' then 50
      else 10
    end
  from auth.users u
  where u.id <> current_user_id
    and (
      lower(u.email::text) like '%' || lower(v_search_term) || '%'
      or lower(coalesce(u.raw_user_meta_data ->> 'display_name', ''))
        like '%' || lower(v_search_term) || '%'
      or lower(coalesce(u.raw_user_meta_data ->> 'full_name', ''))
        like '%' || lower(v_search_term) || '%'
    )
  order by 5 desc, u.email
  limit v_limit;
end;
$function$;

revoke execute on function public.get_user_lists_summary(uuid) from public, anon;
revoke execute on function public.get_organization_members_with_users(uuid) from public, anon;
revoke execute on function public.search_users_intelligent(text, uuid, integer) from public, anon;

grant execute on function public.get_user_lists_summary(uuid) to authenticated, service_role;
grant execute on function public.get_organization_members_with_users(uuid) to authenticated, service_role;
grant execute on function public.search_users_intelligent(text, uuid, integer) to authenticated, service_role;
