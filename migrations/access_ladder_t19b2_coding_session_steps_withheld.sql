-- based-on: platform.share_link_children(text, uuid) a4c29fe7ace3df370138a619dbc395076152d0d76a6a8208d9e3bf857be15b38
--
-- Access ladder T-19b (step 2) — a shared chat never serves a coding session's
-- raw logs.
--
-- chat.tool_call also holds every tool step a mirrored coding session ran
-- (tool_type = 'coding_agent': Bash, Read, Edit, … — the bulk of the table).
-- Their arguments and outputs are the session's raw log: shell output,
-- file contents, environment. T-19b's first step cleaned tool arguments and
-- outputs by key and by value shape; a raw log cannot be cleaned that way, so
-- a coding-session step is served as name + status only (`withheld: true`),
-- exactly like a credential tool. The rest of the projection is unchanged.

CREATE OR REPLACE FUNCTION platform.share_link_children(p_resource_type text, p_resource_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_limit constant integer := 500;
  v_output_cap constant integer := 60000;
  v_total integer;
  v_messages jsonb;
BEGIN
  IF p_resource_type = 'conversation' THEN
    SELECT count(*) INTO v_total
      FROM chat.message m
     WHERE m.conversation_id = p_resource_id
       AND m.deleted_at IS NULL
       AND COALESCE(m.is_visible_to_user, true)
       AND COALESCE(m.status, 'active') IN ('active', 'edited')
       AND m.role IN ('user', 'assistant');

    SELECT COALESCE(jsonb_agg(msg ORDER BY pos), '[]'::jsonb) INTO v_messages
    FROM (
      SELECT m.position AS pos,
             jsonb_build_object(
               'id', m.id,
               'role', m.role,
               'created_at', m.created_at,
               'blocks', COALESCE((
                 SELECT jsonb_agg(pb ORDER BY ord)
                 FROM (
                   SELECT b.ord,
                     CASE b.blk->>'type'
                       WHEN 'text' THEN
                         CASE WHEN COALESCE(b.blk->>'text', '') <> ''
                              THEN jsonb_build_object('type', 'text', 'text', b.blk->>'text') END
                       WHEN 'tool_call' THEN (
                         SELECT CASE
                           WHEN platform.share_tool_is_withheld(COALESCE(tc.tool_name, b.blk->>'name'))
                                OR tc.tool_type = 'coding_agent' THEN
                             jsonb_build_object(
                               'type', 'tool',
                               'call_id', COALESCE(b.blk->>'call_id', b.blk->>'id'),
                               'name', COALESCE(tc.tool_name, b.blk->>'name', 'tool'),
                               'name_as_called', tc.tool_name_as_called,
                               'status', COALESCE(tc.status, 'completed'),
                               'is_error', COALESCE(tc.is_error, false),
                               'started_at', tc.started_at,
                               'completed_at', tc.completed_at,
                               'withheld', true)
                           ELSE
                             jsonb_build_object(
                               'type', 'tool',
                               'call_id', COALESCE(b.blk->>'call_id', b.blk->>'id'),
                               'name', COALESCE(tc.tool_name, b.blk->>'name', 'tool'),
                               'name_as_called', tc.tool_name_as_called,
                               'status', COALESCE(tc.status, 'completed'),
                               'is_error', COALESCE(tc.is_error, false),
                               'error_type', tc.error_type,
                               'error_message', platform.share_redact(to_jsonb(tc.error_message)),
                               'started_at', tc.started_at,
                               'completed_at', tc.completed_at,
                               'arguments', platform.share_redact(
                                 CASE WHEN jsonb_typeof(tc.arguments) = 'object' AND tc.arguments <> '{}'::jsonb
                                      THEN tc.arguments
                                      ELSE COALESCE(b.blk->'arguments', '{}'::jsonb) END),
                               'output', CASE
                                 WHEN tc.output IS NULL THEN NULL
                                 WHEN length(tc.output) > v_output_cap THEN NULL
                                 ELSE platform.share_redact(to_jsonb(tc.output)) END,
                               'output_preview', CASE
                                 WHEN tc.output IS NOT NULL AND length(tc.output) > v_output_cap
                                 THEN platform.share_redact(tc.output_preview) END,
                               'output_truncated', tc.output IS NOT NULL AND length(tc.output) > v_output_cap,
                               'withheld', false)
                         END
                         FROM (SELECT 1) one
                         LEFT JOIN LATERAL (
                           SELECT t.*
                             FROM chat.tool_call t
                            WHERE t.conversation_id = p_resource_id
                              AND t.call_id = COALESCE(b.blk->>'call_id', b.blk->>'id')
                              AND t.deleted_at IS NULL
                            ORDER BY t.created_at DESC
                            LIMIT 1
                         ) tc ON true)
                       WHEN 'media' THEN
                         jsonb_build_object(
                           'type', 'media',
                           'kind', COALESCE(b.blk->>'kind', 'file'),
                           'title', COALESCE(b.blk->'metadata'->>'display_title', b.blk->>'file_name'),
                           'mime_type', b.blk->>'mime_type',
                           'size_bytes', b.blk->'size_bytes',
                           'width', b.blk->'width',
                           'height', b.blk->'height',
                           'file_id', CASE WHEN COALESCE(b.blk->>'file_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                           THEN b.blk->>'file_id' END,
                           'url', (
                             SELECT u FROM unnest(ARRAY[b.blk->>'cdn_url', b.blk->>'url']) u
                              WHERE u LIKE 'https://cdn.matrxserver.com/%'
                              LIMIT 1))
                       WHEN 'decision_questions' THEN
                         jsonb_build_object('type', 'decision_questions',
                           'payload', b.blk - 'metadata')
                       WHEN 'decision_answers' THEN
                         jsonb_build_object('type', 'decision_answers',
                           'payload', b.blk - 'metadata' - 'usage' - 'cost_usd')
                       WHEN 'speech_script' THEN
                         jsonb_build_object('type', 'speech_script',
                           'payload', b.blk - 'metadata')
                       ELSE NULL
                     END AS pb
                   FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(m.content) = 'array' THEN m.content ELSE '[]'::jsonb END
                        ) WITH ORDINALITY AS b(blk, ord)
                 ) projected
                 WHERE pb IS NOT NULL
               ), '[]'::jsonb)
             ) AS msg
        FROM chat.message m
       WHERE m.conversation_id = p_resource_id
         AND m.deleted_at IS NULL
         AND COALESCE(m.is_visible_to_user, true)
         AND COALESCE(m.status, 'active') IN ('active', 'edited')
         AND m.role IN ('user', 'assistant')
       ORDER BY m.position
       LIMIT v_limit
    ) rows;

    RETURN jsonb_build_object(
      'kind', 'conversation_messages',
      'messages', v_messages,
      'total', v_total,
      'truncated', v_total > v_limit);
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION platform.share_link_children(text, uuid) IS
  'Per-type projection of what an Anyone-link holder sees beneath a shared record (children inherit their parent). SECURITY INVOKER: its reach beyond the caller''s RLS exists only inside public.resolve_share_token, after every token check. conversation → visible user/assistant messages: text; tool steps with CLEANED arguments/output (platform.share_redact; credential/raw-log tools and every coding-session tool step withheld); media with file_id for the token-scoped byte route; decision / speech-script payloads. Access ladder T-19, T-19b.';

