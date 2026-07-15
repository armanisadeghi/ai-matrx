-- D31 authenticated-caller tail: close remaining caller-selected identity and
-- organization paths discovered across every PostgREST-exposed schema.

create or replace function iam.personal_org_id(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'cannot read another user''s personal organization' using errcode = '42501';
  end if;

  return (
    select organization.id
    from iam.organizations as organization
    where organization.is_personal is true
      and organization.created_by = p_user_id
    order by organization.created_at asc
    limit 1
  );
end;
$function$;

alter function public.ensure_personal_organization(uuid)
  rename to _d31_impl_ensure_personal_organization;
revoke execute on function public._d31_impl_ensure_personal_organization(uuid)
  from public, anon, authenticated, service_role;

create function public.ensure_personal_organization(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'cannot create another user''s personal organization' using errcode = '42501';
  end if;

  return public._d31_impl_ensure_personal_organization(p_user_id);
end;
$function$;

revoke execute on function public.ensure_personal_organization(uuid) from public, anon;
grant execute on function public.ensure_personal_organization(uuid) to authenticated, service_role;

alter function public.check_file_rate_limit(uuid, text, integer)
  rename to _d31_impl_check_file_rate_limit;
revoke execute on function public._d31_impl_check_file_rate_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;

create function public.check_file_rate_limit(
  p_actor_id uuid,
  p_kind text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() <> 'service_role' and p_actor_id is distinct from auth.uid() then
    raise exception 'cannot consume another user''s rate limit' using errcode = '42501';
  end if;

  return public._d31_impl_check_file_rate_limit(p_actor_id, p_kind, p_limit);
end;
$function$;

revoke execute on function public.check_file_rate_limit(uuid, text, integer) from public, anon;
grant execute on function public.check_file_rate_limit(uuid, text, integer) to authenticated, service_role;

create or replace function public.rag_source_has_library_grant(
  p_source_kind text,
  p_source_id text,
  p_org_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_org_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_org_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return exists (
    select 1
    from rag.data_store_members as member
    join rag.data_store_grants as grant_row
      on grant_row.data_store_id = member.data_store_id
    where member.source_kind = p_source_kind
      and member.source_id = p_source_id
      and member.deleted_at is null
      and (
        grant_row.audience = 'global'
        or (
          grant_row.audience = 'organization'
          and (
            (p_org_id is not null and grant_row.organization_id = p_org_id)
            or (
              p_org_id is null
              and public.is_member_of_organization(grant_row.organization_id)
            )
          )
        )
        or (
          grant_row.audience = 'industry'
          and exists (
            select 1
            from iam.org_industries as industry
            where industry.industry_id = grant_row.industry_id
              and (
                (p_org_id is not null and industry.organization_id = p_org_id)
                or (
                  p_org_id is null
                  and public.is_member_of_organization(industry.organization_id)
                )
              )
          )
        )
      )
  );
end;
$function$;

create or replace function rag.fn_list_library_catalog(
  p_organization_id uuid default null
)
returns table(
  id uuid,
  name text,
  short_code text,
  description text,
  kind text,
  member_count bigint,
  subscribed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_organization_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return query
  select
    store.id,
    store.name,
    store.short_code,
    store.description,
    store.kind,
    coalesce(member_count.count, 0),
    p_organization_id is not null and exists (
      select 1
      from rag.data_store_grants as grant_row
      where grant_row.data_store_id = store.id
        and grant_row.audience = 'organization'
        and grant_row.organization_id = p_organization_id
    )
  from rag.data_stores as store
  left join (
    select member.data_store_id, count(*) as count
    from rag.data_store_members as member
    where member.deleted_at is null
    group by member.data_store_id
  ) as member_count on member_count.data_store_id = store.id
  where store.discoverable
    and store.is_active
  order by store.name;
end;
$function$;

revoke execute on function public.rag_source_has_library_grant(text, text, uuid) from public, anon;
grant execute on function public.rag_source_has_library_grant(text, text, uuid) to authenticated, service_role;
revoke execute on function rag.fn_list_library_catalog(uuid) from public, anon;
grant execute on function rag.fn_list_library_catalog(uuid) to authenticated, service_role;

-- Dead or server-only functions retain their implementation for compatibility,
-- but browser roles may no longer supply arbitrary identities to them.
revoke execute on function public._library_assert_super_admin(uuid) from public, anon, authenticated;
grant execute on function public._library_assert_super_admin(uuid) to service_role;
revoke execute on function public.get_ssr_agent_shell_data(uuid) from public, anon, authenticated;
grant execute on function public.get_ssr_agent_shell_data(uuid) to service_role;
revoke execute on function public.get_user_form_context(uuid) from public, anon, authenticated;
grant execute on function public.get_user_form_context(uuid) to service_role;
revoke execute on function public.remove_sharing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_sharing(uuid, uuid) to service_role;
revoke execute on function public.rename_storage_folder(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.rename_storage_folder(text, text, text, uuid) to service_role;
