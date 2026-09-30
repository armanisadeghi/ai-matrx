-- chair-step: the inverse of migrations/campaign/drillusage_every_usage_id_reads_as_a_name.sql (lane DRILL-USAGE-PAGE) — puts back platform.ai_usage_names exactly as it was. No row of anybody's data is touched.
-- lane: DRILL-USAGE-PAGE
-- lock: platform
-- based-on: platform.ai_usage_names(uuid, jsonb) 0a4ec1e20f64fd36854d6a03376cfc2c782cab136b9397792325f8780a5dcd91

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
  select coalesce(array_agg(x::uuid), '{}') into v_org
    from jsonb_array_elements_text(coalesce(p_ids -> 'organization', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(x::uuid), '{}') into v_user
    from jsonb_array_elements_text(coalesce(p_ids -> 'person', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(x::uuid), '{}') into v_agent
    from jsonb_array_elements_text(coalesce(p_ids -> 'agent', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  if cardinality(v_org) + cardinality(v_user) + cardinality(v_agent) > 3000 then
    raise exception 'At most 3,000 names are read at once.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'organization', (select coalesce(jsonb_object_agg(o.id, o.name), '{}') from iam.organizations o where o.id = any (v_org)),
    'person', (select coalesce(jsonb_object_agg(u.id, u.email), '{}') from auth.users u where u.id = any (v_user)),
    'agent', (select coalesce(jsonb_object_agg(a.id, a.name), '{}') from agent.definition a where a.id = any (v_agent)),
    'counted_through', (select max(h.refreshed_at) from runtime._ai_usage_hourly h),
    'counted_since', (select min(h.bucket) from runtime._ai_usage_hourly h));
end
$function$;
