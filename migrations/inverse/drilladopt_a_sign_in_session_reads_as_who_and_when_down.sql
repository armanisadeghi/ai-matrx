-- chair-step: the inverse of migrations/campaign/drilladopt_a_sign_in_session_reads_as_who_and_when.sql (lane DRILL-ADOPT) — puts back platform.ai_usage_names exactly as it was (organization, person and agent names; no "session" part). The usage screens then read a session as "A sign-in session whose sign-in could not be read".
-- lane: DRILL-ADOPT
-- lock: platform
-- based-on: platform.ai_usage_names(uuid, jsonb) 608c948ca46457f12831777c3e3ca12c797c2f0bc6ab7dbad70656afe18513d3

CREATE OR REPLACE FUNCTION platform.ai_usage_names(p_organization_id uuid, p_ids jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid[];
  v_user  uuid[];
  v_agent uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'platform.ai_usage_names');
  if not public.is_platform_admin() then
    raise exception 'The names behind AI usage are read only inside the admin apps, by a platform admin.'
      using errcode = '42501';
  end if;
  if p_ids is not null and jsonb_typeof(p_ids) <> 'object' then
    raise exception 'p_ids is {"organization": [...], "person": [...], "agent": [...]}.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_org
    from jsonb_array_elements_text(coalesce(p_ids -> 'organization', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x::uuid), '{}') into v_user
    from jsonb_array_elements_text(coalesce(p_ids -> 'person', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x::uuid), '{}') into v_agent
    from jsonb_array_elements_text(coalesce(p_ids -> 'agent', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  if cardinality(v_org) + cardinality(v_user) + cardinality(v_agent) > 3000 then
    raise exception 'At most 3,000 names are read at once.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'organization', (
      select coalesce(jsonb_object_agg(i.id, coalesce(
               case when o.name ~ '^Organization [0-9a-f]{8}$' then
                      case when ow.email is not null and ow.email <> '' then ow.email || '''s workspace'
                           else 'Guest workspace from ' || to_char(o.created_at, 'Mon FMDD, YYYY') end
                    else nullif(btrim(o.name), '') end,
               'An organization that no longer exists')), '{}')
        from unnest(v_org) i(id)
        left join iam.organizations o on o.id = i.id
        left join lateral (
          select u.email from iam.memberships m join auth.users u on u.id = m.user_id
           where m.container_type = 'organization' and m.container_id = o.id and m.role = 'owner' and m.deleted_at is null
           order by m.created_at limit 1) ow on true),
    'person', (
      select coalesce(jsonb_object_agg(i.id, coalesce(
               nullif(u.email, ''), nullif(u.phone, ''),
               nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
               case when u.is_anonymous then 'Guest from ' || to_char(u.created_at, 'Mon FMDD, YYYY') end,
               case when u.id is not null then 'A person with no email or phone' end,
               'A person no longer on the platform')), '{}')
        from unnest(v_user) i(id) left join auth.users u on u.id = i.id),
    'agent', (
      select coalesce(jsonb_object_agg(i.id, coalesce(nullif(btrim(a.name), ''), 'An agent that has since been removed')), '{}')
        from unnest(v_agent) i(id) left join agent.definition a on a.id = i.id),
    'counted_through', (select max(h.refreshed_at) from runtime._ai_usage_hourly h),
    'counted_since', (select min(h.bucket) from runtime._ai_usage_hourly h));
end
$function$
;
