-- chair-step: the inverse of migrations/campaign/drilltoolfacts_c_the_refetch_views_read_the_stored_facts.sql (lane DRILL-TOOLFACTS) — puts back the previous bodies of chat.vw_tool_refetch and chat._tool_call_facts (pg_get_viewdef from production, 2026-10-07), which recompute every repeat from the whole history on read. Same columns; no row is touched. Apply BEFORE the inverse of file 2.
-- lane: DRILL-TOOLFACTS
-- lock: platform

set lock_timeout = '3s';

create or replace view chat.vw_tool_refetch with (security_invoker = true) as
 WITH base AS (
         SELECT tc.id,
            tc.conversation_id,
            tc.tool_name,
            tc.arguments,
            tc.call_id,
            tc.iteration,
            tc.created_at,
            tc.output_chars,
            md5(tc.output) AS out_hash,
            tc.output IS NOT NULL AS has_output,
            md5(tc.arguments::text) AS args_hash,
            tc.error_type,
            tc.user_request_id,
            td.side_effect_class,
            row_number() OVER (PARTITION BY tc.conversation_id ORDER BY tc.created_at, tc.id) AS conv_seq
           FROM chat.tool_call tc
             LEFT JOIN tool.definition td ON td.name = tc.tool_name AND td.deleted_at IS NULL
          WHERE tc.deleted_at IS NULL AND tc.arguments IS NOT NULL AND (tc.tool_type = ANY (ARRAY['local'::text, 'agent'::text, 'external'::text])) AND (COALESCE(td.side_effect_class, ''::text) <> ALL (ARRAY['browser_session'::text, 'external_write'::text, 'sends_to_human'::text, 'moves_money'::text])) AND (COALESCE(tc.arguments ->> 'action'::text, ''::text) <> ALL (ARRAY['screenshot'::text, 'navigate'::text, 'scroll'::text, 'click'::text, 'close'::text, 'get_element'::text, 'type'::text, 'update_row'::text, 'delete_row'::text, 'insert_row'::text, 'add_row'::text, 'create'::text, 'update'::text, 'delete'::text, 'upsert'::text, 'run'::text, 'merge'::text, 'patch'::text, 'write'::text, 'dismiss_handoff'::text]))
        ), calls AS (
         SELECT b.id,
            b.conversation_id,
            b.tool_name,
            b.arguments,
            b.call_id,
            b.iteration,
            b.created_at,
            b.output_chars,
            b.out_hash,
            b.has_output,
            b.args_hash,
            b.error_type,
            b.user_request_id,
            b.side_effect_class,
            b.conv_seq,
            row_number() OVER w AS nth,
            first_value(b.id) OVER w AS first_tool_call_id,
            first_value(b.call_id) OVER w AS first_call_id,
            first_value(b.created_at) OVER w AS first_at,
            first_value(b.iteration) OVER w AS first_iteration,
            first_value(b.output_chars) OVER w AS first_output_chars,
            first_value(b.out_hash) OVER w AS first_out_hash,
            first_value(b.has_output) OVER w AS first_has_output,
            first_value(b.conv_seq) OVER w AS first_conv_seq
           FROM base b
          WINDOW w AS (PARTITION BY b.conversation_id, b.tool_name, b.args_hash ORDER BY b.created_at, b.id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
        )
 SELECT conversation_id,
    tool_name,
    arguments,
    id AS repeat_tool_call_id,
    call_id AS repeat_call_id,
    created_at AS repeat_at,
    iteration AS repeat_iteration,
    output_chars AS repeat_output_chars,
    first_tool_call_id,
    first_call_id,
    first_at,
    first_iteration,
    first_output_chars,
    (nth - 1)::integer AS prior_identical_calls,
        CASE
            WHEN has_output AND first_has_output THEN out_hash = first_out_hash
            ELSE NULL::boolean
        END AS same_data,
    (conv_seq - first_conv_seq - 1)::integer AS gap_calls,
    EXTRACT(epoch FROM created_at - first_at)::numeric(14,3) AS gap_secs,
    iteration - first_iteration AS gap_iterations,
        CASE
            WHEN NOT (EXISTS ( SELECT 1
               FROM chat.request r
              WHERE r.conversation_id = c.conversation_id AND r.user_request_id = c.user_request_id AND r.iteration = c.iteration AND r.trim_summary IS NOT NULL)) THEN NULL::boolean
            ELSE (EXISTS ( SELECT 1
               FROM chat.request r,
                LATERAL jsonb_array_elements(COALESCE(r.trim_summary -> 'rewritten_blocks'::text, '[]'::jsonb)) b(value)
              WHERE r.conversation_id = c.conversation_id AND r.created_at >= c.first_at AND r.created_at <= c.created_at AND (b.value ->> 'call_id'::text) = c.first_call_id))
        END AS first_result_trimmed_before_repeat
   FROM calls c
  WHERE nth > 1 AND (COALESCE(error_type, ''::text) <> ALL (ARRAY['duplicate'::text, 'loop_detected'::text])) AND COALESCE(first_output_chars, 0) > 0;

comment on view chat.vw_tool_refetch is
  'Tool calls that repeat an earlier identical call in the same conversation: same_data (md5 of stored output), gap in calls/seconds/iterations, and whether the first result had been trimmed from context before the repeat. See db/migrations/0604.';

create or replace view chat._tool_call_facts with (security_invoker = true) as
 SELECT tc.id AS tool_call_id,
    tc.conversation_id,
    tc.tool_name,
    tc.created_at,
    c.initial_agent_id AS agent_id,
    c.created_by AS person_id,
    COALESCE(tc.output_chars, 0) AS output_chars,
    (r.repeat_tool_call_id IS NOT NULL)::integer AS is_repeat,
    COALESCE(r.same_data, false)::integer AS same_data,
    (r.repeat_tool_call_id IS NOT NULL AND r.same_data = false)::integer AS new_data,
    (r.repeat_tool_call_id IS NOT NULL AND r.same_data IS NULL)::integer AS unknown_data,
    COALESCE(r.first_result_trimmed_before_repeat, false)::integer AS after_trim,
        CASE
            WHEN r.same_data THEN COALESCE(r.first_output_chars, 0)
            ELSE 0
        END AS chars_refetched_same_data,
    r.gap_calls,
    r.gap_secs
   FROM chat.tool_call tc
     LEFT JOIN chat.vw_tool_refetch r ON r.repeat_tool_call_id = tc.id
     LEFT JOIN chat.conversation c ON c.id = tc.conversation_id
  WHERE tc.deleted_at IS NULL AND (tc.tool_type = ANY (ARRAY['local'::text, 'agent'::text, 'external'::text]));

comment on view chat._tool_call_facts is
  'DRILL-SERVER-2: one row per tool call the re-fetch report counts, with whether it repeated an earlier identical call (chat.vw_tool_refetch) — what the drill definition tool_refetch counts. Server-only (System machinery, token tool_call_facts); read only by the drill door''s definer step with its lane rule compiled in.';
