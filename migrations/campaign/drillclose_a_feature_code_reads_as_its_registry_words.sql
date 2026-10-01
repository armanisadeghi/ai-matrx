-- chair-step: lane DRILL-CLOSE (VERIFY-DRILL-FINAL "raw feature codes in names") — the names door
-- platform.ai_usage_names gains a `feature` part: a feature code reads as its registry's words (the
-- ai_usage definition's declared choices for the feature, else the source, Dimension; a mandate or a
-- mandate's slot as mandate.definition.label; an agent service as its agent's name), and a request
-- with no conversation reads as those words, else its code in plain words, never the raw code
-- ("mandate:news.coarse_relevance · Sep 30" → "News relevance check · Sep 30"). Replaces ONE body;
-- no table, no grant, no registry row changes; STABLE, reads only.
-- lane: DRILL-CLOSE
-- lock: platform
-- based-on: platform.ai_usage_names(uuid, jsonb) 6153fd9b2b7d7d4643684313b720b00ddb9b2abfe7ce7566033d1ea42a3b40b1
-- Inverse: migrations/inverse/drillclose_a_feature_code_reads_as_its_registry_words_down.sql (the
-- production body this replaces, verbatim).

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
  v_feature text[];
  v_words   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'platform.ai_usage_names');
  if not public.is_platform_admin() then
    raise exception 'The names behind AI usage are read only inside the admin apps, by a platform admin.'
      using errcode = '42501';
  end if;
  if p_ids is not null and jsonb_typeof(p_ids) <> 'object' then
    raise exception 'p_ids is {"organization": [...], "person": [...], "agent": [...], "session": [...], "request": [...], "feature": [...]}.' using errcode = '22023';
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
  select coalesce(array_agg(distinct x), '{}') into v_feature
    from jsonb_array_elements_text(coalesce(p_ids -> 'feature', '[]')) x where length(btrim(x)) between 1 and 300;
  if cardinality(v_org) + cardinality(v_user) + cardinality(v_agent) + cardinality(v_session) + cardinality(v_request) + cardinality(v_feature) > 3000 then
    raise exception 'At most 3,000 names are read at once.' using errcode = '22023';
  end if;
  -- A FEATURE CODE READS AS ITS REGISTRY'S WORDS (lane DRILL-CLOSE, VERIFY-DRILL-FINAL "raw feature
  -- codes"): a code the ai_usage definition declares (its feature, else its source choices — the
  -- ledger records the execution's source as its feature when the caller named none: "sch_run") reads
  -- as the definition's label; a mandate (or a mandate's slot) as the mandate's own declared label
  -- (mandate.definition, the declared-mandate registry the sync writes); an agent service as its
  -- agent's name. No word is written here. A code nothing names is left out: the screen reads it in
  -- plain words. The request part below uses the same words for a request with no conversation.
  with codes as (
    select unnest(v_feature) as code
    union
    select btrim(ur.source_feature) from unnest(v_request) i(id) join chat.user_request ur on ur.id = i.id
     where nullif(btrim(ur.source_feature), '') is not null
  ), declared as (
    select c ->> 'value' as v, c ->> 'label' as l, case d ->> 'key' when 'feature' then 0 else 1 end as pri
      from jsonb_array_elements(coalesce(platform.drill_def__ai_usage() -> 'dimensions', '[]')) d
      cross join jsonb_array_elements(coalesce(d -> 'choices', '[]')) c
     where d ->> 'key' in ('feature', 'source')
  )
  select coalesce(jsonb_object_agg(k.code, w.words) filter (where w.words is not null), '{}') into v_words
    from codes k
    cross join lateral (select coalesce(
      (select nullif(btrim(dc.l), '') from declared dc where dc.v = k.code order by dc.pri limit 1),
      case when k.code ~ '^(mandate|slot):.' then
        (select nullif(btrim(m.label), '') from mandate.definition m
          where m.mandate_key = substr(k.code, strpos(k.code, ':') + 1)
          order by (m.deleted_at is null) desc, m.updated_at desc limit 1) end,
      case when k.code ~* '^agent_service:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        (select nullif(btrim(a.name), '') from agent.definition a where a.id = substr(k.code, 15)::uuid) end
    ) as words) w;
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
                 coalesce(nullif(btrim(c.title), ''),
                          v_words ->> btrim(ur.source_feature),
                          -- a code nothing names, in plain words ("lane_e_live" → "Lane e live")
                          nullif(upper(left(pw.words, 1)) || substr(pw.words, 2), ''),
                          'No conversation') || ' · '
                 || to_char(ur.created_at at time zone 'UTC', 'Mon FMDD, FMHH12:MI AM') || ' UTC' end,
               'A request no longer on record')), '{}')
        from unnest(v_request) i(id)
        left join chat.user_request ur on ur.id = i.id
        left join chat.conversation c on c.id = ur.conversation_id
        left join lateral (select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
                    btrim(ur.source_feature),
                    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ' ', 'g'),
                    '([A-Za-z])\.([A-Za-z])', '\1 \2', 'g'), '[_/-]+', ' ', 'g'), '\s*:\s*', ' · ', 'g'), '(\s*·\s*)+$', '')) as words) pw on true),
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
    'feature', (select coalesce(jsonb_object_agg(f.code, v_words -> f.code) filter (where v_words ? f.code), '{}')
                  from unnest(v_feature) f(code)),
    'counted_through', (select max(h.refreshed_at) from runtime._ai_usage_hourly h),
    'counted_since', (select min(h.bucket) from runtime._ai_usage_hourly h));
end
$function$;
