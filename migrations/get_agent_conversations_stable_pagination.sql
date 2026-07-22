-- get_agent_conversations: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- FIX: append `c.id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.get_agent_conversations(p_agent_id uuid, p_version_number integer DEFAULT NULL::integer, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(conversation_id uuid, title text, description text, status text, message_count smallint, last_model_id uuid, initial_agent_version_id uuid, agent_version_number integer, source_app text, source_feature text, created_at timestamp with time zone, updated_at timestamp with time zone, is_favorite boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    c.id, c.title, c.description, c.status, c.message_count,
    c.last_model_id, c.initial_agent_version_id,
    av.version_number,
    c.source_app, c.source_feature,
    c.created_at, c.updated_at,
    c.is_favorite
  from chat.conversation c
  left join agent.definition_version av on av.id = c.initial_agent_version_id
  where c.initial_agent_id = p_agent_id
    and c.deleted_at is null
    and (p_version_number is null or av.version_number = p_version_number)
  -- `c.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  order by c.updated_at desc, c.id desc
  limit p_limit offset p_offset;
$function$;
