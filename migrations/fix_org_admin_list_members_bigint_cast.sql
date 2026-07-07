-- Pre-existing 42804: sum(bigint) yields numeric; declared column is bigint. Cast in the lateral.
CREATE OR REPLACE FUNCTION public.org_admin_list_members(p_org_id uuid)
 RETURNS TABLE(user_id uuid, email text, display_name text, avatar_url text, role text, joined_at timestamp with time zone, status text, member_level text, tier_override text, storage_cap_bytes bigint, monthly_budget_mcents bigint, org_files_count bigint, org_bytes_used bigint, account_bytes_used bigint, account_files_count integer, last_org_activity_at timestamp with time zone, last_request_at timestamp with time zone, cost_24h_mcents bigint, requests_24h integer, requests_6h integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  return query
  select om.user_id,
         au.email::text,
         coalesce(p.display_name, au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')::text,
         coalesce(p.avatar_url, au.raw_user_meta_data->>'avatar_url')::text,
         om.role::text,
         om.joined_at,
         coalesce(c.status, 'active'),
         c.member_level, c.tier_override, c.storage_cap_bytes, c.monthly_budget_mcents,
         coalesce(f.org_files_count, 0), coalesce(f.org_bytes_used, 0),
         coalesce(su.bytes_used, 0), coalesce(su.files_count, 0),
         conv.last_org_activity_at,
         uus.last_request_at, coalesce(uus.cost_24h_mcents, 0), coalesce(uus.requests_24h, 0), coalesce(uus.requests_6h, 0)
  from iam.organization_member om
  left join auth.users au               on au.id = om.user_id
  left join users.profiles p           on p.id  = om.user_id
  left join iam.org_member_controls c    on c.organization_id = om.organization_id and c.user_id = om.user_id
  left join lateral (
    select count(*) as org_files_count, coalesce(sum(ff.size_bytes), 0)::bigint as org_bytes_used
    from files.files ff
    where ff.organization_id = om.organization_id and ff.created_by = om.user_id and ff.deleted_at is null
  ) f on true
  left join files.user_storage_usage su  on su.user_id = om.user_id
  left join chat.user_usage_summary uus  on uus.user_id = om.user_id
  left join lateral (
    select max(cv.updated_at) as last_org_activity_at
    from chat.conversation cv
    where cv.organization_id = om.organization_id and cv.created_by = om.user_id and cv.deleted_at is null
  ) conv on true
  where om.organization_id = p_org_id
  order by om.joined_at asc;
end;
$function$;
