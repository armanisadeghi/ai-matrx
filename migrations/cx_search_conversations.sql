-- cx_search_conversations — authoritative, ranked search for conversation sidebars.
--
-- This is deliberately a separate read contract from cvx_list_scoped. The
-- entity-list RPC serves administrative scopes and table columns; this RPC
-- preserves the sidebar's lane/source/agent semantics and returns its complete
-- row model. It reuses cvx_search_score and the indexed cvx_deep_hits probe.

create or replace function public.cx_search_conversations(
  p_search text,
  p_deep boolean default false,
  p_since text default '30d',
  p_lanes text[] default null,
  p_agent_ids uuid[] default null,
  p_exclude_source_features text[] default '{}'::text[],
  p_include_source_features text[] default '{}'::text[],
  p_include_source_apps text[] default '{}'::text[],
  p_include_empty_source boolean default false,
  p_origin_classes text[] default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  id uuid,
  title text,
  description text,
  status text,
  message_count integer,
  is_favorite boolean,
  exclude_from_kg boolean,
  initial_agent_id uuid,
  last_model_id uuid,
  source_app text,
  source_feature text,
  origin_class text,
  created_at timestamptz,
  updated_at timestamptz,
  last_activity_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_deep boolean := public.cvx_search_is_deep(v_search, p_deep);
begin
  if v_uid is null then
    raise exception 'cx_search_conversations: not authenticated';
  end if;
  if v_search is null then return; end if;

  return query
  with deep_hits as (
    select h as conversation_id
    from public.cvx_deep_hits(v_search) as h
    where v_deep
  ),
  filtered as (
    select
      c.*,
      coalesce(ues.is_favorite, false) as s_is_favorite,
      cs.provider_session_id as s_provider_session_id,
      cs.metadata->>'workspace_name' as s_workspace_name,
      public.cvx_provider_account_display(cs.metadata) as s_provider_account
    from chat.conversation c
    left join platform.user_entity_state ues
      on ues.user_id = v_uid
     and ues.entity_type = 'conversation'
     and ues.entity_id = c.id
    left join lateral (
      select b.provider_session_id, b.metadata
      from chat.coding_session b
      where b.conversation_id = c.id and b.deleted_at is null
      order by b.last_seen_at desc nulls last, b.created_at desc, b.id
      limit 1
    ) cs on true
    where c.created_by = v_uid
      and c.deleted_at is null
      and c.is_ephemeral is false
      and (p_lanes is null or chat.conversation_lane(
        c.source_app, c.source_feature, c.origin_class, c.conversation_type
      ) = any(p_lanes))
      and (p_agent_ids is null or c.initial_agent_id = any(p_agent_ids))
      and (
        coalesce(array_length(p_exclude_source_features, 1), 0) = 0
        or (
          c.source_feature is not null
          and not (c.source_feature = any(p_exclude_source_features))
        )
      )
      and (
        (
          coalesce(array_length(p_include_source_features, 1), 0) = 0
          and coalesce(array_length(p_include_source_apps, 1), 0) = 0
          and not coalesce(p_include_empty_source, false)
        )
        or c.source_feature = any(coalesce(p_include_source_features, '{}'::text[]))
        or c.source_app = any(coalesce(p_include_source_apps, '{}'::text[]))
        or (coalesce(p_include_empty_source, false) and nullif(c.source_feature, '') is null)
      )
      and (p_origin_classes is null or c.origin_class = any(p_origin_classes))
  ),
  active as (
    select
      f.*,
      greatest(
        coalesce(lm.last_at, f.created_at),
        f.created_at
      ) as s_last_activity
    from filtered f
    left join lateral (
      select m.created_at as last_at
      from chat.message m
      where m.conversation_id = f.id
        and m.deleted_at is null
        and m.is_visible_to_user is true
      order by m.created_at desc
      limit 1
    ) lm on true
    where p_since = 'all'
       or p_since is null
       or greatest(coalesce(lm.last_at, f.created_at), f.created_at)
          >= public.agx_since_bucket(p_since)
  ),
  scored as (
    select
      a.*,
      public.cvx_search_score(
        v_search,
        a.id,
        a.title,
        a.description,
        a.s_workspace_name,
        a.source_feature,
        a.source_app,
        a.s_provider_account,
        a.s_provider_session_id,
        a.id in (select d.conversation_id from deep_hits d)
      ) as s_score
    from active a
  ),
  matched as (
    select s.*, count(*) over () as s_total
    from scored s
    where s.s_score > 0
  )
  select
    m.id,
    m.title,
    m.description,
    m.status,
    m.message_count,
    m.s_is_favorite,
    m.exclude_from_kg,
    m.initial_agent_id,
    m.last_model_id,
    m.source_app,
    m.source_feature,
    m.origin_class,
    m.created_at,
    m.updated_at,
    m.s_last_activity,
    m.s_total
  from matched m
  order by m.s_score desc, m.s_is_favorite desc, m.s_last_activity desc, m.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

comment on function public.cx_search_conversations(
  text, boolean, text, text[], uuid[], text[], text[], text[], boolean,
  text[], integer, integer
) is
  'Ranked conversation-sidebar search for the signed-in owner. Preserves lane, source and agent filters; searches indexed message bodies only when deep is requested or the shared identifier rule enables it.';

grant execute on function public.cx_search_conversations(
  text, boolean, text, text[], uuid[], text[], text[], text[], boolean,
  text[], integer, integer
) to authenticated, service_role;
