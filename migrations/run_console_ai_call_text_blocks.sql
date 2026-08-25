-- KI-049 follow-up: preserve the applied attribution migration's immutable
-- checksum while teaching the detail RPC to skip empty thinking blocks and
-- return the first content block that actually carries text.

create or replace function public.admin_list_run_ai_calls(
  p_execution_kind text,
  p_execution_id uuid
)
returns table(
  id uuid,
  conversation_id uuid,
  iteration smallint,
  model text,
  status text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost numeric,
  api_duration_ms integer,
  total_duration_ms integer,
  created_at timestamptz,
  prompt_text text,
  output_text text,
  error jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'chat', 'pg_temp'
as $function$
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
    coalesce(s.model, s.unified_payload -> 'config' ->> 'model') as model,
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
        ) as c(elem)
        where t.elem ->> 'role' = 'user'
          and coalesce(c.elem ->> 'text', '') <> ''
        order by t.ord desc
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
        ) as t(elem)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(t.elem -> 'content') = 'array'
               then t.elem -> 'content' else '[]'::jsonb end
        ) as c(elem)
        where t.elem ->> 'role' = 'assistant'
          and coalesce(c.elem ->> 'text', '') <> ''
        limit 1
      ),
      (
        select t.elem ->> 'content'
        from jsonb_array_elements(
          coalesce(s.response_payload -> 'messages', '[]'::jsonb)
        ) as t(elem)
        where t.elem ->> 'role' = 'assistant'
          and jsonb_typeof(t.elem -> 'content') = 'string'
        limit 1
      )
    ) as output_text,
    r.error
  from chat.request r
  left join chat.request_snapshot s on s.cx_request_id = r.id
  where r.execution_kind = p_execution_kind
    and r.execution_id = p_execution_id
    and r.deleted_at is null
  order by r.created_at asc;
end;
$function$;

comment on function public.admin_list_run_ai_calls(text, uuid) is
  'KI-049 Run Console detail: every chat.request row for one attributed run, with prompt/output text recovered from the first non-empty text block in chat.request_snapshot. Admin-gated.';

grant execute on function public.admin_list_run_ai_calls(text, uuid) to authenticated;
