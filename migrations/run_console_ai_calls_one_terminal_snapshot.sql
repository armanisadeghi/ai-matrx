-- based-on: public.admin_list_run_ai_calls(text, uuid) c52881849baf35444ee153c6a0f5a6e9ea6e82b113ca3e1fdadbd967505edb63
--
-- Run history (KI-049 follow-up, 2026-09-14): ONE card per AI call.
--
-- The detail read joined chat.request to EVERY chat.request_snapshot row for
-- that request. A call the executor retried writes one snapshot per attempt
-- (live: request a09f817a-… rendered three identical failed cards), so Run
-- history showed the same call several times. Pick the call's TERMINAL
-- snapshot deterministically instead:
--   1. a snapshot that carries a model response (`messages`) beats an error
--      snapshot of the same call;
--   2. then the latest attempt (`created_at`);
--   3. then `id` — the unique tie-break, so the pick never flips between reads.
-- The outer ORDER BY also ends in a unique column now.
--
-- Output text keeps its block order (WITH ORDINALITY) so "the first block that
-- carries text" is the same block on every read.

CREATE OR REPLACE FUNCTION public.admin_list_run_ai_calls(p_execution_kind text, p_execution_id uuid)
 RETURNS TABLE(id uuid, conversation_id uuid, iteration smallint, model text, status text, input_tokens integer, output_tokens integer, total_tokens integer, cost numeric, api_duration_ms integer, total_duration_ms integer, created_at timestamp with time zone, prompt_text text, output_text text, error jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'chat', 'pg_temp'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'admin_list_run_ai_calls: admin only';
  end if;
  if p_execution_kind is null or p_execution_id is null then
    raise exception 'admin_list_run_ai_calls: execution_kind and execution_id are required';
  end if;

  return query
  select
    r.id,
    r.conversation_id,
    r.iteration,
    -- The snapshot stores the model's UUID; Run history must show what a human
    -- calls it. Resolve to ai.model_definition, and fall back to the stored
    -- value verbatim when it is not a resolvable id (older rows, raw slugs).
    coalesce(
      (
        select md.common_name::text
        from ai.model_definition md
        where coalesce(s.model, s.unified_payload -> 'config' ->> 'model') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and md.id = coalesce(s.model, s.unified_payload -> 'config' ->> 'model')::uuid
      ),
      coalesce(s.model, s.unified_payload -> 'config' ->> 'model')
    ) as model,
    r.status,
    r.input_tokens,
    r.output_tokens,
    r.total_tokens,
    r.cost,
    r.api_duration_ms,
    r.total_duration_ms,
    r.created_at,
    -- Never assume content[0] carries text. Structured-output requests may
    -- put an empty extended-thinking block first and the actual answer later.
    coalesce(
      (
        select c.elem ->> 'text'
        from jsonb_array_elements(
          coalesce(s.unified_payload -> 'config' -> 'messages', '[]'::jsonb)
        ) with ordinality as t(elem, ord)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(t.elem -> 'content') = 'array'
               then t.elem -> 'content' else '[]'::jsonb end
        ) with ordinality as c(elem, cord)
        where t.elem ->> 'role' = 'user'
          and coalesce(c.elem ->> 'text', '') <> ''
        order by t.ord desc, c.cord asc
        limit 1
      ),
      (
        select t.elem ->> 'content'
        from jsonb_array_elements(
          coalesce(s.unified_payload -> 'config' -> 'messages', '[]'::jsonb)
        ) with ordinality as t(elem, ord)
        where t.elem ->> 'role' = 'user'
          and jsonb_typeof(t.elem -> 'content') = 'string'
        order by t.ord desc
        limit 1
      )
    ) as prompt_text,
    coalesce(
      (
        select c.elem ->> 'text'
        from jsonb_array_elements(
          coalesce(s.response_payload -> 'messages', '[]'::jsonb)
        ) with ordinality as t(elem, ord)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(t.elem -> 'content') = 'array'
               then t.elem -> 'content' else '[]'::jsonb end
        ) with ordinality as c(elem, cord)
        where t.elem ->> 'role' = 'assistant'
          and coalesce(c.elem ->> 'text', '') <> ''
        order by t.ord asc, c.cord asc
        limit 1
      ),
      (
        select t.elem ->> 'content'
        from jsonb_array_elements(
          coalesce(s.response_payload -> 'messages', '[]'::jsonb)
        ) with ordinality as t(elem, ord)
        where t.elem ->> 'role' = 'assistant'
          and jsonb_typeof(t.elem -> 'content') = 'string'
        order by t.ord asc
        limit 1
      )
    ) as output_text,
    r.error
  from chat.request r
  left join lateral (
    select s1.*
    from chat.request_snapshot s1
    where s1.cx_request_id = r.id
      and s1.deleted_at is null
    order by coalesce(s1.response_payload ? 'messages', false) desc,
             s1.created_at desc,
             s1.id desc
    limit 1
  ) s on true
  where r.execution_kind = p_execution_kind
    and r.execution_id = p_execution_id
    and r.deleted_at is null
  order by r.created_at asc, r.id asc;
end;
$function$
;
