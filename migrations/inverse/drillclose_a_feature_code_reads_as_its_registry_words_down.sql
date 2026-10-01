-- Inverse of migrations/campaign/drillclose_a_feature_code_reads_as_its_registry_words.sql: production's
-- platform.ai_usage_names(uuid, jsonb) body before it (hash 6153fd9b…), verbatim.
-- based-on: platform.ai_usage_names(uuid, jsonb) 8211bbc0b741fc01d8b2a829c2df194c1b605b7ee909b055a40365b45e24ef19

CREATE OR REPLACE FUNCTION platform.ai_usage_names(p_organization_id uuid, p_ids jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid[];
  v_user    uuid[];
  v_agent   uuid[];
  v_session text[];
  v_request uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'platform.ai_usage_names');
  if not public.is_platform_admin() then
    raise exception 'The names behind AI usage are read only inside the admin apps, by a platform admin.'
      using errcode = '42501';
  end if;
  if p_ids is not null and jsonb_typeof(p_ids) <> 'object' then
    raise exception 'p_ids is {"organization": [...], "person": [...], "agent": [...], "session": [...]}.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_org
    from jsonb_array_elements_text(coalesce(p_ids -> 'organization', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x::uuid), '{}') into v_user
    from jsonb_array_elements_text(coalesce(p_ids -> 'person', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x::uuid), '{}') into v_agent
    from jsonb_array_elements_text(coalesce(p_ids -> 'agent', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x), '{}') into v_session
    from jsonb_array_elements_text(coalesce(p_ids -> 'session', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  select coalesce(array_agg(distinct x::uuid), '{}') into v_request
    from jsonb_array_elements_text(coalesce(p_ids -> 'request', '[]')) x where x ~ '^[0-9a-fA-F-]{36}$';
  if cardinality(v_org) + cardinality(v_user) + cardinality(v_agent) + cardinality(v_session) + cardinality(v_request) > 3000 then
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
    -- A SIGN-IN SESSION reads as WHO and WHEN they signed in (lane DRILL-ADOPT, VERIFY-DRILL-WAVE2
    -- W2-4): the words the Spend page gave it (public.admin_spend_breakdown login_label), from the
    -- JWT claims its requests carry — the email, else the person's, and the first authentication
    -- method's time, in UTC. A session id is never shown.
    -- A request reads as its conversation's title, else the feature it ran under (the Spend page's
    -- "Dig here" words, lane DRILL-D1), and when it started (UTC); its id is never shown.
    'request', (
      select coalesce(jsonb_object_agg(i.id, coalesce(
               case when ur.id is not null then
                 coalesce(nullif(btrim(c.title), ''), nullif(btrim(ur.source_feature), ''), 'No conversation') || ' · '
                 || to_char(ur.created_at at time zone 'UTC', 'Mon FMDD, FMHH12:MI AM') || ' UTC' end,
               'A request no longer on record')), '{}')
        from unnest(v_request) i(id)
        left join chat.user_request ur on ur.id = i.id
        left join chat.conversation c on c.id = ur.conversation_id),
    'session', (
      select coalesce(jsonb_object_agg(i.id, coalesce(
               case when r.id is not null then
                 coalesce(nullif(r.metadata -> 'jwt_claims' ->> 'email', ''), nullif(u.email, ''), 'A person with no email')
                 || ' · signed in '
                 || case when (r.metadata -> 'jwt_claims' -> 'amr' -> 0 ->> 'timestamp') ~ '^[0-9]+$'
                         then to_char(to_timestamp((r.metadata -> 'jwt_claims' -> 'amr' -> 0 ->> 'timestamp')::bigint) at time zone 'UTC', 'Mon FMDD, FMHH12:MI AM') || ' UTC'
                         else 'at a time its requests do not record' end
               end,
               'A sign-in session with no request on record')), '{}')
        from unnest(v_session) i(id)
        left join lateral (
          select ur.id, ur.metadata, ur.created_by from chat.user_request ur
           where ur.metadata -> 'jwt_claims' ->> 'session_id' = i.id
           order by ur.created_at limit 1) r on true
        left join auth.users u on u.id = r.created_by),
    'counted_through', (select max(h.refreshed_at) from runtime._ai_usage_hourly h),
    'counted_since', (select min(h.bucket) from runtime._ai_usage_hourly h));
end
$function$;
